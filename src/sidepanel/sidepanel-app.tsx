import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import {
  getEvolutionRecentNumbersForTable,
  normalizeEvolutionLobbyHistories,
  normalizeEvolutionRecentNumbers,
  type EvolutionLobbyHistory
} from '../lib/roulette/evolution-recent-numbers'
import {
  getDefaultRouletteLobbyHistoriesEndpointConfig,
  normalizeRouletteLobbyHistoriesCapture,
  normalizeRouletteLobbyHistoriesEndpointConfig,
  resolveRouletteLobbyHistoriesEndpointUrl,
  type RouletteLobbyHistoriesCapture,
  type RouletteLobbyHistoriesEndpointConfig
} from '../lib/rouletteLobbyHistories'
import { deriveVirtualBankroll } from '../lib/virtual-bankroll'
import {
  EMPTY_STORED_DATA,
  EMPTY_VIRTUAL_BANKROLL,
  normalizeStoredData,
  normalizeVirtualBankroll,
  PanelStatus,
  type StoredData,
  type SupportedSiteKey,
  type VirtualBankrollState
} from '../types'
import {
  EMPTY_ROULETTE_STORED_DATA,
  normalizeRouletteStoredData,
  summarizeRouletteResults,
  TableState,
  type EvolutionRouletteSpinResult,
  type RouletteStoredData
} from '../types/roulette'
import { EMPTY_TENNIS_STORED_DATA, normalizeTennisStoredData, type TennisStoredData } from '../types/tennis'
import { RouletteWorkspace } from './components/roulette/roulette-workspace'
import { findRtnTableByName } from './components/roulette/tables'
import { type GameClassView } from './components/shared/game-class-switcher'
import { MainHeader } from './components/shared/header'
import { getNetTone } from './lib/formatters'
import {
  getDefaultRouletteResultEndpointConfig,
  normalizeRouletteResultEndpointConfig,
  resolveRouletteResultEndpointUrl,
  type RouletteResultEndpointConfig
} from './lib/rouletteSpinResults'

const INITIAL_STATUS: PanelStatus = { connected: false, message: 'Checking the active tab...', site: null }

function sameStatus(left: PanelStatus, right: PanelStatus): boolean {
  return (
    left.connected === right.connected &&
    left.message === right.message &&
    left.site === right.site &&
    left.url === right.url
  )
}

function getStoredPort(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 3000
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function sameEndpointConfig(
  left: RouletteResultEndpointConfig | RouletteLobbyHistoriesEndpointConfig,
  right: RouletteResultEndpointConfig | RouletteLobbyHistoriesEndpointConfig
): boolean {
  return left.baseUrl === right.baseUrl && left.endpoint === right.endpoint
}

const App = () => {
  const [stats, setStats] = useState<StoredData>(EMPTY_STORED_DATA)
  const [status, setStatus] = useState<PanelStatus>(INITIAL_STATUS)
  const [simulated, setSimulated] = useState<boolean>(false)
  const [devServerPort, setDevServerPort] = useState<number>(3000)
  const [rouletteResultEndpointConfig, setRouletteResultEndpointConfig] = useState<RouletteResultEndpointConfig>(
    getDefaultRouletteResultEndpointConfig(3000)
  )
  const [rouletteLobbyHistoriesEndpointConfig, setRouletteLobbyHistoriesEndpointConfig] =
    useState<RouletteLobbyHistoriesEndpointConfig>(getDefaultRouletteLobbyHistoriesEndpointConfig(3000))
  const [virtualBankroll, setVirtualBankroll] = useState<VirtualBankrollState>(EMPTY_VIRTUAL_BANKROLL)
  const [rouletteStats, setRouletteStats] = useState<RouletteStoredData>(EMPTY_ROULETTE_STORED_DATA)
  const [tennisStats, setTennisStats] = useState<TennisStoredData>(EMPTY_TENNIS_STORED_DATA)
  const [evolutionChips, setEvolutionChips] = useState<number[]>([])
  const [evolutionRebetVisible, setEvolutionRebetVisible] = useState<boolean>(false)
  const [evolutionBettingOpen, setEvolutionBettingOpen] = useState<boolean>(false)
  const [evolutionRecentNumbers, setEvolutionRecentNumbers] = useState<number[]>([])
  const [evolutionRecentHistory, setEvolutionRecentHistory] = useState<number[]>([])
  const [evolutionReviewRecentNumbers, setEvolutionReviewRecentNumbers] = useState<number[]>([])
  const [evolutionReviewStatisticsNumbers, setEvolutionReviewStatisticsNumbers] = useState<number[]>([])
  const [evolutionReviewCombinedNumbers, setEvolutionReviewCombinedNumbers] = useState<number[]>([])
  const [lastEvoluReviewNumbersSignature, setLastEvoluReviewNumbersSignature] = useState<string>('')
  const [evolutionTableState, setEvolutionTableState] = useState<TableState | null>(null)
  const [evolutionTableId, setEvolutionTableId] = useState<string | null>(null)
  const [evolutionTableName, setEvolutionTableName] = useState<string | null>(null)
  const [evolutionLobbyHistories, setEvolutionLobbyHistories] = useState<EvolutionLobbyHistory[]>([])
  const [evolutionLobbyHistoriesCapture, setEvolutionLobbyHistoriesCapture] =
    useState<RouletteLobbyHistoriesCapture | null>(null)
  const [activeGameClass, setActiveGameClass] = useState<GameClassView>('roulette')
  const [showSettings, setShowSettings] = useState(false)
  // ─── loaders ──────────────────────────────────────────────────────────────

  const loadStats = () => {
    chrome.storage.local.get(['casinoResults', 'virtualBankroll'], (data) => {
      setStats(normalizeStoredData(data.casinoResults, normalizeVirtualBankroll(data.virtualBankroll)))
    })
  }

  const loadDevServerPort = () => {
    chrome.storage.local.get(['devServerPort'], (data) => {
      startTransition(() => {
        const nextPort = getStoredPort(data.devServerPort)
        setDevServerPort((cur) => (cur === nextPort ? cur : nextPort))
      })
    })
  }

  const loadRouletteResultEndpointConfig = () => {
    chrome.storage.local.get(['devServerPort', 'rouletteResultEndpointConfig'], (data) => {
      startTransition(() => {
        const nextPort = getStoredPort(data.devServerPort)
        const nextConfig = normalizeRouletteResultEndpointConfig(data.rouletteResultEndpointConfig, nextPort)
        setRouletteResultEndpointConfig((current) => (sameEndpointConfig(current, nextConfig) ? current : nextConfig))
      })
    })
  }

  const loadRouletteLobbyHistoriesEndpointConfig = () => {
    chrome.storage.local.get(['devServerPort', 'rouletteLobbyHistoriesEndpointConfig'], (data) => {
      startTransition(() => {
        const nextPort = getStoredPort(data.devServerPort)
        const nextConfig = normalizeRouletteLobbyHistoriesEndpointConfig(
          data.rouletteLobbyHistoriesEndpointConfig,
          nextPort
        )
        setRouletteLobbyHistoriesEndpointConfig((current) =>
          sameEndpointConfig(current, nextConfig) ? current : nextConfig
        )
      })
    })
  }

  const loadVirtualBankroll = () => {
    chrome.storage.local.get(['virtualBankroll'], (data) => {
      startTransition(() => setVirtualBankroll(normalizeVirtualBankroll(data.virtualBankroll)))
    })
  }

  const loadRouletteResults = () => {
    chrome.storage.local.get(['rouletteResults'], (data) => {
      startTransition(() => setRouletteStats(normalizeRouletteStoredData(data.rouletteResults)))
    })
  }

  const loadTennisResults = () => {
    chrome.storage.local.get(['tennisResults'], (data) => {
      startTransition(() => setTennisStats(normalizeTennisStoredData(data.tennisResults)))
    })
  }

  const loadEvolutionChips = () => {
    chrome.storage.local.get(
      [
        'evolutionChips',
        'evolutionRebetVisible',
        'evolutionBettingOpen',
        'evolutionRecentNumbers',
        'evolutionRecentHistory',
        'evolutionTableState',
        'evolutionTableName',
        'evolutionLobbyHistories',
        'evolutionLobbyHistoriesCapture',
        'evolutionReviewRecentNumbers',
        'evolutionReviewStatisticsNumbers',
        'evolutionReviewCombinedNumbers',
        'lastEvoluReviewNumbersSignature'
      ],
      (data) => {
        const chips = Array.isArray(data.evolutionChips)
          ? data.evolutionChips.filter((v: unknown) => typeof v === 'number' && v > 0)
          : []
        const recentNumbers = normalizeEvolutionRecentNumbers(data.evolutionRecentNumbers).slice(0, 500)
        const recentHistory = Array.isArray(data.evolutionRecentHistory)
          ? data.evolutionRecentHistory
              .filter((v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 36)
              .slice(0, 500)
          : []
        const reviewRecentNumbers = normalizeEvolutionRecentNumbers(data.evolutionReviewRecentNumbers)
        const reviewStatisticsNumbers = normalizeEvolutionRecentNumbers(data.evolutionReviewStatisticsNumbers)
        const reviewCombinedNumbers = normalizeEvolutionRecentNumbers(data.evolutionReviewCombinedNumbers)
        const reviewSignature =
          typeof data.lastEvoluReviewNumbersSignature === 'string' ? data.lastEvoluReviewNumbersSignature : ''
        const lobbyHistories = normalizeEvolutionLobbyHistories(data.evolutionLobbyHistories)
        const tableName =
          typeof data.evolutionTableName === 'string' && data.evolutionTableName.trim().length > 0
            ? data.evolutionTableName.trim()
            : null
        const knownTable = findRtnTableByName(
          tableName,
          lobbyHistories.map(({ tableId }) => tableId)
        )
        const activeTableHistory = knownTable
          ? lobbyHistories.find(({ tableId }) => tableId === knownTable.id) ?? null
          : null
        const activeTableRecentNumbers = getEvolutionRecentNumbersForTable(
          recentNumbers,
          lobbyHistories,
          knownTable?.name ?? tableName,
          activeTableHistory?.tableId
        )
        const lobbyHistoriesCapture = normalizeRouletteLobbyHistoriesCapture(data.evolutionLobbyHistoriesCapture)
        const lobbyHistoriesSignature = JSON.stringify(lobbyHistories)
        startTransition(() => {
          setEvolutionChips((prev) => {
            const next = chips as number[]
            return prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next
          })
          setEvolutionRebetVisible(data.evolutionRebetVisible === true)
          setEvolutionBettingOpen(data.evolutionBettingOpen === true)
          setEvolutionRecentNumbers((previous) =>
            sameNumbers(previous, activeTableRecentNumbers) ? previous : activeTableRecentNumbers
          )
          setEvolutionRecentHistory(recentHistory as number[])
          setEvolutionReviewRecentNumbers((previous) =>
            sameNumbers(previous, reviewRecentNumbers) ? previous : reviewRecentNumbers
          )
          setEvolutionReviewStatisticsNumbers((previous) =>
            sameNumbers(previous, reviewStatisticsNumbers) ? previous : reviewStatisticsNumbers
          )
          setEvolutionReviewCombinedNumbers((previous) =>
            sameNumbers(previous, reviewCombinedNumbers) ? previous : reviewCombinedNumbers
          )
          setLastEvoluReviewNumbersSignature((previous) => (previous === reviewSignature ? previous : reviewSignature))
          setEvolutionTableState(
            typeof data.evolutionTableState === 'string' ? (data.evolutionTableState as TableState) : null
          )
          setEvolutionTableId(knownTable?.id ?? null)
          setEvolutionTableName(knownTable?.name ?? tableName)
          setEvolutionLobbyHistories(lobbyHistories)
          setEvolutionLobbyHistoriesCapture((prev) => {
            if (lobbyHistoriesCapture) {
              return lobbyHistoriesCapture
            }

            if (lobbyHistories.length === 0) {
              return null
            }

            const prevSignature = prev ? JSON.stringify(prev.histories) : ''
            if (prevSignature === lobbyHistoriesSignature) {
              return prev
            }

            return {
              histories: lobbyHistories.map(({ tableId, numbers }) => ({
                tableId,
                numbers: [...numbers]
              })),
              pageUrl: '',
              captureUrl: '',
              timestamp: Date.now()
            }
          })
        })
      }
    )
  }

  // ─── stable callbacks ──────────────────────────────────────────────────────

  const persistVirtualBankroll = useCallback((nextState: VirtualBankrollState) => {
    chrome.storage.local.set({ virtualBankroll: nextState }, () => {
      startTransition(() => setVirtualBankroll(nextState))
    })
  }, [])

  const requestUrlStatus = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'REQUEST_URL_STATUS' }, () => {
      if (chrome.runtime.lastError) {
        const nextStatus: PanelStatus = { connected: false, message: 'Background worker is unavailable.', site: null }
        startTransition(() => {
          setStatus((cur) => (sameStatus(cur, nextStatus) ? cur : nextStatus))
        })
      }
    })
  }, [])

  const clearData = useCallback(() => {
    if (!window.confirm('Clear all tracked game history?')) return
    chrome.storage.local.remove(['rouletteResults'], () => {
      startTransition(() => {
        setStats(EMPTY_STORED_DATA)
        setRouletteStats(EMPTY_ROULETTE_STORED_DATA)
        setTennisStats(EMPTY_TENNIS_STORED_DATA)
      })
    })
  }, [])

  const clearRouletteResults = useCallback(() => {
    const now = Date.now()
    const seeded: EvolutionRouletteSpinResult[] = [...evolutionRecentNumbers].reverse().map((n, i) => ({
      id: `table-seed-${now}-${i}`,
      provider: 'stake' as const,
      source: 'evolution' as const,
      game: 'roulette' as const,
      description: '',
      winningNumber: n,
      timestamp: now - (evolutionRecentNumbers.length - 1 - i) * 1000,
      updatedAt: new Date(now - (evolutionRecentNumbers.length - 1 - i) * 1000).toISOString(),
      url: '',
      eventType: 'winSpots' as const,
      gameId: '',
      code: '',
      winSpots: {},
      resultNumbers: [n]
    }))
    const next = seeded.length > 0 ? summarizeRouletteResults(seeded) : EMPTY_ROULETTE_STORED_DATA
    setRouletteStats(next)
    chrome.storage.local.set({ rouletteResults: next })
  }, [evolutionRecentNumbers])

  const clearTennisResults = useCallback(() => {
    if (!window.confirm('Clear captured tennis board data?')) return
    chrome.storage.local.remove(['tennisResults'], () => {
      startTransition(() => setTennisStats(EMPTY_TENNIS_STORED_DATA))
    })
  }, [])

  const saveDevServerPort = useCallback((port: number) => {
    const portNum = Math.max(1, Math.min(65535, port))
    chrome.storage.local.set({ devServerPort: portNum }, () => {
      startTransition(() => {
        setDevServerPort(portNum)
        setShowSettings(false)
      })
    })
  }, [])

  const saveRouletteResultEndpointConfig = useCallback(
    (config: RouletteResultEndpointConfig) => {
      const fallback = getDefaultRouletteResultEndpointConfig(devServerPort)
      const nextConfig: RouletteResultEndpointConfig = {
        baseUrl: config.baseUrl.trim() || fallback.baseUrl,
        endpoint: config.endpoint.trim() || fallback.endpoint
      }

      chrome.storage.local.set({ rouletteResultEndpointConfig: nextConfig }, () => {
        startTransition(() => setRouletteResultEndpointConfig(nextConfig))
      })
    },
    [devServerPort]
  )

  const saveRouletteLobbyHistoriesEndpointConfig = useCallback(
    (config: RouletteLobbyHistoriesEndpointConfig) => {
      const fallback = getDefaultRouletteLobbyHistoriesEndpointConfig(devServerPort)
      const nextConfig: RouletteLobbyHistoriesEndpointConfig = {
        baseUrl: config.baseUrl.trim() || fallback.baseUrl,
        endpoint: config.endpoint.trim() || fallback.endpoint
      }

      chrome.storage.local.set({ rouletteLobbyHistoriesEndpointConfig: nextConfig }, () => {
        startTransition(() => setRouletteLobbyHistoriesEndpointConfig(nextConfig))
      })
    },
    [devServerPort]
  )

  const enableVirtualBankroll = useCallback(
    (seedBalance: number, baseBetAmount: number) => {
      persistVirtualBankroll({
        enabled: true,
        seedBalance,
        baseBetAmount,
        replenishedTotal: 0,
        trackingStartedAt: Date.now()
      })
    },
    [persistVirtualBankroll]
  )

  const disableVirtualBankroll = useCallback(() => {
    persistVirtualBankroll({ ...virtualBankroll, enabled: false })
  }, [virtualBankroll, persistVirtualBankroll])

  const replenishVirtualBankroll = useCallback(
    (amount: number) => {
      persistVirtualBankroll({ ...virtualBankroll, replenishedTotal: virtualBankroll.replenishedTotal + amount })
    },
    [virtualBankroll, persistVirtualBankroll]
  )

  const updateVirtualBankrollBetAmount = useCallback(
    (amount: number) => {
      persistVirtualBankroll({ ...virtualBankroll, baseBetAmount: amount })
    },
    [virtualBankroll, persistVirtualBankroll]
  )

  const resetVirtualBankroll = useCallback(() => {
    if (!window.confirm('Reset the virtual bankroll to its starting balance and restart profit/loss tracking?')) return
    persistVirtualBankroll({ ...virtualBankroll, enabled: true, replenishedTotal: 0, trackingStartedAt: Date.now() })
  }, [virtualBankroll, persistVirtualBankroll])

  const onGameClassChange = useCallback(() => {
    const order: GameClassView[] = ['roulette']
    setActiveGameClass((cur) => order[(order.indexOf(cur) + 1) % order.length])
  }, [])

  const placeBet88Bet = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'PLACE_BET88_BET' }, () => {
      if (chrome.runtime.lastError) {
        console.warn('[watchful-wind] placeBet88Bet failed:', chrome.runtime.lastError.message)
      }
    })
  }, [])

  const toggleSimulated = useCallback(() => setSimulated((prev) => !prev), [])
  const toggleShowSettings = useCallback(() => setShowSettings((prev) => !prev), [])

  // ─── effect ────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadStats()
    loadDevServerPort()
    loadRouletteResultEndpointConfig()
    loadRouletteLobbyHistoriesEndpointConfig()
    loadVirtualBankroll()
    loadRouletteResults()
    loadTennisResults()
    loadEvolutionChips()

    const storageListener = (changes: { [key: string]: chrome.storage.StorageChange }, namespace: string) => {
      if (namespace !== 'local') return
      if (changes.casinoResults) loadStats()
      if (changes.devServerPort) loadDevServerPort()
      if (changes.devServerPort || changes.rouletteResultEndpointConfig) loadRouletteResultEndpointConfig()
      if (changes.devServerPort || changes.rouletteLobbyHistoriesEndpointConfig) {
        loadRouletteLobbyHistoriesEndpointConfig()
      }
      if (changes.virtualBankroll) loadVirtualBankroll()
      if (changes.rouletteResults) loadRouletteResults()
      if (changes.tennisResults) loadTennisResults()
      if (
        changes.evolutionChips ||
        changes.evolutionRebetVisible ||
        changes.evolutionBettingOpen ||
        changes.evolutionRecentNumbers ||
        changes.evolutionRecentHistory ||
        changes.evolutionReviewRecentNumbers ||
        changes.evolutionReviewStatisticsNumbers ||
        changes.evolutionReviewCombinedNumbers ||
        changes.lastEvoluReviewNumbersSignature ||
        changes.evolutionTableState ||
        changes.evolutionTableName ||
        changes.evolutionLobbyHistories ||
        changes.evolutionLobbyHistoriesCapture
      ) {
        loadEvolutionChips()
      }
    }

    const messageListener = (message: {
      type?: string
      isTargetSite?: boolean
      site?: SupportedSiteKey | null
      siteLabel?: string | null
      url?: string | null
    }) => {
      if (message.type !== 'URL_STATUS') return
      const nextStatus: PanelStatus = message.isTargetSite
        ? {
            connected: true,
            message: `Connected to ${message.siteLabel || 'a supported site'}.`,
            site: message.site ?? null,
            url: message.url || undefined
          }
        : {
            connected: false,
            message: 'Open bet88.ph or Stake to arm the listener.',
            site: null,
            url: message.url || undefined
          }
      startTransition(() => setStatus((cur) => (sameStatus(cur, nextStatus) ? cur : nextStatus)))
    }

    chrome.storage.onChanged.addListener(storageListener)
    chrome.runtime.onMessage.addListener(messageListener)
    requestUrlStatus()

    const interval = window.setInterval(() => {
      loadStats()
      loadRouletteResults()
      loadTennisResults()
      loadEvolutionChips()
    }, 1000)

    return () => {
      window.clearInterval(interval)
      chrome.storage.onChanged.removeListener(storageListener)
      chrome.runtime.onMessage.removeListener(messageListener)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── derived values ────────────────────────────────────────────────────────

  const recentResults = useMemo(() => stats.results.slice(-18).reverse(), [stats.results])

  const latestGame = recentResults[0]

  const totalStaked = useMemo(() => stats.results.reduce((sum, game) => sum + (game.amount ?? 0), 0), [stats.results])

  const netProfit = useMemo(
    () =>
      stats.results.reduce((sum, game) => {
        const profit =
          game.profit ?? (game.payout !== undefined && game.amount !== undefined ? game.payout - game.amount : 0)
        return sum + profit
      }, 0),
    [stats.results]
  )

  const bankrollSnapshot = useMemo(
    () => deriveVirtualBankroll(virtualBankroll, stats.results),
    [virtualBankroll, stats.results]
  )

  // ─── prop bundles ──────────────────────────────────────────────────────────

  const pulseProps = useMemo(
    () => ({
      requestUrlStatus,
      clearData,
      totalStaked,
      netProfit,
      snapshot: bankrollSnapshot,
      latestGame,
      getNetTone,
      simulated,
      toggleSimulated
    }),
    [requestUrlStatus, clearData, totalStaked, netProfit, bankrollSnapshot, latestGame, simulated, toggleSimulated]
  )

  const vrBankProps = useMemo(
    () => ({
      bankroll: virtualBankroll,
      snapshot: bankrollSnapshot,
      onEnable: enableVirtualBankroll,
      onDisable: disableVirtualBankroll,
      onReplenish: replenishVirtualBankroll,
      onReset: resetVirtualBankroll,
      onUpdateBaseBetAmount: updateVirtualBankrollBetAmount,
      onPlaceBet: placeBet88Bet
    }),
    [
      virtualBankroll,
      bankrollSnapshot,
      enableVirtualBankroll,
      disableVirtualBankroll,
      replenishVirtualBankroll,
      resetVirtualBankroll,
      updateVirtualBankrollBetAmount,
      placeBet88Bet
    ]
  )

  const rouletteResultEndpointUrl = useMemo(
    () => resolveRouletteResultEndpointUrl(rouletteResultEndpointConfig),
    [rouletteResultEndpointConfig]
  )
  const rouletteLobbyHistoriesEndpointUrl = useMemo(
    () => resolveRouletteLobbyHistoriesEndpointUrl(rouletteLobbyHistoriesEndpointConfig),
    [rouletteLobbyHistoriesEndpointConfig]
  )

  // ─── render ────────────────────────────────────────────────────────────────

  return (
    <div className='min-h-screen text-slate-950 bg-[#282828] antialiased'>
      <div className='mx-auto flex max-w-xl flex-col'>
        <MainHeader
          status={status}
          stats={stats}
          latestGame={latestGame}
          onGameClassChange={onGameClassChange}
          gameClass={activeGameClass}
        />
        <RouletteWorkspace
          status={status}
          stats={rouletteStats}
          evolutionChips={evolutionChips}
          evolutionRebetVisible={evolutionRebetVisible}
          evolutionBettingOpen={evolutionBettingOpen}
          evolutionRecentNumbers={evolutionRecentNumbers}
          evolutionRecentHistory={evolutionRecentHistory}
          evolutionReviewRecentNumbers={evolutionReviewRecentNumbers}
          evolutionReviewStatisticsNumbers={evolutionReviewStatisticsNumbers}
          evolutionReviewCombinedNumbers={evolutionReviewCombinedNumbers}
          lastEvoluReviewNumbersSignature={lastEvoluReviewNumbersSignature}
          evolutionTableId={evolutionTableId}
          evolutionTableState={evolutionTableState}
          evolutionTableName={evolutionTableName}
          evolutionLobbyHistories={evolutionLobbyHistories}
          rouletteResultEndpointConfig={rouletteResultEndpointConfig}
          rouletteResultEndpointUrl={rouletteResultEndpointUrl}
          rouletteLobbyHistoriesEndpointConfig={rouletteLobbyHistoriesEndpointConfig}
          rouletteLobbyHistoriesEndpointUrl={rouletteLobbyHistoriesEndpointUrl}
          saveRouletteResultEndpointConfig={saveRouletteResultEndpointConfig}
          saveRouletteLobbyHistoriesEndpointConfig={saveRouletteLobbyHistoriesEndpointConfig}
          onReset={clearRouletteResults}
        />
      </div>
    </div>
  )
}

export default App
