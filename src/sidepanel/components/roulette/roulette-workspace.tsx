import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SAMPLE_SPIN_TAPE } from '../../../lib/roulette'
import type { PanelStatus } from '../../../types'
import type { RouletteStoredData, TableState } from '../../../types/roulette'
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

  const storedNumbers = useMemo(
    () => stats.results.map((r) => r.winningNumber),
    [stats.results]
  )

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
      />
      <Analytics lobbyHistories={evolutionLobbyHistories} onReset={handleReset} results={stats.results} />
    </div>
  )
}
