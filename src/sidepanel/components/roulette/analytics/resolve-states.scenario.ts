import { resolveRouletteHistory, resolveRouletteSignalStates } from './resolve-states'

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)

  if (actualJson !== expectedJson) {
    throw new Error(`${label}\nExpected: ${expectedJson}\nReceived: ${actualJson}`)
  }
}

const chainedSummary = resolveRouletteSignalStates([1, 2, 9, 10, 11, 0, 3])
assertEqual(
  chainedSummary,
  {
    signalsFound: 2,
    wins: 1,
    losses: 1,
    zeroLosses: 1,
    bestWinStreak: 1,
    currentWinStreak: 0,
    winStreaks: [1],
    signalIndexes: [0, 1, 3, 4],
    leadingSignalIndexes: [1, 4],
    winningIndexes: [4],
    losingIndexes: [5],
    series: ['0', 'W']
  },
  'chained signals and early-zero loss'
)

const fifthRoundLoss = resolveRouletteSignalStates([1, 2, 9, 15, 21, 27, 33])
assertEqual(
  {
    signalsFound: fifthRoundLoss.signalsFound,
    wins: fifthRoundLoss.wins,
    losses: fifthRoundLoss.losses,
    zeroLosses: fifthRoundLoss.zeroLosses,
    losingIndexes: fifthRoundLoss.losingIndexes,
    series: fifthRoundLoss.series
  },
  {
    signalsFound: 1,
    wins: 0,
    losses: 1,
    zeroLosses: 0,
    losingIndexes: [6],
    series: ['L']
  },
  'fifth-round loss'
)

const resolvedHistory = resolveRouletteHistory([3, 0, 11, 10, 9, 2, 1])
assertEqual(
  resolvedHistory.allNumbersFromStart,
  [1, 2, 9, 10, 11, 0, 3],
  'newest-first to chronological ordering'
)
assertEqual(
  resolvedHistory.items,
  [
    { index: 0, number: 3, highlighted: false, leadingSignal: false, winning: false, losing: false },
    { index: 1, number: 0, highlighted: false, leadingSignal: false, winning: false, losing: true },
    { index: 2, number: 11, highlighted: true, leadingSignal: true, winning: true, losing: false },
    { index: 3, number: 10, highlighted: true, leadingSignal: false, winning: false, losing: false },
    { index: 4, number: 9, highlighted: false, leadingSignal: false, winning: false, losing: false },
    { index: 5, number: 2, highlighted: true, leadingSignal: true, winning: false, losing: false },
    { index: 6, number: 1, highlighted: true, leadingSignal: false, winning: false, losing: false }
  ],
  '/api/bets/r3 newest-first item states'
)

console.log('roulette analytics resolver scenarios passed')
