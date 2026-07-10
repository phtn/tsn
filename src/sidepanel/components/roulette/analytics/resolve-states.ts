import {
  getKimQuadrantsContainingPair,
  type KimQuadrantId,
  KIMS_ALGO_QUADRANTS,
  resolveKimQuadrantPreference,
  selectKimQuadrant
} from '../../../../lib/roulette'
import { getHotNumbers } from '../utils'
import type { SignalOutcome, SignalSummary } from './types'

function isRepeatSignalPair(first: number, second: number): boolean {
  return first !== 0 && first === second
}

function sortedIndexes(indexes: ReadonlySet<number>): number[] {
  return [...indexes].sort((left, right) => left - right)
}

/**
 * Resolves roulette history in chronological order.
 *
 * The caller must provide oldest-first numbers. Every returned index refers to
 * that same oldest-first array. The display layer can then reverse indexes
 * once when it renders the newest-first history tape.
 */
export function resolveRouletteSignalStates(allNumbersFromStart: readonly number[]): SignalSummary {
  let signalsFound = 0
  let wins = 0
  let losses = 0
  let zeroLosses = 0
  let currentWinStreak = 0
  let bestWinStreak = 0
  const winStreaks: number[] = []
  const signalIndexes = new Set<number>()
  const leadingSignalIndexes = new Set<number>()
  const winningIndexes = new Set<number>()
  const losingIndexes = new Set<number>()
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
    signalIndexes.add(index - 1)
    signalIndexes.add(index)
    leadingSignalIndexes.add(index)

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
        losingIndexes.add(spinIndex)
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
        winningIndexes.add(spinIndex)
        series.push('W')
        resolvedAt = spinIndex
        break
      }

      if (round === 5) {
        losses += 1
        losingIndexes.add(spinIndex)
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

    // There are not enough future spins to resolve this signal yet.
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
    signalIndexes: sortedIndexes(signalIndexes),
    leadingSignalIndexes: sortedIndexes(leadingSignalIndexes),
    winningIndexes: sortedIndexes(winningIndexes),
    losingIndexes: sortedIndexes(losingIndexes),
    series: series.reverse()
  }
}
