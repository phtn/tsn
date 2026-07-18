import { getEvolutionTableDisplayName } from './evolution-tables'

export interface EvolutionLobbyHistory {
  tableId: string
  numbers: number[]
}

export function normalizeEvolutionRecentNumbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 36)
    : []
}

export function normalizeEvolutionLobbyHistories(value: unknown): EvolutionLobbyHistory[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry): EvolutionLobbyHistory | null => {
      if (typeof entry !== 'object' || entry === null) return null

      const tableId = (entry as Record<string, unknown>).tableId
      const numbers = normalizeEvolutionRecentNumbers((entry as Record<string, unknown>).numbers)
      if (typeof tableId !== 'string' || numbers.length === 0) return null

      return { tableId, numbers }
    })
    .filter((entry): entry is EvolutionLobbyHistory => entry !== null)
}

export function getEvolutionRecentNumbersForTable(
  scrapedRecentNumbers: readonly number[],
  lobbyHistories: readonly EvolutionLobbyHistory[],
  tableName: string | null,
  tableId?: string | null
): number[] {
  // The in-table DOM sequence is the live feed consumed by the virtual board.
  // Lobby history is only a startup fallback because it may update less often.
  if (scrapedRecentNumbers.length > 0) return [...scrapedRecentNumbers]

  if (tableId) {
    const tableHistory = lobbyHistories.find((history) => history.tableId === tableId)
    if (tableHistory) return [...tableHistory.numbers]
  }

  const normalizedTableName = tableName?.trim().toLowerCase()
  if (!normalizedTableName) return [...scrapedRecentNumbers]

  const tableHistory = lobbyHistories.find(({ tableId }) => {
    const displayName = getEvolutionTableDisplayName(tableId)
    return displayName?.toLowerCase() === normalizedTableName
  })

  // Both Evolution sources are newest-first.
  return tableHistory ? [...tableHistory.numbers] : [...scrapedRecentNumbers]
}
