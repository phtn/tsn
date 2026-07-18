import { getEvolutionRecentNumbersForTable, type EvolutionLobbyHistory } from './evolution-recent-numbers'

function assertNumbers(actual: readonly number[], expected: readonly number[], label: string): void {
  if (actual.length !== expected.length || actual.some((number, index) => number !== expected[index])) {
    throw new Error(`${label}\nExpected: ${expected.join(',')}\nReceived: ${actual.join(',')}`)
  }
}

const lobbyHistories: EvolutionLobbyHistory[] = [
  { tableId: 'speedautoro00001', numbers: [12, 8, 31, 4] }
]

assertNumbers(
  getEvolutionRecentNumbersForTable([19, 12, 8, 31], lobbyHistories, 'Speed Auto Roulette', 'speedautoro00001'),
  [19, 12, 8, 31],
  'live DOM numbers must take precedence over stale lobby history'
)

assertNumbers(
  getEvolutionRecentNumbersForTable([], lobbyHistories, 'Speed Auto Roulette', 'speedautoro00001'),
  [12, 8, 31, 4],
  'lobby history should seed the board while the live DOM feed is empty'
)

console.log('evolution recent-number source scenarios passed')
