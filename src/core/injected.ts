;(function () {
  'use strict'

  const originalFetch = window.fetch
  const originalWebSocket = window.WebSocket
  const originalXHROpen = XMLHttpRequest.prototype.open
  const originalXHRSend = XMLHttpRequest.prototype.send

  const gameKeywords = [
    'bet',
    'spin',
    'game',
    'play',
    'result',
    'outcome',
    'win',
    'lose',
    'jackpot',
    'bonus',
    'round',
    'turn',
    'deal',
    'draw',
    'roll',
    'limbo',
    'dice',
    'keno',
    'roulette',
    'stake',
    'wheel',
    'winspots'
  ]

  function hasGameKeyword(value: string): boolean {
    const lowerValue = value.toLowerCase()
    return gameKeywords.some((keyword) => lowerValue.includes(keyword))
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }

  function looksLikeBet88Result(value: unknown): boolean {
    return (
      isRecord(value) &&
      (typeof value.roundId === 'number' || typeof value.roundId === 'string') &&
      (typeof value.win === 'boolean' || typeof value.win === 'number')
    )
  }

  function looksLikeStakeBetPayload(value: unknown): boolean {
    return (
      isRecord(value) &&
      typeof value.id === 'string' &&
      typeof value.game === 'string' &&
      isRecord(value.user) &&
      isRecord(value.state)
    )
  }

  function looksLikeEvoRouletteMessage(value: unknown): boolean {
    return (
      isRecord(value) &&
      value.type === 'roulette.winSpots' &&
      typeof value.id === 'string' &&
      isRecord(value.args) &&
      typeof value.args.gameId === 'string' &&
      typeof value.args.code === 'string' &&
      typeof value.args.description === 'string' &&
      isRecord(value.args.winSpots) &&
      typeof value.args.timestamp === 'string' &&
      Array.isArray(value.args.result)
    )
  }

  function looksLikeEvoTableStateMessage(value: unknown): boolean {
    return (
      isRecord(value) && value.type === 'roulette.tableState' && typeof value.id === 'string' && isRecord(value.args)
    )
  }

  function looksLikeLobbyHistoriesMessage(value: unknown): boolean {
    return isRecord(value) && value.type === 'lobby.histories' && isRecord(value.args)
  }

  function looksLikePragmaticRouletteMessage(value: unknown): boolean {
    return (
      isRecord(value) &&
      isRecord(value.gameresult) &&
      typeof value.gameresult.score === 'string' &&
      typeof value.gameresult.pre === 'string' &&
      typeof value.gameresult.megaWin === 'string' &&
      typeof value.gameresult.color === 'string' &&
      typeof value.gameresult.luckyWin === 'string' &&
      typeof value.gameresult.id === 'string' &&
      typeof value.gameresult.time === 'string' &&
      typeof value.gameresult.seq === 'number' &&
      typeof value.gameresult.value === 'string'
    )
  }

  function responseLooksGameRelated(value: unknown, depth = 0): boolean {
    if (depth > 3 || value == null) {
      return false
    }

    if (typeof value === 'string') {
      return hasGameKeyword(value)
    }

    if (
      looksLikeBet88Result(value) ||
      looksLikeStakeBetPayload(value) ||
      looksLikeEvoRouletteMessage(value) ||
      looksLikeEvoTableStateMessage(value) ||
      looksLikeLobbyHistoriesMessage(value) ||
      looksLikePragmaticRouletteMessage(value)
    ) {
      return true
    }

    if (Array.isArray(value)) {
      return value.some((entry) => responseLooksGameRelated(entry, depth + 1))
    }

    if (isRecord(value)) {
      return Object.entries(value).some(([key, entry]) => {
        if (hasGameKeyword(key)) {
          return true
        }

        return responseLooksGameRelated(entry, depth + 1)
      })
    }

    return false
  }

  function isGameRelatedURL(url: string): boolean {
    return hasGameKeyword(url)
  }

  function parseJSON(text: string): unknown {
    try {
      return JSON.parse(text)
    } catch {
      const firstObjectIndex = text.indexOf('{')
      const firstArrayIndex = text.indexOf('[')
      const candidateIndexes = [firstObjectIndex, firstArrayIndex].filter((index) => index >= 0)

      for (const index of candidateIndexes.sort((left, right) => left - right)) {
        const slice = text.slice(index)

        try {
          return JSON.parse(slice)
        } catch {
          continue
        }
      }

      return text
    }
  }

  function captureRequestBody(body?: BodyInit | Document | null): {
    parsed: unknown
    text: string | null
  } {
    if (!body) {
      return { parsed: null, text: null }
    }

    if (typeof body === 'string') {
      return {
        parsed: parseJSON(body),
        text: body
      }
    }

    if (body instanceof URLSearchParams) {
      const text = body.toString()
      return {
        parsed: text,
        text
      }
    }

    if (body instanceof FormData) {
      const parsed = Object.fromEntries(
        Array.from(body.entries()).map(([key, value]) => [key, typeof value === 'string' ? value : '[binary]'])
      )

      return {
        parsed,
        text: JSON.stringify(parsed)
      }
    }

    return {
      parsed: body,
      text: null
    }
  }

  async function captureWebSocketData(data: unknown): Promise<{
    parsed: unknown
    text: string | null
  }> {
    if (typeof data === 'string') {
      return {
        parsed: parseJSON(data),
        text: data
      }
    }

    if (data instanceof Blob) {
      const text = await data.text()

      return {
        parsed: parseJSON(text),
        text
      }
    }

    if (data instanceof ArrayBuffer) {
      const text = new TextDecoder().decode(data)

      return {
        parsed: parseJSON(text),
        text
      }
    }

    if (ArrayBuffer.isView(data)) {
      const text = new TextDecoder().decode(data)

      return {
        parsed: parseJSON(text),
        text
      }
    }

    return {
      parsed: data,
      text: null
    }
  }

  function requestLooksGameRelated(url: string, requestBody: unknown, requestBodyText: string | null): boolean {
    if (isGameRelatedURL(url)) {
      return true
    }

    if (requestBodyText && hasGameKeyword(requestBodyText)) {
      return true
    }

    if (requestBody && responseLooksGameRelated(requestBody)) {
      return true
    }

    return false
  }

  function sendToContentScript(data: unknown): void {
    window.postMessage(
      {
        type: 'CASINO_RESPONSE',
        data
      },
      '*'
    )
  }

  function getFetchMethod(input: RequestInfo | URL, init?: RequestInit): string {
    if (init?.method) {
      return init.method
    }

    if (typeof input === 'object' && 'method' in input && input.method) {
      return input.method
    }

    return 'GET'
  }

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const { parsed: requestBody, text: requestBodyText } = captureRequestBody(init?.body)
    const hintedGameRequest = requestLooksGameRelated(url, requestBody, requestBodyText)

    return originalFetch.call(this, input, init).then(async (response: Response) => {
      try {
        const clonedResponse = response.clone()
        const contentType = response.headers.get('content-type') || ''

        if (!contentType.includes('application/json')) {
          return response
        }

        const responseData = await clonedResponse.json()
        if (!hintedGameRequest && !responseLooksGameRelated(responseData)) {
          return response
        }

        sendToContentScript({
          url,
          method: getFetchMethod(input, init),
          status: response.status,
          data: responseData,
          requestBody,
          timestamp: Date.now()
        })
      } catch (error) {
        console.error('Error intercepting fetch response:', error)
      }

      return response
    })
  }

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    user?: string | null,
    password?: string | null
  ): void {
    ;(this as XMLHttpRequest & { _url?: string })._url = url.toString()
    ;(this as XMLHttpRequest & { _method?: string })._method = method

    return originalXHROpen.call(this, method, url, async ?? true, user, password)
  }

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null): void {
    const xhr = this as XMLHttpRequest & {
      _url?: string
      _method?: string
    }
    const url = xhr._url || ''
    const method = xhr._method || 'GET'
    const { parsed: requestBody, text: requestBodyText } = captureRequestBody(body)
    const hintedGameRequest = requestLooksGameRelated(url, requestBody, requestBodyText)
    const originalOnReadyStateChange = xhr.onreadystatechange

    xhr.onreadystatechange = function (this: XMLHttpRequest, ev: Event): unknown {
      if (this.readyState === 4) {
        try {
          const contentType = this.getResponseHeader('content-type') || ''

          if (contentType.includes('application/json') && this.responseText) {
            const responseData = JSON.parse(this.responseText)

            if (hintedGameRequest || responseLooksGameRelated(responseData)) {
              sendToContentScript({
                url,
                method,
                status: this.status,
                data: responseData,
                requestBody,
                timestamp: Date.now()
              })
            }
          }
        } catch (error) {
          console.error('Error intercepting XHR response:', error)
        }
      }

      if (originalOnReadyStateChange) {
        return originalOnReadyStateChange.call(this, ev)
      }

      return undefined
    }

    return originalXHRSend.call(this, body)
  }

  if (typeof originalWebSocket === 'function') {
    window.WebSocket = new Proxy(originalWebSocket, {
      construct(target, args) {
        const socket = Reflect.construct(target, args) as WebSocket

        socket.addEventListener('message', async (event) => {
          try {
            const { parsed, text } = await captureWebSocketData(event.data)
            if (parsed == null) return

            const isLobbySocket = /\/public\/lobby\/socket\//.test(socket.url)
            if (isLobbySocket) {
              // Only forward lobby.histories from the lobby socket — skip everything else
              if (!isRecord(parsed) || parsed.type !== 'lobby.histories') return
            } else if (!responseLooksGameRelated(parsed) && !(text && hasGameKeyword(text))) {
              return
            }

            sendToContentScript({
              url: socket.url,
              method: 'WS',
              status: 101,
              data: parsed,
              timestamp: Date.now(),
              transport: 'websocket'
            })
          } catch (error) {
            console.error('Error intercepting WebSocket message:', error)
          }
        })

        return socket
      }
    }) as typeof WebSocket
  }

  // Simulate a full mouse click sequence with coordinates
  function fullClick(el: Element): void {
    const rect = el.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, view: window }

    el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse' }))
    el.dispatchEvent(new MouseEvent('mousedown', opts))
    el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse' }))
    el.dispatchEvent(new MouseEvent('mouseup', opts))
    el.dispatchEvent(new MouseEvent('click', opts))
  }

  // Listen for click commands from the content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return

    if (event.data?.type === 'BET88_CLICK') {
      const { requestId } = event.data as { requestId: string }

      function deepQueryBet88(root: ParentNode, sel: string): HTMLElement | null {
        const found = root.querySelector<HTMLElement>(sel)
        if (found) return found
        const hosts = root.querySelectorAll('*')
        for (const host of hosts) {
          if ((host as Element & { shadowRoot: ShadowRoot | null }).shadowRoot) {
            const inner = deepQueryBet88((host as Element & { shadowRoot: ShadowRoot }).shadowRoot, sel)
            if (inner) return inner
          }
        }
        return null
      }

      const el = deepQueryBet88(document, '[part="cta"]')
      if (el) {
        fullClick(el)
        window.postMessage({ type: 'BET88_CLICK_RESULT', requestId, ok: true }, '*')
      } else {
        window.postMessage({ type: 'BET88_CLICK_RESULT', requestId, ok: false, error: 'Not found: [part="cta"]' }, '*')
      }
      return
    }

    if (event.data?.type === 'EVO_CLICK') {
      const { selector, requestId } = event.data as { selector: string; requestId: string }

      // Search regular DOM first, then walk shadow roots
      function deepQuery(root: ParentNode, sel: string): HTMLElement | null {
        const found = root.querySelector<HTMLElement>(sel)
        if (found) return found
        const hosts = root.querySelectorAll('*')
        for (const host of hosts) {
          if (host.shadowRoot) {
            const inner = deepQuery(host.shadowRoot, sel)
            if (inner) return inner
          }
        }
        return null
      }

      const el = deepQuery(document, selector)
      const parent = el?.closest<HTMLElement>('[class*="chipItem"]') ?? el?.parentElement
      const visible = el ? el.offsetParent !== null || el.offsetWidth > 0 : false
      console.log('[EVO_CLICK]', selector, { found: !!el, visible, frame: window.location.href })
      if (el) {
        fullClick(parent && parent !== el ? parent : el)
        fullClick(el)
        window.postMessage({ type: 'EVO_CLICK_RESULT', requestId, ok: true, selector, visible }, '*')
      } else {
        window.postMessage({ type: 'EVO_CLICK_RESULT', requestId, ok: false, error: `Not found: ${selector}` }, '*')
      }
    }
  })
})()
