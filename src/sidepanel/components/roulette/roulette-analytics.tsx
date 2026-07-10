import type { LobbyTableHistory, RouletteSpinResult } from '@/src/types/roulette'
import { FC, useEffect, useMemo, useRef } from 'react'
import { postJsonToEndpoint } from '../../../lib/relayEndpoints'
import {
  BLACK_NUMBERS,
  getKimQuadrantsContainingPair,
  type KimQuadrantId,
  KIMS_ALGO_QUADRANTS,
  ORPHELINS_G,
  RED_NUMBERS,
  resolveKimQuadrantPreference,
  selectKimQuadrant,
  TIER_G,
  VOISINS_G
} from '../../../lib/roulette'
import { cn } from '../../../lib/utils'
import { ClassName } from '../../../types'
import { HistoryNumbers, SignalOverview } from './analytics/history'
import { HotAndColdNumbers, StatsOverview, VPctOverview } from './analytics/stats'
import { SignalOutcome, SignalSummary } from './analytics/types'
import { Stats } from './types'
import { getHotNumbers } from './utils'

export const cardClassName: ClassName = `border-zinc-800 bg-[linear-gradient(180deg,rgba(255,255,255,0.01),rgba(255,255,255,0)),linear-gradient(180deg,rgba(31,35,41,0.96),rgba(12,14,19,0.9))]`

type AnalyticsProps = {
  // winningNumbers?: readonly number[]
  lobbyHistories?: LobbyTableHistory[]
  evolutionRecentNumbers?: number[]
  evolutionRecentHistory?: number[]
  onReset?: () => void
  results: RouletteSpinResult[]
  latestSpin: RouletteSpinResult | null
  rouletteResultEndpointUrl?: string
}

type NumberState = {
  index: number
  number: number
  highlighted: boolean
  leadingSignal: boolean
  winning: boolean
  losing: boolean
}

type AnalyticsOutcomeState = {
  index: number
  displayIndex: number
  number: number | null
}

function isRepeatSignalPair(first: number, second: number) {
  return first !== 0 && first === second
}

function resolveRouletteAnalyticsEndpointUrl(rouletteResultEndpointUrl?: string) {
  const endpoint = rouletteResultEndpointUrl?.trim()
  if (!endpoint) {
    return ''
  }

  try {
    const url = new URL(endpoint)
    url.pathname = '/api/bets/r3'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return '/api/bets/r3'
  }
}

function mapNumberStates(
  numbers: readonly number[],
  indexOffset: number,
  highlightedIndexes: ReadonlySet<number>,
  leadingSignalIndexes: ReadonlySet<number>,
  winningIndexes: ReadonlySet<number>,
  losingIndexes: ReadonlySet<number>
): NumberState[] {
  return numbers.map((number, index) => {
    const displayIndex = index + indexOffset
    return {
      index: displayIndex,
      number,
      highlighted: highlightedIndexes.has(displayIndex),
      leadingSignal: leadingSignalIndexes.has(displayIndex),
      winning: winningIndexes.has(displayIndex),
      losing: losingIndexes.has(displayIndex)
    }
  })
}

function mapOutcomeStates(
  indexes: readonly number[],
  allNumbersFromStart: readonly number[],
  displayCount: number
): AnalyticsOutcomeState[] {
  return indexes.map((index) => ({
    index,
    displayIndex: displayCount - 1 - index,
    number: allNumbersFromStart[index] ?? null
  }))
}

function mapAllNumbersFromStart(allNumbersFromStart: readonly number[]): SignalSummary {
  let signalsFound = 0
  let wins = 0
  let losses = 0
  let zeroLosses = 0
  let currentWinStreak = 0
  let bestWinStreak = 0
  const winStreaks: number[] = []
  const signalIndexes: number[] = []
  const leadingSignalIndexes: number[] = []
  const winningIndexes: number[] = []
  const losingIndexes: number[] = []
  const series: SignalOutcome[] = []
  let currentQuadrant: KimQuadrantId = 'q1'

  let index = 1
  while (index < allNumbersFromStart.length) {
    const first = allNumbersFromStart[index - 1]
    const second = allNumbersFromStart[index]
    const candidateQuadrants = getKimQuadrantsContainingPair(first, second)
    const isRepeatSignal = isRepeatSignalPair(first, second)

    if (candidateQuadrants.length === 0 && !isRepeatSignal) {
      index += 1
      continue
    }

    signalsFound += 1
    signalIndexes.push(index - 1, index)
    leadingSignalIndexes.push(index)
    const selectedQuadrant = resolveKimQuadrantPreference(
      candidateQuadrants,
      getHotNumbers(allNumbersFromStart.slice(0, index + 1)),
      currentQuadrant
    )
    if (selectedQuadrant) {
      currentQuadrant = selectedQuadrant
    }

    const activeQuadrants: KimQuadrantId[] = selectedQuadrant ? [selectedQuadrant] : []
    let resolvedAt: number | null = null
    let restartAtLeadingSignal = false

    for (let round = 1; round <= 5; round++) {
      const spinIndex = index + round
      if (spinIndex >= allNumbersFromStart.length) {
        index = allNumbersFromStart.length
        break
      }

      const landedNumber = allNumbersFromStart[spinIndex]
      const isZero = landedNumber === 0
      const isZeroLoss = isZero && round <= 3
      const isZeroWin = isZero && round >= 4
      const previousSpinNumber = allNumbersFromStart[spinIndex - 1] ?? null
      const isRepeatWin =
        round > 1 && landedNumber !== 0 && previousSpinNumber !== null && landedNumber === previousSpinNumber
      const isQuadrantWin = activeQuadrants.some((quadrant) => KIMS_ALGO_QUADRANTS[quadrant].includes(landedNumber))
      const isSignalWin =
        previousSpinNumber !== null &&
        (getKimQuadrantsContainingPair(previousSpinNumber, landedNumber).length > 0 ||
          isRepeatSignalPair(previousSpinNumber, landedNumber))
      const isWin = isQuadrantWin || isZeroWin || isRepeatWin || isSignalWin

      if (isZeroLoss) {
        zeroLosses += 1
        losses += 1
        losingIndexes.push(spinIndex)
        series.push('0')
        if (currentWinStreak > 0) {
          winStreaks.push(currentWinStreak)
        }
        currentWinStreak = 0
        resolvedAt = spinIndex
        break
      }

      if (isWin) {
        wins += 1
        if (isSignalWin) {
          restartAtLeadingSignal = true
        }
        currentWinStreak += 1
        bestWinStreak = Math.max(bestWinStreak, currentWinStreak)
        winningIndexes.push(spinIndex)
        series.push('W')
        resolvedAt = spinIndex
        break
      }

      if (round === 5) {
        losses += 1
        losingIndexes.push(spinIndex)
        series.push('L')
        if (currentWinStreak > 0) {
          winStreaks.push(currentWinStreak)
        }
        currentWinStreak = 0
        resolvedAt = spinIndex
      }

      const nextSelection = selectKimQuadrant(landedNumber, {
        currentQuadrant,
        usedQuadrants: activeQuadrants,
        hotNumbers: getHotNumbers(allNumbersFromStart.slice(0, spinIndex + 1))
      })
      if (nextSelection.selectedQuadrant) {
        currentQuadrant = nextSelection.selectedQuadrant
        activeQuadrants.push(nextSelection.selectedQuadrant)
      }
    }

    if (resolvedAt === null) {
      break
    }

    index = restartAtLeadingSignal ? resolvedAt : resolvedAt + 1
  }

  if (currentWinStreak > 0) {
    winStreaks.push(currentWinStreak)
  }

  return {
    signalsFound,
    wins,
    losses,
    zeroLosses,
    bestWinStreak,
    currentWinStreak,
    winStreaks,
    signalIndexes,
    leadingSignalIndexes,
    winningIndexes,
    losingIndexes,
    series: series.reverse()
  }
}

export const Analytics: FC<AnalyticsProps> = ({
  results,
  lobbyHistories = [],
  evolutionRecentNumbers = [],
  evolutionRecentHistory = [],
  onReset,
  latestSpin,
  rouletteResultEndpointUrl
}) => {
  const winningNumbers = results
    .map((result) => result.winningNumber)
    .flat()
    .reverse()
  const recentNumbers = evolutionRecentNumbers.slice(0, 501)
  const historyNumbers = evolutionRecentHistory.slice(0, 501)
  // Both sources are newest-first. The connector entries are included in
  // mostRecentNumbers, so they must stay visible when that card is folded
  // into the history display below.
  const mostRecentNumbers = recentNumbers.concat(historyNumbers).slice(0, 13)
  const historyConnectorCount = Math.max(0, mostRecentNumbers.length - recentNumbers.length)
  const displayedHistoryNumbers = historyNumbers.slice(historyConnectorCount)
  const allNumbersFromStart = recentNumbers.concat(historyNumbers).reverse()
  const allStatsFromStart = evolutionRecentHistory
  const signalSummary = useMemo(() => mapAllNumbersFromStart(evolutionRecentHistory), [evolutionRecentHistory])
  const highlightedSignalIndexes = useMemo(() => {
    const displayCount = recentNumbers.length + historyNumbers.length
    return new Set(signalSummary.signalIndexes.map((index) => displayCount - 1 - index))
  }, [historyNumbers.length, recentNumbers.length, signalSummary.signalIndexes])
  const highlightedLeadingSignalIndexes = useMemo(() => {
    const displayCount = recentNumbers.length + historyNumbers.length
    return new Set(signalSummary.leadingSignalIndexes.map((index) => displayCount - 1 - index))
  }, [historyNumbers.length, recentNumbers.length, signalSummary.leadingSignalIndexes])
  const highlightedWinningIndexes = useMemo(() => {
    const displayCount = recentNumbers.length + historyNumbers.length
    return new Set(signalSummary.winningIndexes.map((index) => displayCount - 1 - index))
  }, [historyNumbers.length, recentNumbers.length, signalSummary.winningIndexes])
  const highlightedLosingIndexes = useMemo(() => {
    const displayCount = recentNumbers.length + historyNumbers.length
    return new Set(signalSummary.losingIndexes.map((index) => displayCount - 1 - index))
  }, [historyNumbers.length, recentNumbers.length, signalSummary.losingIndexes])
  const signalOverviewValues = useMemo(() => {
    const resolvedSignals = signalSummary.wins + signalSummary.losses
    const pendingSignals = Math.max(0, signalSummary.signalsFound - resolvedSignals)
    return {
      totalCaptured: allNumbersFromStart.length,
      signalsFound: signalSummary.signalsFound,
      wins: signalSummary.wins,
      losses: signalSummary.losses,
      zeroLosses: signalSummary.zeroLosses,
      bestWinStreak: signalSummary.bestWinStreak,
      currentWinStreak: signalSummary.currentWinStreak,
      winStreaks: [...signalSummary.winStreaks],
      series: [...signalSummary.series],
      resolvedSignals,
      pendingSignals,
      winPct: resolvedSignals > 0 ? (signalSummary.wins / resolvedSignals) * 100 : 0,
      lossPct: resolvedSignals > 0 ? (signalSummary.losses / resolvedSignals) * 100 : 0
    }
  }, [allNumbersFromStart.length, signalSummary])
  const analyticsEndpointUrl = useMemo(
    () => resolveRouletteAnalyticsEndpointUrl(rouletteResultEndpointUrl),
    [rouletteResultEndpointUrl]
  )
  const analyticsRelayPayload = useMemo(() => {
    const displayCount = recentNumbers.length + historyNumbers.length
    const historyIndexOffset = recentNumbers.length + historyConnectorCount

    return {
      type: 'roulette.analytics',
      schemaVersion: 1,
      emittedAt: new Date().toISOString(),
      latestSpin: latestSpin
        ? {
            id: latestSpin.id,
            winningNumber: latestSpin.winningNumber,
            timestamp: latestSpin.timestamp,
            updatedAt: latestSpin.updatedAt
          }
        : null,
      mostRecent: {
        numbers: [...mostRecentNumbers],
        items: mapNumberStates(
          mostRecentNumbers,
          0,
          highlightedSignalIndexes,
          highlightedLeadingSignalIndexes,
          highlightedWinningIndexes,
          highlightedLosingIndexes
        )
      },
      historyNumbers: {
        numbers: [...displayedHistoryNumbers],
        indexOffset: historyIndexOffset,
        items: mapNumberStates(
          displayedHistoryNumbers,
          historyIndexOffset,
          highlightedSignalIndexes,
          highlightedLeadingSignalIndexes,
          highlightedWinningIndexes,
          highlightedLosingIndexes
        )
      },
      signalOverview: signalOverviewValues,
      analytics: {
        allNumbersFromStart: [...allNumbersFromStart],
        signalIndexes: [...signalSummary.signalIndexes],
        leadingSignalIndexes: [...signalSummary.leadingSignalIndexes],
        winningIndexes: [...signalSummary.winningIndexes],
        losingIndexes: [...signalSummary.losingIndexes],
        wins: mapOutcomeStates(signalSummary.winningIndexes, allNumbersFromStart, displayCount),
        losses: mapOutcomeStates(signalSummary.losingIndexes, allNumbersFromStart, displayCount)
      }
    }
  }, [
    allNumbersFromStart,
    displayedHistoryNumbers,
    highlightedLeadingSignalIndexes,
    highlightedLosingIndexes,
    highlightedSignalIndexes,
    highlightedWinningIndexes,
    historyConnectorCount,
    historyNumbers.length,
    latestSpin,
    mostRecentNumbers,
    recentNumbers.length,
    signalOverviewValues,
    signalSummary.leadingSignalIndexes,
    signalSummary.losingIndexes,
    signalSummary.signalIndexes,
    signalSummary.winningIndexes
  ])
  const analyticsRelaySignature = useMemo(
    () =>
      JSON.stringify({
        mostRecentNumbers,
        displayedHistoryNumbers,
        signalOverviewValues,
        winningIndexes: signalSummary.winningIndexes,
        losingIndexes: signalSummary.losingIndexes
      }),
    [
      displayedHistoryNumbers,
      mostRecentNumbers,
      signalOverviewValues,
      signalSummary.losingIndexes,
      signalSummary.winningIndexes
    ]
  )
  const lastAnalyticsRelaySignatureRef = useRef<string | null>(null)

  useEffect(() => {
    if (!analyticsEndpointUrl || allNumbersFromStart.length === 0) {
      return
    }

    if (lastAnalyticsRelaySignatureRef.current === analyticsRelaySignature) {
      return
    }

    lastAnalyticsRelaySignatureRef.current = analyticsRelaySignature
    void postJsonToEndpoint(analyticsRelayPayload, analyticsEndpointUrl, 'roulette analytics')
  }, [allNumbersFromStart.length, analyticsEndpointUrl, analyticsRelayPayload, analyticsRelaySignature])
  const stats = useMemo(() => {
    const total = winningNumbers.length
    if (total === 0) {
      return {
        zero: { count: 0, pct: 0 },
        dozens: [
          { count: 0, pct: 0 },
          { count: 0, pct: 0 },
          { count: 0, pct: 0 }
        ],
        columns: [
          { count: 0, pct: 0 },
          { count: 0, pct: 0 },
          { count: 0, pct: 0 }
        ],
        halves: [
          { count: 0, pct: 0 },
          { count: 0, pct: 0 }
        ],
        colors: { red: { count: 0, pct: 0 }, black: { count: 0, pct: 0 } },
        oddEven: { odd: { count: 0, pct: 0 }, even: { count: 0, pct: 0 } },
        streets: Array(12).fill({ count: 0, pct: 0 }),
        sections: { tier: { count: 0, pct: 0 }, orphelins: { count: 0, pct: 0 }, voisins: { count: 0, pct: 0 } },
        hotNumbers: [],
        coldNumbers: [],
        numberCounts: new Map<number, number>()
      }
    }

    // Count occurrences
    const numberCounts = new Map<number, number>()
    for (let i = 0; i <= 36; i++) numberCounts.set(i, 0)
    winningNumbers.forEach((n) => numberCounts.set(n, (numberCounts.get(n) || 0) + 1))

    // Zero percentage
    const zeroCount = numberCounts.get(0) || 0

    // Dozens
    const dozens = [
      winningNumbers.filter((n) => n >= 1 && n <= 12),
      winningNumbers.filter((n) => n >= 13 && n <= 24),
      winningNumbers.filter((n) => n >= 25 && n <= 36)
    ].map((arr) => ({ count: arr.length, pct: (arr.length / total) * 100 }))

    // Columns
    const columns = [
      winningNumbers.filter((n) => n > 0 && n % 3 === 1),
      winningNumbers.filter((n) => n > 0 && n % 3 === 2),
      winningNumbers.filter((n) => n > 0 && n % 3 === 0)
    ].map((arr) => ({ count: arr.length, pct: (arr.length / total) * 100 }))

    // Halves
    const halves = [
      winningNumbers.filter((n) => n >= 1 && n <= 18),
      winningNumbers.filter((n) => n >= 19 && n <= 36)
    ].map((arr) => ({ count: arr.length, pct: (arr.length / total) * 100 }))

    // Colors
    const redCount = winningNumbers.filter((n) => RED_NUMBERS.includes(n)).length
    const blackCount = winningNumbers.filter((n) => BLACK_NUMBERS.includes(n)).length

    // Odd/Even
    const oddCount = winningNumbers.filter((n) => n > 0 && n % 2 === 1).length
    const evenCount = winningNumbers.filter((n) => n > 0 && n % 2 === 0).length

    // Streets (1-3, 4-6, 7-9, etc.)
    const streets = Array.from({ length: 12 }, (_, i) => {
      const start = i * 3 + 1
      const end = start + 2
      const count = winningNumbers.filter((n) => n >= start && n <= end).length
      return { count, pct: (count / total) * 100 }
    })

    // Wheel sections
    const tierCount = winningNumbers.filter((n) => TIER_G.includes(n)).length
    const orphelinsCount = winningNumbers.filter((n) => ORPHELINS_G.includes(n)).length
    const voisinsCount = winningNumbers.filter((n) => VOISINS_G.includes(n)).length

    // Hot and Cold numbers
    const sortedNumbers = Array.from(numberCounts.entries()).sort((a, b) => b[1] - a[1])

    const hotNumbers = sortedNumbers.slice(0, 5).filter(([, count]) => count > 0)
    const coldNumbers = sortedNumbers
      .slice(-5)
      .reverse()
      .filter(([, count]) => count >= 0)

    return {
      zero: { count: zeroCount, pct: (zeroCount / total) * 100 },
      dozens,
      columns,
      halves,
      colors: {
        red: { count: redCount, pct: (redCount / total) * 100 },
        black: { count: blackCount, pct: (blackCount / total) * 100 }
      },
      oddEven: {
        odd: { count: oddCount, pct: (oddCount / total) * 100 },
        even: { count: evenCount, pct: (evenCount / total) * 100 }
      },
      streets,
      sections: {
        tier: { count: tierCount, pct: (tierCount / total) * 100 },
        orphelins: { count: orphelinsCount, pct: (orphelinsCount / total) * 100 },
        voisins: { count: voisinsCount, pct: (voisinsCount / total) * 100 }
      },
      hotNumbers,
      coldNumbers,
      numberCounts
    } as Stats
  }, [winningNumbers])

  return (
    <div className='space-y-2 text-white p-1 mt-2'>
      <div className='mx-auto space-y-0'>
        {/* Table History */}
        {evolutionRecentHistory.length > 0 && (
          <HistoryNumbers
            recents={mostRecentNumbers}
            highlightedIndexes={highlightedSignalIndexes}
            leadingSignalIndexes={highlightedLeadingSignalIndexes}
            winningIndexes={highlightedWinningIndexes}
            losingIndexes={highlightedLosingIndexes}
            indexOffset={recentNumbers.length + historyConnectorCount}
            numbers={evolutionRecentHistory}
          />
        )}
        {evolutionRecentHistory.length > 0 && (
          <SignalOverview total={mostRecentNumbers.length + evolutionRecentHistory.length} summary={signalSummary} />
        )}

        {/* Spacer */}
        <div id='h-pad' className='h-16 mt-8 w-full rounded-sm bg-neutral-950' />

        {/* Hot & Cold Numbers */}
        <HotAndColdNumbers hotNumbers={stats.hotNumbers} coldNumbers={stats.coldNumbers} />
        {/* Recent Numbers Strip */}
        <VPctOverview stats={stats} />

        {/* Stats Overview */}
        <StatsOverview stats={stats} />

        {/* RESET */}
        <div className={cn('rounded-lg border border-white/8 p-4', cardClassName)}>
          <div className='flex items-end justify-between gap-4'>
            <div className='space-y-1'>
              <p className='text-[8px] font-display uppercase tracking-wide text-neutral-500'>roulette</p>
              <h1 className='font-okx text-base font-semibold uppercase text-white'>Analytics</h1>
            </div>
            <button
              type='button'
              onClick={onReset}
              disabled={winningNumbers.length === 0}
              className='rounded-full border border-white/12 bg-white/5 px-3 py-1.5 transition hover:border-white/25 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'>
              <span className='text-xs font-okx font-medium uppercase tracking-[0.24em] text-neutral-200'>Reset</span>
            </button>
          </div>
          {winningNumbers.length > 0 && (
            <div className='mt-4 flex items-center justify-between gap-3 border-t border-white/8 pt-3 text-xs text-neutral-400'>
              <span className='font-okx'>{winningNumbers.length} tracked spins</span>
              <span className='font-okx'>Latest result: {winningNumbers[0]}</span>
            </div>
          )}
        </div>
        {/* Footer */}
        <div className='text-center py-4'>
          <p className='text-neutral-500 text-xs'>re-up.ph • v3.69</p>
        </div>
      </div>
    </div>
  )
}
