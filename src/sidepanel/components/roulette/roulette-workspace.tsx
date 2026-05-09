import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getNewRecentSpinCount, SAMPLE_SPIN_TAPE } from '../../../lib/roulette'
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
  evolutionTableName: string | null
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
  evolutionTableName,
  evolutionLobbyHistories,
  onReset
}: RouletteWorkspaceProps) {
  // ── Live winning-numbers sequence ─────────────────────────────────────────
  // evolutionRecentNumbers is newest-first (DOM-scraped or selected from active-table lobby history).
  // We build a growing oldest-first sequence by detecting the overlap between
  // successive recent-number snapshots, including repeated head values. This is
  // more reliable than waiting
  // for websocket-captured stored results, which can fail when Evolution runs
  // in a cross-origin iframe.
  const prevRecentRef = useRef<number[]>([])
  const prevTableNameRef = useRef<string | null>(null)
  const [liveWinningNumbers, setLiveWinningNumbers] = useState<number[]>([])

  useEffect(() => {
    const prev = prevRecentRef.current
    const curr = evolutionRecentNumbers
    const tableChanged = evolutionTableName !== null && evolutionTableName !== prevTableNameRef.current

    if (curr.length === 0) return
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

  const recentSpins = stats.results.slice(-10).reverse()
  const previewSpins =
    evolutionRecentNumbers.length > 0
      ? evolutionRecentNumbers
      : recentSpins.length > 0
        ? recentSpins.map((result) => result.winningNumber)
        : SAMPLE_SPIN_TAPE
  const hasRealPreviewSpins = evolutionRecentNumbers.length > 0 || recentSpins.length > 0

  const latestSpin = recentSpins[0] ?? null

  return (
    <div className='space-y-0 pb-6 bg-[#1F2020]'>
      <RouletteHeader
        winningNumbers={winningNumbers}
        hasRealSpins={hasRealPreviewSpins}
        latestSpin={latestSpin}
        previewSpins={previewSpins}
      />
      <RouletteVirtualBoard
        status={status}
        winningNumbers={winningNumbers}
        evolutionChips={evolutionChips}
        evolutionRebetVisible={evolutionRebetVisible}
        evolutionBettingOpen={evolutionBettingOpen}
        evolutionTableState={evolutionTableState}
      />
      <Analytics lobbyHistories={evolutionLobbyHistories} onReset={handleReset} winningNumbers={winningNumbers} />
    </div>
  )
}
