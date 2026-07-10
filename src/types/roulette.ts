export interface EvoRouletteResult {
  number: string
}

export interface EvoMessage {
  id: string
  type: string
  args: {
    gameId: string
    code: string
    description: string
    winSpots: Record<string, unknown>
    timestamp: string
    result: EvoRouletteResult[]
  }
  time: number
}

export interface PragmaticPlayGameResult {
  score: string
  pre: string
  megaWin: string
  color: string
  luckyWin: string
  id: string
  time: string
  seq: number
  value: string
}

export interface PragmaticPlayMessage {
  gameresult: PragmaticPlayGameResult
}

export interface LobbyTableHistory {
  tableId: string
  numbers: number[]
}

interface RouletteSpinResultBase {
  id: string
  provider: 'stake' | 'bet88' | 'okbet'
  source: 'evolution' | 'pragmatic-play'
  game: 'roulette'
  description: string
  winningNumber: number
  timestamp: number
  updatedAt: string
  url: string
}

export interface EvolutionRouletteSpinResult extends RouletteSpinResultBase {
  provider: 'stake'
  source: 'evolution'
  eventType: 'winSpots'
  gameId: string
  code: string
  winSpots: Record<string, unknown>
  resultNumbers: number[]
  /** Display name read from [data-role="table-name"] in the Evolution iframe. */
  tableName?: string
}

export interface PragmaticPlayRouletteSpinResult extends RouletteSpinResultBase {
  provider: 'bet88' | 'okbet'
  source: 'pragmatic-play'
  eventType: 'gameresult'
  score: string
  color: string
  sequence: number
  rawValue: string
  isPreResult: boolean
  isMegaWin: boolean
  isLuckyWin: boolean
}

export type RouletteSpinResult = EvolutionRouletteSpinResult | PragmaticPlayRouletteSpinResult

export interface RouletteStoredData {
  results: RouletteSpinResult[]
  totalSpins: number
  latestNumber: number | null
  latestTimestamp: number | null
}

export const EMPTY_ROULETTE_STORED_DATA: RouletteStoredData = {
  results: [],
  totalSpins: 0,
  latestNumber: null,
  latestTimestamp: null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isResultNumbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 36)
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function hasBaseRouletteSpinFields(value: unknown): value is RouletteSpinResultBase {
  const winningNumber = isRecord(value) ? value.winningNumber : null

  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.game === 'roulette' &&
    typeof value.description === 'string' &&
    typeof winningNumber === 'number' &&
    Number.isInteger(winningNumber) &&
    winningNumber >= 0 &&
    winningNumber <= 36 &&
    isFiniteNumber(value.timestamp) &&
    typeof value.updatedAt === 'string' &&
    typeof value.url === 'string'
  )
}

function isEvolutionRouletteSpinResult(value: unknown): value is EvolutionRouletteSpinResult {
  return (
    hasBaseRouletteSpinFields(value) &&
    isRecord(value) &&
    value.provider === 'stake' &&
    value.source === 'evolution' &&
    value.eventType === 'winSpots' &&
    typeof value.gameId === 'string' &&
    typeof value.code === 'string' &&
    isRecord(value.winSpots) &&
    isResultNumbers(value.resultNumbers)
  )
}

function isPragmaticPlayRouletteSpinResult(value: unknown): value is PragmaticPlayRouletteSpinResult {
  return (
    hasBaseRouletteSpinFields(value) &&
    isRecord(value) &&
    value.provider === 'bet88' &&
    value.source === 'pragmatic-play' &&
    value.eventType === 'gameresult' &&
    typeof value.score === 'string' &&
    typeof value.color === 'string' &&
    typeof value.sequence === 'number' &&
    typeof value.rawValue === 'string' &&
    isBoolean(value.isPreResult) &&
    isBoolean(value.isMegaWin) &&
    isBoolean(value.isLuckyWin)
  )
}

function isRouletteSpinResult(value: unknown): value is RouletteSpinResult {
  return isEvolutionRouletteSpinResult(value) || isPragmaticPlayRouletteSpinResult(value)
}

export function summarizeRouletteResults(results: RouletteSpinResult[]): RouletteStoredData {
  const latestResult = results[results.length - 1] ?? null

  return {
    results,
    totalSpins: results.length,
    latestNumber: latestResult?.winningNumber ?? null,
    latestTimestamp: latestResult?.timestamp ?? null
  }
}

export function normalizeRouletteStoredData(stored: unknown): RouletteStoredData {
  if (!isRecord(stored) || !Array.isArray(stored.results)) {
    return EMPTY_ROULETTE_STORED_DATA
  }

  return summarizeRouletteResults(stored.results.filter(isRouletteSpinResult))
}

export type TableState = 'BETS_OPEN' | 'BETS_CLOSING_SOON' | 'BETS_CLOSED' | 'BETS_CLOSED_ANNOUNCED' | 'GAME_RESOLVED'

/*
Example:
{
    "id": "1774039601601-4617",
    "type": "roulette.winSpots",
    "args": {
        "gameId": "189ea79258a86b5733ad6074",
        "code": "36",
        "description": "36 Red",
        "winSpots": {},
        "timestamp": "2026-03-20T20:46:41.577Z",
        "result": [
            {
                "number": "36"
            }
        ]
    },
    "time": 1774039601601
}
*/
