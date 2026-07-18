import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getNewRecentSpinCount } from '../../../lib/roulette'
import type { RouletteLobbyHistoriesEndpointConfig } from '../../../lib/rouletteLobbyHistories'
import type { PanelStatus } from '../../../types'
import type { LobbyTableHistory, RouletteSpinResult, RouletteStoredData, TableState } from '../../../types/roulette'
import type { RouletteResultEndpointConfig } from '../../lib/rouletteSpinResults'
import { Analytics } from './analytics/analytics'
import { RouletteVirtualBoard } from './roulette-virtual-board'

interface RouletteWorkspaceProps {
  status: PanelStatus
  stats: RouletteStoredData
  evolutionChips: number[]
  evolutionRebetVisible: boolean
  evolutionBettingOpen: boolean
  evolutionRecentNumbers: number[]
  evolutionRecentHistory: number[]
  evolutionReviewRecentNumbers: number[]
  evolutionReviewStatisticsNumbers: number[]
  evolutionReviewCombinedNumbers: number[]
  lastEvoluReviewNumbersSignature: string
  evolutionTableId: string | null
  evolutionTableState: TableState | null
  evolutionTableName: string | null
  evolutionLobbyHistories: LobbyTableHistory[]
  rouletteResultEndpointConfig: RouletteResultEndpointConfig
  rouletteResultEndpointUrl: string
  rouletteLobbyHistoriesEndpointConfig: RouletteLobbyHistoriesEndpointConfig
  rouletteLobbyHistoriesEndpointUrl: string
  saveRouletteResultEndpointConfig: (config: RouletteResultEndpointConfig) => void
  saveRouletteLobbyHistoriesEndpointConfig: (config: RouletteLobbyHistoriesEndpointConfig) => void
  onReset: () => void
}

export function RouletteWorkspace({
  status,
  stats,
  evolutionChips,
  evolutionRebetVisible,
  evolutionBettingOpen,
  evolutionRecentNumbers,
  evolutionRecentHistory,
  evolutionReviewRecentNumbers,
  evolutionReviewStatisticsNumbers,
  evolutionReviewCombinedNumbers,
  lastEvoluReviewNumbersSignature,
  evolutionTableId,
  evolutionTableState,
  evolutionTableName,
  evolutionLobbyHistories,
  rouletteResultEndpointConfig,
  rouletteResultEndpointUrl,
  rouletteLobbyHistoriesEndpointConfig,
  rouletteLobbyHistoriesEndpointUrl,
  saveRouletteResultEndpointConfig,
  saveRouletteLobbyHistoriesEndpointConfig,
  onReset
}: RouletteWorkspaceProps) {
  // ── Live winning-numbers sequence ─────────────────────────────────────────
  // evolutionRecentNumbers is newest-first (DOM-scraped, always fresh).
  // We build a growing oldest-first sequence by detecting new spins as the
  // head of evolutionRecentNumbers changes. This is more reliable than waiting
  // for websocket-captured stored results, which can fail when Evolution runs
  // in a cross-origin iframe.
  const prevRecentRef = useRef<number[]>([])
  const prevTableNameRef = useRef<string | null>(null)
  const [liveWinningNumbers, setLiveWinningNumbers] = useState<number[]>([])
  const [relaySettingsVisible, setRelaySettingsVisible] = useState(false)
  const [resultEndpointDraft, setResultEndpointDraft] =
    useState<RouletteResultEndpointConfig>(rouletteResultEndpointConfig)
  const [lobbyHistoriesEndpointDraft, setLobbyHistoriesEndpointDraft] = useState<RouletteLobbyHistoriesEndpointConfig>(
    rouletteLobbyHistoriesEndpointConfig
  )

  useEffect(() => {
    setResultEndpointDraft(rouletteResultEndpointConfig)
  }, [rouletteResultEndpointConfig])

  useEffect(() => {
    setLobbyHistoriesEndpointDraft(rouletteLobbyHistoriesEndpointConfig)
  }, [rouletteLobbyHistoriesEndpointConfig])

  useEffect(() => {
    const prev = prevRecentRef.current
    const curr = evolutionRecentNumbers
    if (curr.length === 0) return
    const tableChanged = evolutionTableName !== null && evolutionTableName !== prevTableNameRef.current
    prevRecentRef.current = curr
    prevTableNameRef.current = evolutionTableName

    if (prev.length === 0 || tableChanged) {
      // First non-empty update — seed with reversed recent (oldest-first)
      setLiveWinningNumbers([...curr].reverse())
      return
    }

    const newCount = getNewRecentSpinCount(prev, curr)
    if (newCount === 0) return // No new spin

    // Detect how many new numbers appeared at the front, including repeats.
    const newSpins = curr.slice(0, newCount).reverse() // oldest-first
    setLiveWinningNumbers((w) => [...w, ...newSpins])
  }, [evolutionRecentNumbers, evolutionTableName])

  const storedNumbers = useMemo(() => stats.results.map((r) => r.winningNumber), [stats.results])

  // liveWinningNumbers is preferred; fall back to stored when live is empty
  const winningNumbers = liveWinningNumbers.length > 0 ? liveWinningNumbers : storedNumbers

  // Reseed live sequence and clear stored results together
  const handleReset = useCallback(() => {
    onReset()
    const seed = [...evolutionRecentNumbers].reverse()
    setLiveWinningNumbers(seed)
    prevRecentRef.current = evolutionRecentNumbers
    prevTableNameRef.current = evolutionTableName
  }, [onReset, evolutionRecentNumbers, evolutionTableName])

  const liveLatestSpin = useMemo<RouletteSpinResult | null>(() => {
    const winningNumber = evolutionRecentNumbers[0]
    if (typeof winningNumber !== 'number') return null

    return {
      id: `live-evolution-${winningNumber}`,
      provider: 'stake',
      source: 'evolution',
      game: 'roulette',
      description: '',
      tableName: evolutionTableName ?? undefined,
      winningNumber,
      timestamp: Date.now(),
      updatedAt: new Date().toISOString(),
      url: '',
      eventType: 'winSpots',
      gameId: '',
      code: '',
      winSpots: {},
      resultNumbers: [winningNumber]
    }
  }, [evolutionRecentNumbers, evolutionTableName])

  const storedRecentSpins = useMemo(
    () => stats.results.map((result) => result.winningNumber).reverse(),
    [stats.results]
  )
  const storedLatestSpin = stats.results[stats.results.length - 1] ?? null

  const previewSpins = evolutionRecentNumbers.length > 0 ? evolutionRecentNumbers : storedRecentSpins

  const latestSpin = liveLatestSpin ?? storedLatestSpin

  return (
    <div className='space-y-0 pb-6 bg-[#1F2020]'>
      {/*<RouletteHeader tableId={evolutionTableName ?? undefined} latestSpin={latestSpin} previewSpins={previewSpins} />*/}
      <RouletteVirtualBoard
        status={status}
        winningNumbers={winningNumbers}
        evolutionChips={evolutionChips}
        evolutionRebetVisible={evolutionRebetVisible}
        evolutionBettingOpen={evolutionBettingOpen}
        evolutionTableState={evolutionTableState}
        rouletteResultEndpointUrl={rouletteResultEndpointUrl}
      />
      <Analytics
        lobbyHistories={evolutionLobbyHistories}
        evolutionRecentNumbers={evolutionRecentNumbers}
        evolutionRecentHistory={evolutionRecentHistory}
        evolutionReviewCombinedNumbers={evolutionReviewCombinedNumbers}
        evolutionTableId={evolutionTableId}
        evolutionTableName={evolutionTableName}
        onReset={handleReset}
        results={stats.results}
        latestSpin={latestSpin}
        rouletteResultEndpointUrl={rouletteResultEndpointUrl}
      />
      <div className='mt-4 flex items-start gap-4'>
        {relaySettingsVisible ? (
          <div className='flex-1 space-y-3'>
            <div className='space-y-2 rounded-[18px] border border-white/10 bg-black/20 p-3'>
              <p className='text-xs font-semibold uppercase tracking-[0.24em] text-white/70'>Spin Results Relay</p>
              <div className='flex gap-2'>
                <input
                  type='url'
                  value={resultEndpointDraft.baseUrl}
                  onChange={(event) =>
                    setResultEndpointDraft({
                      ...resultEndpointDraft,
                      baseUrl: event.target.value
                    })
                  }
                  className='flex-1 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-[#c208fc] outline-none transition focus:border-slate-900'
                  placeholder='http://localhost:3000'
                />
                <input
                  type='text'
                  value={resultEndpointDraft.endpoint}
                  onChange={(event) =>
                    setResultEndpointDraft({
                      ...resultEndpointDraft,
                      endpoint: event.target.value
                    })
                  }
                  className='flex-1 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-[#c208fc] outline-none transition focus:border-slate-900'
                  placeholder='/api/roulette-results'
                />
                <button
                  onClick={() => saveRouletteResultEndpointConfig(resultEndpointDraft)}
                  className='rounded-[18px] bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800'>
                  Save
                </button>
              </div>
            </div>

            <div className='space-y-2 rounded-[18px] border border-white/10 bg-black/20 p-3'>
              <p className='text-xs font-semibold uppercase tracking-[0.24em] text-white/70'>Lobby Histories Relay</p>
              <div className='flex gap-2'>
                <input
                  type='url'
                  value={lobbyHistoriesEndpointDraft.baseUrl}
                  onChange={(event) =>
                    setLobbyHistoriesEndpointDraft({
                      ...lobbyHistoriesEndpointDraft,
                      baseUrl: event.target.value
                    })
                  }
                  className='flex-1 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-[#c208fc] outline-none transition focus:border-slate-900'
                  placeholder='http://localhost:3000'
                />
                <input
                  type='text'
                  value={lobbyHistoriesEndpointDraft.endpoint}
                  onChange={(event) =>
                    setLobbyHistoriesEndpointDraft({
                      ...lobbyHistoriesEndpointDraft,
                      endpoint: event.target.value
                    })
                  }
                  className='flex-1 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-[#c208fc] outline-none transition focus:border-slate-900'
                  placeholder='/api/roulette-lobby-histories'
                />
                <button
                  onClick={() => saveRouletteLobbyHistoriesEndpointConfig(lobbyHistoriesEndpointDraft)}
                  className='rounded-[18px] bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800'>
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className='flex-1 space-y-1 text-sm font-semibold text-[#46D266]'>
            <p>{rouletteResultEndpointUrl}</p>
            <p>{rouletteLobbyHistoriesEndpointUrl}</p>
          </div>
        )}

        <button
          className='h-7 px-1.5 rounded-md text-gray-100'
          onClick={() => setRelaySettingsVisible(!relaySettingsVisible)}>
          Configure
        </button>
      </div>
    </div>
  )
}
