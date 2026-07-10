import type { LobbyTableHistory, RouletteSpinResult } from '@/src/types/roulette'
import { FC, useEffect, useMemo, useRef } from 'react'
import { postJsonToEndpoint } from '../../../../lib/relayEndpoints'
import { BLACK_NUMBERS, ORPHELINS_G, RED_NUMBERS, TIER_G, VOISINS_G } from '../../../../lib/roulette'
import { cn } from '../../../../lib/utils'
import { ClassName } from '../../../../types'
import { Stats } from '../types'
import { HistoryNumbers, SignalOverview } from './history'
import { resolveRouletteSignalStates } from './resolve-states'
import { HotAndColdNumbers, StatsOverview, VPctOverview } from './stats'

export const cardClassName: ClassName = `border-zinc-800 bg-[linear-gradient(180deg,rgba(255,255,255,0.01),rgba(255,255,255,0)),linear-gradient(180deg,rgba(31,35,41,0.96),rgba(12,14,19,0.9))]`

type AnalyticsProps = {
  // winningNumbers?: readonly number[]
  lobbyHistories?: LobbyTableHistory[]
  evolutionRecentNumbers?: number[]
  evolutionRecentHistory?: number[]
  evolutionReviewCombinedNumbers?: number[]
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

export const Analytics: FC<AnalyticsProps> = ({
  results,
  lobbyHistories = [],
  evolutionRecentNumbers = [],
  evolutionRecentHistory = [],
  evolutionReviewCombinedNumbers = [],
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
  // All history sources are newest-first. Prefer the review capture when it
  // exists because it is already the single combined recent+statistics tape.
  const allNumbersNewestFirst =
    evolutionReviewCombinedNumbers.length > 0 ? evolutionReviewCombinedNumbers : recentNumbers.concat(historyNumbers)
  const numbersSignature = allNumbersNewestFirst.join(',')
  const allNumbersFromStart = useMemo(() => [...allNumbersNewestFirst].reverse(), [numbersSignature])
  const mostRecentNumbers = allNumbersNewestFirst.slice(0, 13)
  const displayedHistoryNumbers = allNumbersNewestFirst.slice(mostRecentNumbers.length)
  const displayCount = allNumbersNewestFirst.length
  const signalSummary = useMemo(() => resolveRouletteSignalStates(allNumbersFromStart), [numbersSignature])
  const highlightedSignalIndexes = useMemo(() => {
    return new Set(signalSummary.signalIndexes.map((index) => displayCount - 1 - index))
  }, [displayCount, signalSummary.signalIndexes])
  const highlightedLeadingSignalIndexes = useMemo(() => {
    return new Set(signalSummary.leadingSignalIndexes.map((index) => displayCount - 1 - index))
  }, [displayCount, signalSummary.leadingSignalIndexes])
  const highlightedWinningIndexes = useMemo(() => {
    return new Set(signalSummary.winningIndexes.map((index) => displayCount - 1 - index))
  }, [displayCount, signalSummary.winningIndexes])
  const highlightedLosingIndexes = useMemo(() => {
    return new Set(signalSummary.losingIndexes.map((index) => displayCount - 1 - index))
  }, [displayCount, signalSummary.losingIndexes])
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
    const historyIndexOffset = mostRecentNumbers.length

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
    latestSpin,
    mostRecentNumbers,
    numbersSignature,
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
      <div className='mx-auto space-y-4'>
        {/* Table History */}
        {allNumbersNewestFirst.length > 0 && (
          <HistoryNumbers
            recents={[]}
            highlightedIndexes={highlightedSignalIndexes}
            leadingSignalIndexes={highlightedLeadingSignalIndexes}
            winningIndexes={highlightedWinningIndexes}
            losingIndexes={highlightedLosingIndexes}
            numbers={allNumbersNewestFirst}
          />
        )}
        {allNumbersNewestFirst.length > 0 && (
          <SignalOverview total={allNumbersNewestFirst.length} summary={signalSummary} />
        )}

        {/* Spacer */}
        <div id='h-pad' className='h-16 mt-8 w-full rounded-sm bg-neutral-950' />

        {/* Hot & Cold Numbers */}
        <HotAndColdNumbers hotNumbers={stats.hotNumbers} coldNumbers={stats.coldNumbers} />

        <div className='space-y-8 bg-[linear-gradient(180deg,rgba(255,255,255,0.01),rgba(255,255,255,0)),linear-gradient(180deg,rgba(31,35,41,0.96),rgba(12,14,19,0.9))]'>
          {/* Recent Numbers Strip */}
          <VPctOverview stats={stats} />

          {/* Stats Overview */}
          <StatsOverview stats={stats} />
        </div>

        {/* RESET */}
        <div className={cn('rounded-lg border border-white/8 p-4 bg-neutral-950')}>
          <div className='flex items-end justify-between gap-4'>
            <div className='space-y-1'>
              <p className='text-[9px] font-sans uppercase tracking-wide text-neutral-500'>re-up.ph</p>
              <h1 className='font-display font-semibold text-white text-base uppercase'>Analytics</h1>
            </div>
            <button
              type='button'
              onClick={onReset}
              disabled={winningNumbers.length === 0}
              className='rounded-full border border-white/12 bg-white/5 px-3 py-1.5 transition hover:border-white/25 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40'>
              <span className='text-xs font-sans font-medium tracking-wide text-neutral-200'>Reset</span>
            </button>
          </div>
        </div>
        {/* Footer */}
        <div className='text-center py-4'>
          <p className='text-neutral-500 text-xs'>re-up.ph • v3.6.9</p>
        </div>
      </div>
    </div>
  )
}
