import type { LobbyTableHistory, RouletteSpinResult } from '@/src/types/roulette'
import { FC, type ReactNode, useEffect, useMemo, useRef } from 'react'
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
import { tmap } from './tables'
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

interface SignalSummary {
  signalsFound: number
  wins: number
  losses: number
  zeroLosses: number
  bestWinStreak: number
  currentWinStreak: number
  winStreaks: number[]
  signalIndexes: number[]
  leadingSignalIndexes: number[]
  winningIndexes: number[]
  losingIndexes: number[]
  series: SignalOutcome[]
}

type SignalOutcome = 'W' | 'L' | '0'

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
  const mostRecentNumbers = recentNumbers.concat(historyNumbers).slice(0, 13)
  const historyConnectorCount = Math.max(0, mostRecentNumbers.length - recentNumbers.length)
  const displayedHistoryNumbers = historyNumbers.slice(historyConnectorCount)
  const allNumbersFromStart = recentNumbers.concat(historyNumbers).reverse()
  const signalSummary = useMemo(() => mapAllNumbersFromStart(allNumbersFromStart), [allNumbersFromStart])
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
    <div className='space-y-2 text-white p-1'>
      <div className='mx-auto space-y-0'>
        {/* Table History */}
        {mostRecentNumbers.length > 0 && (
          <MostRecentNumbers
            highlightedIndexes={highlightedSignalIndexes}
            leadingSignalIndexes={highlightedLeadingSignalIndexes}
            winningIndexes={highlightedWinningIndexes}
            losingIndexes={highlightedLosingIndexes}
            numbers={mostRecentNumbers}
          />
        )}
        {displayedHistoryNumbers.length > 0 && (
          <HistoryNumbers
            highlightedIndexes={highlightedSignalIndexes}
            leadingSignalIndexes={highlightedLeadingSignalIndexes}
            winningIndexes={highlightedWinningIndexes}
            losingIndexes={highlightedLosingIndexes}
            indexOffset={recentNumbers.length + historyConnectorCount}
            numbers={displayedHistoryNumbers}
          />
        )}
        {allNumbersFromStart.length > 0 && (
          <SignalOverview label={`Analysis`} total={allNumbersFromStart.length} summary={signalSummary} />
        )}

        {/* Hot & Cold Numbers */}
        <HotAndColdNumbers hotNumbers={stats.hotNumbers} coldNumbers={stats.coldNumbers} />
        {/* Recent Numbers Strip */}
        <VPctOverview stats={stats} />

        {/* Stats Overview */}
        <StatsOverview stats={stats} />

        {/* Streets Overview */}
        {/*<div className={cn('rounded-lg px-4 pb-3 bg-neutral-700')}>
          <h2 className='font-okx font-semibold text-white uppercase py-2'>Streets</h2>
          <div className='grid grid-cols-12 gap-1.5'>
            {stats.streets.map((street, idx) => {
              const start = idx * 3 + 1
              return (
                <div key={idx} className=' bg-neutral-800/50 pt-2 pb-1 rounded-full flex items-center justify-center '>
                  <div className='relative z-10 h-20 font-medium text-neutral-300 text-sm text-center'>
                    <div className='absolute z-0 bottom-0 rounded-full left-0 w-7 h-18'>
                      <div
                        className='absolute bottom-0 w-7 bg-linear-to-t from-emerald-400/50 via-emerald-400/40 to-emerald-30 rounded-full transition-all duration-500'
                        style={{ height: `${Math.min(street.pct * 3 * 2, 100)}%` }}
                      />
                    </div>
                    <p className='font-okx text-center relative z-10'>{start + 2}</p>
                    <p className='font-okx text-center relative z-10'>{start + 1}</p>
                    <p className='font-okx text-center relative z-10'>{start}</p>
                    <p className='font-okx font-semibold text-emerald-100 text-xs text-center relative z-10 w-7'>
                      {street.pct.toFixed(1)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
*/}
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

const MostRecentNumbers = ({
  numbers,
  highlightedIndexes,
  leadingSignalIndexes,
  winningIndexes,
  losingIndexes
}: {
  numbers: number[]
  highlightedIndexes: ReadonlySet<number>
  leadingSignalIndexes: ReadonlySet<number>
  winningIndexes: ReadonlySet<number>
  losingIndexes: ReadonlySet<number>
}) => {
  const displayedNumbers = numbers.slice(0, 13)

  return (
    <div className={cn('rounded-sm p-2 space-y-2 bg-neutral-900')}>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <h2 className='font-okx font-medium text-neutral-200 text-xs uppercase'>Recents</h2>
        </div>
        <p className='font-okx text-neutral-300 text-xs'>{displayedNumbers.length}</p>
      </div>
      <div className='flex max-h-60 flex-wrap gap-0.75 overflow-y-auto pr-1'>
        {displayedNumbers.map((number, index) => (
          <LobbyNumber
            key={`${number}-${index}`}
            highlighted={highlightedIndexes.has(index)}
            leadingSignal={leadingSignalIndexes.has(index)}
            winning={winningIndexes.has(index)}
            losing={losingIndexes.has(index)}
            number={number}
          />
        ))}
      </div>
    </div>
  )
}

const HistoryNumbers = ({
  numbers,
  highlightedIndexes,
  leadingSignalIndexes,
  winningIndexes,
  losingIndexes,
  indexOffset = 0
}: {
  numbers: number[]
  highlightedIndexes: ReadonlySet<number>
  leadingSignalIndexes: ReadonlySet<number>
  winningIndexes: ReadonlySet<number>
  losingIndexes: ReadonlySet<number>
  indexOffset?: number
}) => (
  <div className={cn('rounded-sm p-2 space-y-2 bg-neutral-900')}>
    <div className='flex items-center justify-between gap-3'>
      <div>
        <h2 className='font-okx text-xs font-medium uppercase text-neutral-200'>History</h2>
      </div>
      <p className='font-okx text-xs text-neutral-300'>{numbers.length}</p>
    </div>
    <div className='flex max-h-36 flex-wrap gap-0.75 overflow-y-auto'>
      {numbers.map((number, index) => (
        <LobbyNumber
          key={`${number}-${index}`}
          highlighted={highlightedIndexes.has(index + indexOffset)}
          leadingSignal={leadingSignalIndexes.has(index + indexOffset)}
          winning={winningIndexes.has(index + indexOffset)}
          losing={losingIndexes.has(index + indexOffset)}
          number={number}
        />
      ))}
    </div>
  </div>
)

interface SignalOverviewProps {
  label: string
  total: number
  summary: SignalSummary
}

const SignalOverview = ({ label, total, summary }: SignalOverviewProps) => {
  const resolvedSignals = summary.wins + summary.losses
  const pendingSignals = Math.max(0, summary.signalsFound - resolvedSignals)
  const winPct = resolvedSignals > 0 ? (summary.wins / resolvedSignals) * 100 : 0
  const lossPct = resolvedSignals > 0 ? (summary.losses / resolvedSignals) * 100 : 0

  return (
    <div className={cn('rounded-sm space-y-1 p-2 bg-neutral-900')}>
      <div className='flex items-end justify-between gap-3'>
        <div>
          <p className='font-okx text-xs font-medium uppercase text-neutral-200'>{label}</p>
        </div>
        <p className='text-xs font-okx text-neutral-300'>{total} captured</p>
      </div>
      <div className='grid grid-cols-4 gap-1 text-xs'>
        <StatCard
          title='Signals'
          value={
            <div className='flex items-end justify-between w-full'>
              <span>{summary.signalsFound}</span>
              <span className='font-light text-base text-slate-200'>{pendingSignals ? 'S' : 'I'}</span>
            </div>
          }
          color='sky'
        />
        <StatCard
          title='Wins'
          value={
            <div className='flex items-end justify-between w-full'>
              <span>{summary.wins}</span>
              <span className='font-light text-base text-slate-100'>
                {winPct.toFixed(0)}
                <span className='font-thin text-xs'>%</span>
              </span>
            </div>
          }
          color='gold'
        />
        <StatCard
          title='Losses'
          value={
            <div className='flex items-end justify-between w-full'>
              <span>{summary.losses}</span>
              <span className='font-light text-base text-slate-100'>
                {lossPct.toFixed(0)}
                <span className='font-thin text-xs'>%</span>
              </span>
            </div>
          }
          color='rose'
        />
        <StatCard title='Best Streak' value={summary.bestWinStreak} color='neutral' />
      </div>
      <div className='flex flex-wrap gap-1'>
        {summary.series.slice(0, 39).map((outcome, index) => (
          <span
            key={`${outcome}-${index}`}
            className={cn(
              'inline-flex h-7 min-w-8 items-center justify-center rounded-xs px-1 text-[12px] font-okx font-semibold',
              outcome === 'W'
                ? 'bg-amber-300/30 text-amber-100'
                : outcome === '0'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-zinc-300/20 text-zinc-200'
            )}>
            {outcome}
          </span>
        ))}
      </div>
      <p className='font-okx text-xs font-medium uppercase text-neutral-200 space-x-4 mt-1'>
        <span>Zero {summary.zeroLosses} </span>
        <span>&middot;</span>
        <span>Swipes {summary.losses}</span>
      </p>
    </div>
  )
}

interface StatCardProps {
  title: string
  value: ReactNode
  subtitle?: string
  icon?: ReactNode
  trend?: 'up' | 'down' | 'neutral'
  color?: 'emerald' | 'neutral' | 'rose' | 'gold' | 'sky'
  extra?: ReactNode
}

const STAT_VALUE_CLASS_NAME: Record<NonNullable<StatCardProps['color']>, string> = {
  emerald: 'bg-linear-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent',
  neutral: 'bg-linear-to-r from-neutral-200 to-neutral-400 bg-clip-text text-transparent',
  rose: 'bg-linear-to-r from-red-200 to-red-200 bg-clip-text text-transparent',
  gold: 'bg-linear-to-r from-yellow-300 to-yellow-200 bg-clip-text text-transparent',
  sky: 'bg-linear-to-r from-sky-500 to-sky-500 bg-clip-text text-transparent'
}

const StatCard: FC<StatCardProps> = ({ title, value, trend, color = 'emerald', extra }) => (
  <div className={cn('rounded-xs p-1.5 bg-neutral-700 space-y-1.5')}>
    <div className='flex items-center justify-between'>
      <span className='text-[9px] font-ios text-neutral-300 uppercase tracking-widest'>{title}</span>
      {extra}
    </div>
    <div className='flex items-end w-full'>
      <div className={cn('text-xl font-medium w-full', STAT_VALUE_CLASS_NAME[color])}>{value}</div>
      {trend && (
        <span
          className={` ${trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-rose-400' : 'text-neutral-400'}`}>
          {trend === 'up' ? (
            <span className='size-4'>up</span>
          ) : trend === 'down' ? (
            <span className='size-4'>down</span>
          ) : // <TrendingDown size={16} />
          null}
        </span>
      )}
    </div>
  </div>
)

const StatsOverview = ({ stats }: { stats: Stats }) => (
  <div className='grid grid-cols-4 gap-1'>
    <StatCard
      title='EVEN'
      value={`${stats.oddEven.even.pct.toFixed(1)}%`}
      subtitle={`${stats.oddEven.even.count}`}
      color='neutral'
    />
    <StatCard
      title='RED'
      value={`${stats.colors.red.pct.toFixed(1)}%`}
      subtitle={`${stats.colors.red.count}`}
      color='rose'
    />
    <StatCard
      title='BLACK'
      value={`${stats.colors.black.pct.toFixed(1)}%`}
      subtitle={`${stats.colors.black.count}`}
      color='neutral'
    />
    <StatCard
      title='ODD'
      value={`${stats.oddEven.odd.pct.toFixed(1)}%`}
      subtitle={`${stats.oddEven.odd.count}`}
      color='neutral'
    />
  </div>
)

interface HotAndColdNumbersProps {
  hotNumbers: [number, number][]
  coldNumbers: [number, number][]
}

const HotAndColdNumbers = ({ hotNumbers, coldNumbers }: HotAndColdNumbersProps) => (
  <div className={cn('grid grid-cols-2 gap-1 px-1 py-2 bg-neutral-950 mt-4')}>
    <div className={cn('')}>
      <div className='flex flex-wrap gap-1.5'>
        <div className='p-0.5 h-4'>
          <span className='font-bold text-orange-300 text-xs uppercase'>H</span>
        </div>
        {hotNumbers.length > 0 ? (
          hotNumbers.map(([num, count]) => <NumberBadge key={num} number={num} count={count} isHot={true} />)
        ) : (
          <p className='text-neutral-500 text-sm'>Awaiting data...</p>
        )}
      </div>
    </div>

    <div className={cn('')}>
      <div className='flex flex-wrap gap-1.5 justify-end'>
        <div className='p-0.5 h-4'>
          <span className='font-bold text-cyan-400 text-xs uppercase'>C</span>
        </div>
        {coldNumbers.length > 0 ? (
          coldNumbers.map(([num, count]) => <NumberBadge key={num} number={num} count={count} isHot={false} />)
        ) : (
          <p className='text-neutral-500 text-sm'>No data yet</p>
        )}
      </div>
    </div>
  </div>
)

interface PercentageBarProps {
  label: string
  percentage: number
  color: string
  count: number
}

const PercentageBar: FC<PercentageBarProps> = ({ label, percentage, color, count }) => (
  <div className='group'>
    <div className='flex justify-between items-center mb-1.5'>
      <span className='text-xs text-neutral-300'>{label}</span>
      <div className='flex items-center gap-2'>
        <span className='text-xs text-neutral-500'>({count})</span>
        <span className='text-sm font-semibold text-neutral-200'>{percentage.toFixed(1)}%</span>
      </div>
    </div>
    <div className='h-2 bg-neutral-700/50 rounded-full overflow-hidden'>
      <div
        className={`h-full ${color} rounded-full transition-all duration-700 ease-out group-hover:shadow-lg`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  </div>
)

const VPctBar: FC<PercentageBarProps & { cols?: string }> = ({ label, percentage, color, count, cols }) => (
  <div className={cn('group', cols)}>
    <div className={cn('relative h-10 bg-neutral-700 rounded-t-sm overflow-hidden flex items-end')}>
      <div
        className={`w-full ${color} rounded-xs rounded-b-none transition-all duration-700 ease-out group-hover:shadow-lg`}
        style={{ height: `${Math.min(percentage, 100) + 0.66}%` }}
      />

      <span className='absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 text-sm font-semibold text-neutral-200'>
        {percentage.toFixed(1)}%
      </span>
    </div>
    <div className='flex items-center justify-center space-x-2 mt-1.5'>
      <span className='text-xs text-neutral-300'>{label}</span>
      <span className='text-xs text-neutral-500'>{count}</span>
    </div>
  </div>
)

const VPctOverview = ({ stats }: { stats: Stats }) => (
  <div className='grid grid-cols-11 gap-1'>
    <VPctBar
      label='ZERO'
      percentage={stats.zero.pct}
      color='bg-linear-to-b from-emerald-500 to-emerald-600'
      count={stats.zero.count}
      cols='col-span-2'
    />
    <VPctBar
      label='1 - 12'
      percentage={stats.dozens[0].pct}
      color='bg-linear-to-b from-cyan-300/50 to-cyan-500'
      count={stats.dozens[0].count}
      cols='col-span-3'
    />
    <VPctBar
      label='13 - 24'
      percentage={stats.dozens[1].pct}
      color='bg-linear-to-b from-sky-300/50 to-sky-500'
      count={stats.dozens[1].count}
      cols='col-span-3'
    />
    <VPctBar
      label='25 - 36'
      percentage={stats.dozens[2].pct}
      color='bg-linear-to-b from-blue-300/50 to-blue-500'
      count={stats.dozens[2].count}
      cols='col-span-3'
    />
  </div>
)

interface NumberBadgeProps {
  number: number
  count: number
  isHot?: boolean
  showCount?: boolean
}

const NumberBadge: FC<NumberBadgeProps> = ({ number, count, isHot = true, showCount = true }) => {
  const getColor = (num: number) => {
    if (num === 0) return 'bg-linear-to-br from-emerald-500 to-emerald-600'
    if (RED_NUMBERS.includes(num)) return 'bg-linear-to-br from-[#B51B13] to-rose-600/80'
    return 'bg-linear-to-br from-neutral-600 to-neutral-700'
  }

  return (
    <div className='relative group'>
      <div
        className={`w-7 h-5.5 ${getColor(number)} rounded-xs flex items-center justify-center font-semibold text-white hover:scale-110 hover:shadow-lg ${isHot ? 'hover:shadow-rose-500/20' : 'hover:shadow-cyan-500/20'}`}>
        <span className='font-semibold text-base'>{number}</span>
      </div>
      {showCount && (
        <div
          className={`absolute -top-1.5 -right-0.5 w-3.5 h-3 rounded-xs flex items-center justify-center text-[8px] font-medium text-white ${isHot ? 'bg-orange-200/20' : 'bg-cyan-100/20'} backdrop-blur-3xl`}>
          {count}
        </div>
      )}
    </div>
  )
}

const LobbyNumber: FC<{
  number: number
  highlighted?: boolean
  leadingSignal?: boolean
  winning?: boolean
  losing?: boolean
}> = ({ number, highlighted = false, leadingSignal = false, winning = false, losing = false }) => {
  const color =
    winning && leadingSignal
      ? 'bg-pink-400 text-neutral-50'
      : winning
        ? 'bg-yellow-300 text-neutral-900'
        : losing
          ? 'bg-red-500 text-white'
          : leadingSignal
            ? 'bg-pink-400 text-neutral-50'
            : highlighted
              ? 'bg-sky-600 text-neutral-100'
              : number === 0
                ? 'bg-emerald-700 text-white'
                : RED_NUMBERS.includes(number)
                  ? 'bg-neutral-100 text-red-600'
                  : 'bg-neutral-500 text-white'
  return (
    <span
      className={`${color} min-w-6 max-w-8 min-h-5 max-h-5 rounded-none flex items-center justify-center text-[13px] font-semibold`}>
      {number}
    </span>
  )
}

interface LobbyHistoriesProps {
  data: { tableId: string; numbers: number[] }[]
}

const LobbyHistories = ({ data }: LobbyHistoriesProps) => (
  <div className={cn('rounded-sm p-3 space-y-1 bg-neutral-900')}>
    {data.map(({ tableId, numbers }) => (
      <div key={tableId} className='flex items-center gap-3'>
        <span className='text-xs uppercase text-neutral-200 min-w-48 shrink-0 truncate' title={tableId}>
          {
            tmap[
              `${tableId
                .replace(/0+$/, '')
                .replace(/^[A-Z][a-z]+/, '')
                .toLowerCase()}` as keyof typeof tmap
            ]
          }
        </span>
        <div className='flex gap-0.5 bg-white/40 p-0.5 rounded-xs'>
          {numbers.slice(0, 11).map((n, i) => (
            <LobbyNumber key={i} number={n} />
          ))}
        </div>
      </div>
    ))}
  </div>
)
