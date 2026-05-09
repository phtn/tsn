import { getSupportedSite } from './siteConfig'

const SIDE_PANEL_PATH = 'sidepanel.html'

// ──────────────────────────────────────────────────────────────────────────
// CDP-based trusted click (bypasses isTrusted checks in Evolution's framework)
// ──────────────────────────────────────────────────────────────────────────

interface TrustedClickResult {
  ok: boolean
  error?: string
  x?: number
  y?: number
}

const attachedTabs = new Set<number>()

async function ensureDebuggerAttached(tabId: number): Promise<void> {
  if (attachedTabs.has(tabId)) return
  await chrome.debugger.attach({ tabId }, '1.3')
  attachedTabs.add(tabId)
  await chrome.debugger.sendCommand({ tabId }, 'DOM.enable', {})
  await chrome.debugger.sendCommand({ tabId }, 'Page.enable', {})
}

chrome.debugger.onDetach.addListener(({ tabId }) => {
  if (tabId !== undefined) attachedTabs.delete(tabId)
})

// Pending coord lookups: any frame's content script may resolve these by sending
// { type: 'EVO_COORDS_FOUND', requestId, x, y } after walking the frame chain up
// to the top viewport.
interface PendingCoordRequest {
  resolve: (coords: { x: number; y: number; frame: string } | null) => void
  timer: ReturnType<typeof setTimeout>
}
const pendingCoordRequests = new Map<string, PendingCoordRequest>()

function newRequestId(): string {
  return `evo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function locateElementInTopViewport(
  tabId: number,
  selector: string,
  timeoutMs = 1500
): Promise<{ x: number; y: number; frame: string } | null> {
  const requestId = newRequestId()

  const coordsPromise = new Promise<{ x: number; y: number; frame: string } | null>((resolve) => {
    const timer = setTimeout(() => {
      if (pendingCoordRequests.has(requestId)) {
        pendingCoordRequests.delete(requestId)
        resolve(null)
      }
    }, timeoutMs)
    pendingCoordRequests.set(requestId, { resolve, timer })
  })

  let frames: chrome.webNavigation.GetAllFrameResultDetails[] | null = null
  try {
    frames = await chrome.webNavigation.getAllFrames({ tabId })
  } catch {
    frames = null
  }

  if (!frames || frames.length === 0) {
    // Fall back to top frame only
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'EVO_FIND_AND_REPORT', selector, requestId })
    } catch {
      // ignore
    }
  } else {
    for (const frame of frames) {
      try {
        await chrome.tabs.sendMessage(
          tabId,
          { type: 'EVO_FIND_AND_REPORT', selector, requestId },
          { frameId: frame.frameId }
        )
      } catch {
        // Some frames (chrome://, devtools) won't have our content script — ignore.
      }
    }
  }

  return coordsPromise
}

async function dispatchTrustedClickAt(tabId: number, x: number, y: number): Promise<void> {
  const base = { x, y, button: 'left' as const, clickCount: 1, buttons: 1 }
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { ...base, type: 'mouseMoved' })
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { ...base, type: 'mousePressed' })
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { ...base, type: 'mouseReleased' })
}

/**
 * Asks every content-script frame which chip is currently active in Evolution.
 * Returns the data-value of the first frame that reports a match, or null when
 * no frame can determine the selection state (graceful no-op).
 */
async function getEvolutionSelectedChip(tabId: number): Promise<number | null> {
  let frames: chrome.webNavigation.GetAllFrameResultDetails[] | null = null
  try {
    frames = await chrome.webNavigation.getAllFrames({ tabId })
  } catch {
    frames = null
  }

  const framesToCheck = frames ?? ([] as chrome.webNavigation.GetAllFrameResultDetails[])

  for (const frame of framesToCheck) {
    try {
      const response = await new Promise<{ value: number | null } | null>((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: 'EVO_GET_SELECTED_CHIP' }, { frameId: frame.frameId }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve(null)
          } else {
            resolve(resp as { value: number | null } | null)
          }
        })
      })
      if (response?.value != null) return response.value
    } catch {
      // Frame has no content script — skip
    }
  }
  return null
}

async function trustedClickBySelector(tabId: number, selector: string): Promise<TrustedClickResult> {
  try {
    await ensureDebuggerAttached(tabId)

    const coords = await locateElementInTopViewport(tabId, selector)
    if (!coords) {
      return { ok: false, error: `Element not found in any frame: ${selector}` }
    }

    await dispatchTrustedClickAt(tabId, coords.x, coords.y)
    const button = selector.split('"')[1]

    console.log('[EVO] ', button === 'double-button' ? 'DB' : button, `(${coords.x}, ${coords.y})`)
    return { ok: true, x: coords.x, y: coords.y }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

async function getTabWithUrl(tabId: number, fallback?: chrome.tabs.Tab): Promise<chrome.tabs.Tab | null> {
  if (fallback?.url) {
    return fallback
  }

  try {
    return await chrome.tabs.get(tabId)
  } catch (error) {
    console.error('Failed to read tab details:', error)
    return null
  }
}

async function closeSidePanelForTab(tabId: number): Promise<void> {
  if (typeof chrome.sidePanel.close !== 'function') {
    return
  }

  try {
    await chrome.sidePanel.close({ tabId })
  } catch (error) {
    console.debug('Failed to close side panel:', error)
  }
}

async function updateSidePanel(tabId: number, url?: string | null): Promise<void> {
  const site = getSupportedSite(url)

  if (!site) {
    await chrome.sidePanel.setOptions({ tabId, enabled: false })
    await closeSidePanelForTab(tabId)
    return
  }

  await chrome.sidePanel.setOptions({ tabId, path: SIDE_PANEL_PATH, enabled: true })
}

function broadcastUrlStatus(tab?: chrome.tabs.Tab): void {
  const site = getSupportedSite(tab?.url)

  chrome.runtime.sendMessage(
    {
      type: 'URL_STATUS',
      isTargetSite: Boolean(site),
      site: site?.key ?? null,
      siteLabel: site?.label ?? null,
      url: tab?.url ?? null
    },
    () => {
      const message = chrome.runtime.lastError?.message

      if (message && !message.includes('Could not establish connection')) {
        console.warn('Failed to broadcast URL status:', message)
      }
    }
  )
}

async function syncTabStatus(tabId: number, fallback?: chrome.tabs.Tab): Promise<void> {
  const tab = await getTabWithUrl(tabId, fallback)
  if (!tab) {
    return
  }

  try {
    await updateSidePanel(tabId, tab.url)
    broadcastUrlStatus(tab)
  } catch (error) {
    console.error('Failed to sync tab status:', error)
  }
}

async function syncActiveTabStatus(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const activeTab = tabs[0]

  if (!activeTab?.id) {
    return
  }

  await syncTabStatus(activeTab.id, activeTab)
}

async function configureSidePanelDefaults(): Promise<void> {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  await chrome.sidePanel.setOptions({ path: SIDE_PANEL_PATH, enabled: false })
}

async function initializeSidePanel(): Promise<void> {
  try {
    await configureSidePanelDefaults()
    await syncActiveTabStatus()
  } catch (error) {
    console.error('Failed to initialize side panel:', error)
  }
}

chrome.action.onClicked.addListener((clickedTab) => {
  if (!clickedTab.id) {
    return
  }

  void syncTabStatus(clickedTab.id, clickedTab)
})

chrome.runtime.onInstalled.addListener(() => {
  void initializeSidePanel()
})

chrome.runtime.onStartup.addListener(() => {
  void initializeSidePanel()
})

chrome.tabs.onUpdated.addListener(async (tabId: number, info: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) => {
  if (!tab.url) {
    return
  }

  await updateSidePanel(tabId, tab.url)

  if (info.status === 'complete') {
    broadcastUrlStatus(tab)
  }
})

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await syncTabStatus(tabId)
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'REQUEST_URL_STATUS') {
    void syncActiveTabStatus()
    return
  }

  if (message.type === 'EVO_COORDS_FOUND') {
    const { requestId, x, y, frame } = message as {
      requestId: string
      x: number
      y: number
      frame: string
    }
    const pending = pendingCoordRequests.get(requestId)
    if (pending) {
      clearTimeout(pending.timer)
      pendingCoordRequests.delete(requestId)
      pending.resolve({ x, y, frame })
    }
    return
  }

  if (message.type === 'CLICK_EVOLUTION_ELEMENT') {
    void (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
        const activeTab = tabs[0]
        if (!activeTab?.id) {
          sendResponse({ ok: false, error: 'No active tab' })
          return
        }
        const result = await trustedClickBySelector(activeTab.id, message.selector)
        sendResponse(result)
      } catch (error) {
        sendResponse({ ok: false, error: String(error) })
      }
    })()
    return true
  }

  if (message.type === 'PLACE_EVOLUTION_BETS') {
    void (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
        const activeTab = tabs[0]
        if (!activeTab?.id) {
          sendResponse({ ok: false, error: 'No active tab' })
          return
        }

        const {
          chipValue,
          numbers,
          doubleCount = 0
        } = message as {
          chipValue: number
          numbers: number[]
          doubleCount?: number
        }

        const placed: number[] = []
        let missed: number[] = []

        console.log(`[EVO] Bet Loop — ${numbers.length} spots, chip ${chipValue}`)

        for (const num of numbers) {
          const result = await trustedClickBySelector(activeTab.id, `[data-bet-spot-id="${num}"]`)
          if (result.ok) {
            placed.push(num)
          } else {
            missed.push(num)
            console.warn(`[WW] Bet spot ${num} missed — ${result.error ?? 'unknown error'}`)
          }
          await new Promise((r) => setTimeout(r, 140))
        }

        console.log(`[EVO] Placed: ${placed}`)

        // ── Retry pass — reattempt any missed spots up to 3 times ─────────────
        for (let attempt = 1; attempt <= 3 && missed.length > 0; attempt++) {
          const toRetry = [...missed]
          missed = []
          await new Promise((r) => setTimeout(r, 300))
          console.log(`[EVO] retry pass ${attempt} — ${toRetry.length} spots`)
          for (const num of toRetry) {
            const result = await trustedClickBySelector(activeTab.id, `[data-bet-spot-id="${num}"]`)
            if (result.ok) {
              placed.push(num)
              console.log(`[EVO] retry ✓ spot ${num}`)
            } else {
              missed.push(num)
              console.warn(`[EVO] retry ${attempt} failed spot ${num} — ${result.error ?? 'unknown error'}`)
            }
            await new Promise((r) => setTimeout(r, 150))
          }
        }

        // ── Double-button pass ─────────────────────────────────────────────────
        // For rounds with a 2ⁿ multiplier (round 3 = 2×, 4 = 4×, 5 = 8×) the
        // caller passes doubleCount = log₂(multiplier) so we can double all bets
        // in one sweep instead of repeating every slot click N times.
        const doublesApplied: number[] = []
        for (let i = 0; i < doubleCount; i++) {
          const dr = await trustedClickBySelector(activeTab.id, '[data-role="double-button"]')
          doublesApplied.push(i + 1)
          if (!dr.ok) {
            console.warn(`[WW] Double click ${i + 1}/${doubleCount} failed: ${dr.error}`)
          }
          // Give Evolution's animation time to register before the next double.
          await new Promise((r) => setTimeout(r, 220))
        }

        sendResponse({ ok: placed.length > 0, placed, missed, doublesApplied })
      } catch (error) {
        sendResponse({ ok: false, error: String(error) })
      }
    })()
    return true
  }

  if (message.type === 'PLACE_BET88_BET') {
    void (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
        const activeTab = tabs[0]
        if (!activeTab?.id) {
          sendResponse({ ok: false, error: 'No active tab' })
          return
        }
        const result = await chrome.tabs.sendMessage(activeTab.id, { type: 'PLACE_BET88_BET' })
        sendResponse(result)
      } catch (error) {
        sendResponse({ ok: false, error: String(error) })
      }
    })()
    return true
  }
})
