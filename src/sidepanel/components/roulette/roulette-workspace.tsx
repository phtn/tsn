import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SAMPLE_SPIN_TAPE } from '../../../lib/roulette'
import type { PanelStatus } from '../../../types'
import type { RouletteStoredData, TableState } from '../../../types/roulette'
import type { RouletteResultEndpointConfig } from '../../lib/rouletteSpinResults'
import { Analytics } from './roulette-analytics'
import { RouletteHeader } from './roulette-header'
import { RouletteVirtualBoard } from './roulette-virtual-board'

interface RouletteWorkspaceProps {
  status: PanelStatus
  stats: RouletteStoredData
  evolutionChips: number[]
  evolutionRebetVisible: boolean
  evolutionBettingOpen: boolean
  evolutionRecentNumbers: number[]
  evolutionTableState: TableState | null
  evolutionLobbyHistories: { tableId: string; numbers: number[] }[]
  rouletteResultEndpointConfig: RouletteResultEndpointConfig
  rouletteResultEndpointUrl: string
  saveRouletteResultEndpointConfig: (config: RouletteResultEndpointConfig) => void
  onReset: () => void
}

export function RouletteWorkspace({
  status,
  stats,
  evolutionChips,
  evolutionRebetVisible,
  evolutionBettingOpen,
  evolutionRecentNumbers,
  evolutionTableState,
  evolutionLobbyHistories,
  rouletteResultEndpointConfig,
  rouletteResultEndpointUrl,
  saveRouletteResultEndpointConfig,
  onReset
}: RouletteWorkspaceProps) {
  // ── Live winning-numbers sequence ─────────────────────────────────────────
  // evolutionRecentNumbers is newest-first (DOM-scraped, always fresh).
  // We build a growing oldest-first sequence by detecting new spins as the
  // head of evolutionRecentNumbers changes. This is more reliable than waiting
  // for websocket-captured stored results, which can fail when Evolution runs
  // in a cross-origin iframe.
  const prevRecentRef = useRef<number[]>([])
  const [liveWinningNumbers, setLiveWinningNumbers] = useState<number[]>([])
  const [relaySettingsVisible, setRelaySettingsVisible] = useState(false)
  const [endpointDraft, setEndpointDraft] = useState<RouletteResultEndpointConfig>(rouletteResultEndpointConfig)

  useEffect(() => {
    setEndpointDraft(rouletteResultEndpointConfig)
  }, [rouletteResultEndpointConfig])

  useEffect(() => {
    const prev = prevRecentRef.current
    const curr = evolutionRecentNumbers
    prevRecentRef.current = curr

    if (curr.length === 0) return

    if (prev.length === 0) {
      // First non-empty update — seed with reversed recent (oldest-first)
      setLiveWinningNumbers([...curr].reverse())
      return
    }

    if (curr[0] === prev[0]) return // No new spin

    // Detect how many new numbers appeared at the front (usually 1)
    const prevHeadIdx = curr.indexOf(prev[0])
    const newCount = prevHeadIdx >= 0 ? prevHeadIdx : 1
    const newSpins = curr.slice(0, newCount).reverse() // oldest-first
    setLiveWinningNumbers((w) => [...w, ...newSpins])
  }, [evolutionRecentNumbers])

  const storedNumbers = useMemo(() => stats.results.map((r) => r.winningNumber), [stats.results])

  // liveWinningNumbers is preferred; fall back to stored when live is empty
  const winningNumbers = liveWinningNumbers.length > 0 ? liveWinningNumbers : storedNumbers

  // Reseed live sequence and clear stored results together
  const handleReset = useCallback(() => {
    onReset()
    const seed = [...evolutionRecentNumbers].reverse()
    setLiveWinningNumbers(seed)
    prevRecentRef.current = evolutionRecentNumbers
  }, [onReset, evolutionRecentNumbers])

  const recentSpins = stats.results.slice(-10).reverse()
  const previewSpins =
    evolutionRecentNumbers.length > 0
      ? evolutionRecentNumbers
      : recentSpins.length > 0
        ? recentSpins.map((result) => result.winningNumber)
        : SAMPLE_SPIN_TAPE

  const latestSpin = recentSpins[0] ?? null

  return (
    <div className='space-y-0 pb-6 bg-[#1F2020]'>
      <RouletteHeader stats={stats} latestSpin={latestSpin} previewSpins={previewSpins} />
      <RouletteVirtualBoard
        status={status}
        winningNumbers={winningNumbers}
        evolutionChips={evolutionChips}
        evolutionRebetVisible={evolutionRebetVisible}
        evolutionBettingOpen={evolutionBettingOpen}
        evolutionTableState={evolutionTableState}
        rouletteResultEndpointUrl={rouletteResultEndpointUrl}
      />
      <Analytics lobbyHistories={evolutionLobbyHistories} onReset={handleReset} results={stats.results} />
      <div className='flex items-center space-x-4'>
        {relaySettingsVisible ? (
          <div className='mt-4 flex gap-2'>
            <input
              type='url'
              value={endpointDraft.baseUrl}
              onChange={(event) =>
                setEndpointDraft({
                  ...endpointDraft,
                  baseUrl: event.target.value
                })
              }
              className='flex-1 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-[#c208fc] outline-none transition focus:border-slate-900'
              placeholder='http://localhost:3000'
            />
            <input
              type='text'
              value={endpointDraft.endpoint}
              onChange={(event) =>
                setEndpointDraft({
                  ...endpointDraft,
                  endpoint: event.target.value
                })
              }
              className='flex-1 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm text-[#c208fc] outline-none transition focus:border-slate-900'
              placeholder='/api/roulette-results'
            />
            <button
              onClick={() => saveRouletteResultEndpointConfig(endpointDraft)}
              className='rounded-[18px] bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800'>
              Save
            </button>
          </div>
        ) : (
          <p className='mt-4 text-sm font-semibold text-[#46D266]'>{rouletteResultEndpointUrl}</p>
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
