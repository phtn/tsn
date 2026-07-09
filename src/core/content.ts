import { applyPaperBankrollToRound } from '../lib/paper-bankroll'
import { resolveFinancialOutcome } from '../lib/result-outcome'
import type { RouletteLobbyHistoriesCapture } from '../lib/rouletteLobbyHistories'
import { extractTennisEvents, hasTennisSurface } from '../lib/tennis/scrape'
import {
  normalizeStoredData,
  normalizeVirtualBankroll,
  summarizeResults,
  type GameResult,
  type SupportedGameKey
} from '../types'
import type { Bet88, Bet88Dice, Bet88Keno, Bet88Limbo, Bet88Mines } from '../types/bet88'
import {
  normalizeRouletteStoredData,
  summarizeRouletteResults,
  type EvoMessage,
  type LobbyTableHistory,
  type PragmaticPlayMessage,
  type RouletteSpinResult
} from '../types/roulette'
import type {
  Stake,
  StakeDice,
  StakeKeno,
  StakeLimbo,
  StakeMinesBet,
  StakeMinesCashOut,
  StakeMinesNext
} from '../types/stake'
import { summarizeTennisEvents, type TennisEvent } from '../types/tennis'
import { getSupportedSite } from './siteConfig'

interface InterceptedNetworkPayload {
  url: string
  method: string
  status: number
  data: unknown
  requestBody?: unknown
  timestamp: number
  transport?: 'http' | 'websocket'
}

type UnknownRecord = Record<string, unknown>
type StakeAction = 'bet' | 'roll' | 'next' | 'cashout'
type Bet88Action = 'bet' | 'play'
type CapturedRouletteMessage = EvoMessage | PragmaticPlayMessage

let tennisSyncTimer: number | null = null
let lastTennisSignature = ''
let lastChipSignature = ''
let lastRecentNumbersSignature = ''
let lastLobbyHistoriesSignature = ''

const script = document.createElement('script')
script.src = chrome.runtime.getURL('dist/injected.js')
script.onload = function () {
  script.remove()
}
;(document.head || document.documentElement).appendChild(script)

window.addEventListener('message', async (event: MessageEvent) => {
  if (event.source !== window || event.data?.type !== 'CASINO_RESPONSE') {
    return
  }

  const responseData = event.data.data as InterceptedNetworkPayload
  await processCapturedPayload(responseData)
})

function extractEvoTableState(payload: InterceptedNetworkPayload): string | null {
  const data = payload.data
  if (!isRecord(data) || data.type !== 'roulette.tableState' || !isRecord(data.args)) return null
  const state = data.args.state
  if (typeof state !== 'string') return null
  return state.toUpperCase()
}

function extractLobbyHistories(payload: InterceptedNetworkPayload): LobbyTableHistory[] | null {
  const data = payload.data
  if (!isRecord(data) || data.type !== 'lobby.histories' || !isRecord(data.args)) return null
  const raw = data.args.histories
  if (!isRecord(raw)) return null

  const tables: LobbyTableHistory[] = []

  for (const [tableId, tableData] of Object.entries(raw)) {
    if (!isRecord(tableData)) continue
    const results = tableData.results
    if (!Array.isArray(results)) continue
    const numbers: number[] = []
    // results is { number: string }[][] — outer array of rounds, inner array of items
    for (const group of results) {
      if (!Array.isArray(group)) continue
      for (const item of group) {
        if (isRecord(item) && typeof item.number === 'string') {
          const n = parseInt(item.number, 10)
          if (Number.isInteger(n) && n >= 0 && n <= 36) numbers.push(n)
        }
      }
    }
    if (numbers.length > 0) tables.push({ tableId, numbers: numbers.slice(0, 15) })
  }

  return tables.length > 0 ? tables : null
}

async function processCapturedPayload(responseData: InterceptedNetworkPayload): Promise<void> {
  try {
    const tableState = extractEvoTableState(responseData)
    if (tableState !== null) {
      chrome.storage.local.set({ evolutionTableState: tableState })
      return
    }

    const lobbyHistories = extractLobbyHistories(responseData)
    if (lobbyHistories !== null) {
      await saveLobbyHistories(lobbyHistories, responseData)
      return
    }

    const rouletteResult = parseRouletteResult(responseData)
    if (rouletteResult) {
      await saveRouletteResult(rouletteResult)
      return
    }

    const historyItems = extractBet88HistoryFeed(responseData)
    if (historyItems) {
      const parsed = historyItems
        .map((item) => parseBet88HistoryItem(item, responseData.timestamp ?? Date.now()))
        .filter((item): item is GameResult => item !== null)
      if (parsed.length > 0) {
        await saveGameResults(parsed)
        return
      }
    }

    const result = parseGameResult(responseData)

    if (!result) return

    await saveGameResult(result)
  } catch (error) {
    console.error('[WW] error processing payload:', error)
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSupportedGameKey(value: unknown): value is SupportedGameKey {
  return value === 'keno' || value === 'limbo' || value === 'dice' || value === 'mines'
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return undefined
}

function getStoredPort(value: unknown): number {
  return toNumber(value) ?? 3000
}

function getStakeInputBetAmount(): number | undefined {
  const stakeInput = document.querySelector<HTMLInputElement>('input.svelte-dka04o')
  if (!stakeInput) {
    return undefined
  }

  const rawValue = stakeInput.value.trim()
  if (!rawValue) {
    return undefined
  }

  const normalizedValue = rawValue.replace(/,/g, '')
  const amount = toNumber(normalizedValue)

  return amount !== undefined && amount > 0 ? amount : undefined
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? undefined : timestamp
}

function isStakeBase(value: unknown): value is Stake<unknown> {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.active === 'boolean' &&
    typeof value.currency === 'string' &&
    typeof value.amountMultiplier === 'number' &&
    typeof value.payoutMultiplier === 'number' &&
    typeof value.amount === 'number' &&
    typeof value.payout === 'number' &&
    typeof value.updatedAt === 'string' &&
    isSupportedGameKey(value.game) &&
    isRecord(value.user) &&
    typeof value.user.id === 'string' &&
    typeof value.user.name === 'string' &&
    isRecord(value.state)
  )
}

function isStakeKenoState(value: unknown): value is StakeKeno {
  return (
    isRecord(value) &&
    typeof value.risk === 'string' &&
    isNumberArray(value.drawnNumbers) &&
    isNumberArray(value.selectedNumbers)
  )
}

function isStakeLimboState(value: unknown): value is StakeLimbo {
  return isRecord(value) && typeof value.result === 'number'
}

function isStakeDiceState(value: unknown): value is StakeDice {
  return (
    isRecord(value) &&
    typeof value.result === 'number' &&
    typeof value.target === 'number' &&
    typeof value.condition === 'string'
  )
}

function isStakeMinesRound(value: unknown): value is { field: number; payoutMultiplier: number } {
  return isRecord(value) && typeof value.field === 'number' && typeof value.payoutMultiplier === 'number'
}

function isStakeMinesBetState(value: unknown): value is StakeMinesBet {
  return isRecord(value) && Array.isArray(value.rounds) && typeof value.minesCount === 'number' && value.mines === null
}

function isStakeMinesNextState(value: unknown): value is StakeMinesNext {
  return (
    isRecord(value) &&
    Array.isArray(value.rounds) &&
    value.rounds.every(isStakeMinesRound) &&
    typeof value.minesCount === 'number' &&
    value.mines === null
  )
}

function isStakeMinesCashOutState(value: unknown): value is StakeMinesCashOut {
  return (
    isRecord(value) &&
    Array.isArray(value.rounds) &&
    value.rounds.every(isStakeMinesRound) &&
    typeof value.minesCount === 'number' &&
    isNumberArray(value.mines)
  )
}

function isBet88Base(value: unknown): value is Bet88<unknown> {
  return (
    isRecord(value) &&
    (typeof value.roundId === 'number' || typeof value.roundId === 'string') &&
    (typeof value.win === 'boolean' || typeof value.win === 'number') &&
    (typeof value.active === 'boolean' || typeof value.active === 'number') &&
    (value.multiplier === null || value.multiplier === undefined || typeof value.multiplier === 'number') &&
    (value.winAmount === null ||
      value.winAmount === undefined ||
      typeof value.winAmount === 'string' ||
      typeof value.winAmount === 'number')
  )
}

// ── Bet88 history feed ────────────────────────────────────────────────────────
// bet88.ph game endpoints return a paginated results list rather than a single
// bet response. Shape: { nrOfResults: number, items: Bet88HistoryItem[] }

interface Bet88HistoryItem {
  game: string
  roundId: number | string
  user: string
  currency: string
  dateTime: string
  betAmount: string
  payout: string
  multiplier: number
}

function isBet88HistoryItem(value: unknown): value is Bet88HistoryItem {
  return (
    isRecord(value) &&
    typeof value.game === 'string' &&
    (typeof value.roundId === 'number' || typeof value.roundId === 'string') &&
    typeof value.user === 'string' &&
    typeof value.currency === 'string' &&
    typeof value.dateTime === 'string' &&
    typeof value.betAmount === 'string' &&
    typeof value.payout === 'string' &&
    typeof value.multiplier === 'number'
  )
}

function isBet88HistoryFeed(value: unknown): value is { nrOfResults: number; items: Bet88HistoryItem[] } {
  return (
    isRecord(value) &&
    typeof value.nrOfResults === 'number' &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    isBet88HistoryItem(value.items[0])
  )
}

function mapBet88HistoryGame(name: string): SupportedGameKey | null {
  switch (name.toLowerCase()) {
    case 'keno':
      return 'keno'
    case 'limbo':
      return 'limbo'
    case 'dice':
      return 'dice'
    case 'mines':
      return 'mines'
    default:
      return null
  }
}

function parseBet88HistoryItem(item: Bet88HistoryItem, fallbackTimestamp: number): GameResult | null {
  const game = mapBet88HistoryGame(item.game)
  if (!game) return null

  const amount = toNumber(item.betAmount)
  const payout = toNumber(item.payout)
  const profit = amount !== undefined && payout !== undefined ? payout - amount : undefined
  const result = resolveFinancialOutcome({ amount, payout, profit, fallbackWin: item.multiplier > 0 })
  const timestamp = parseTimestamp(item.dateTime) ?? fallbackTimestamp
  const roundId = typeof item.roundId === 'number' ? item.roundId : Number(item.roundId) || 0

  const syntheticBase = {
    roundId,
    win: result === 'win',
    active: false as const,
    multiplier: item.multiplier,
    winAmount: item.payout,
    profit: String(profit ?? 0),
    playerId: 0
  }

  const baseResult = {
    timestamp,
    result,
    provider: 'bet88' as const,
    game,
    amount,
    payout,
    profit,
    currency: item.currency,
    roundId,
    active: false,
    multiplier: item.multiplier,
    userName: item.user,
    url: window.location.href
  }

  switch (game) {
    case 'limbo':
      return {
        ...baseResult,
        action: 'bet',
        providerData: {
          provider: 'bet88',
          game: 'limbo',
          action: 'bet',
          response: { ...syntheticBase, custom: { multiplier: item.multiplier, winningChance: 0 } }
        }
      }

    case 'keno':
      return {
        ...baseResult,
        action: 'bet',
        providerData: {
          provider: 'bet88',
          game: 'keno',
          action: 'bet',
          response: { ...syntheticBase, custom: { drawNumbers: [], numberOfMatches: 0 } }
        }
      }

    case 'dice':
      return {
        ...baseResult,
        action: 'bet',
        providerData: {
          provider: 'bet88',
          game: 'dice',
          action: 'bet',
          response: { ...syntheticBase, custom: { result: '0', winningChance: '0' } }
        }
      }

    case 'mines':
      return {
        ...baseResult,
        action: 'play',
        providerData: {
          provider: 'bet88',
          game: 'mines',
          action: 'play',
          response: { ...syntheticBase, custom: { selected: [], mines: [], mineCount: 0 } }
        }
      }
  }
}

function extractBet88HistoryFeed(payload: InterceptedNetworkPayload): Bet88HistoryItem[] | null {
  const candidates = [payload.data, isRecord(payload.data) ? payload.data.data : undefined]
  for (const candidate of candidates) {
    if (isBet88HistoryFeed(candidate)) {
      return candidate.items
    }
  }
  return null
}

function isRouletteResultEntry(value: unknown): value is { number: string } {
  return isRecord(value) && typeof value.number === 'string'
}

function isEvoMessage(value: unknown): value is EvoMessage {
  return (
    isRecord(value) &&
    value.type === 'roulette.winSpots' &&
    typeof value.id === 'string' &&
    isRecord(value.args) &&
    typeof value.args.gameId === 'string' &&
    typeof value.args.code === 'string' &&
    typeof value.args.description === 'string' &&
    isRecord(value.args.winSpots) &&
    typeof value.args.timestamp === 'string' &&
    Array.isArray(value.args.result) &&
    value.args.result.every(isRouletteResultEntry) &&
    typeof value.time === 'number'
  )
}

function isPragmaticPlayMessage(value: unknown): value is PragmaticPlayMessage {
  return (
    isRecord(value) &&
    isRecord(value.gameresult) &&
    typeof value.gameresult.score === 'string' &&
    typeof value.gameresult.pre === 'string' &&
    typeof value.gameresult.megaWin === 'string' &&
    typeof value.gameresult.color === 'string' &&
    typeof value.gameresult.luckyWin === 'string' &&
    typeof value.gameresult.id === 'string' &&
    typeof value.gameresult.time === 'string' &&
    typeof value.gameresult.seq === 'number' &&
    typeof value.gameresult.value === 'string'
  )
}

function getNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) {
    return undefined
  }

  const numbers = value
    .map((entry) => toNumber(entry))
    .filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry))

  return numbers.length === value.length ? numbers : undefined
}

function normalizeBet88KenoCustom(value: unknown): Bet88Keno | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    drawNumbers: getNumberArray(value.drawNumbers) ?? [],
    numberOfMatches: toNumber(value.numberOfMatches) ?? 0
  }
}

function normalizeBet88LimboCustom(value: unknown, fallbackMultiplier?: number): Bet88Limbo | null {
  const multiplier = isRecord(value) ? (toNumber(value.multiplier) ?? fallbackMultiplier) : fallbackMultiplier
  if (multiplier === undefined) {
    return null
  }
  return {
    multiplier,
    winningChance: isRecord(value) ? (toNumber(value.winningChance) ?? 0) : 0
  }
}

function normalizeBet88DiceCustom(value: unknown): Bet88Dice | null {
  if (!isRecord(value)) {
    return null
  }

  const result = value.result
  const winningChance = value.winningChance

  return {
    result: result === undefined || result === null ? '0' : String(result),
    winningChance: winningChance === undefined || winningChance === null ? '0' : String(winningChance)
  }
}

function normalizeBet88MinesCustom(value: unknown): Bet88Mines | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    selected: getNumberArray(value.selected) ?? [],
    mines: getNumberArray(value.mines) ?? [],
    mineCount: toNumber(value.mineCount) ?? 0
  }
}

function inferBet88Game(custom: unknown): SupportedGameKey | null {
  if (normalizeBet88KenoCustom(custom)) {
    return 'keno'
  }

  if (normalizeBet88LimboCustom(custom)) {
    return 'limbo'
  }

  if (normalizeBet88DiceCustom(custom)) {
    return 'dice'
  }

  if (normalizeBet88MinesCustom(custom)) {
    return 'mines'
  }

  return null
}

function findMatchingRecord<T>(value: unknown, matcher: (candidate: unknown) => candidate is T, depth = 0): T | null {
  if (matcher(value)) {
    return value
  }

  if (depth >= 4 || value == null) {
    return null
  }

  if (Array.isArray(value)) {
    for (const nestedValue of value) {
      const match = findMatchingRecord(nestedValue, matcher, depth + 1)
      if (match) {
        return match
      }
    }

    return null
  }

  if (!isRecord(value)) {
    return null
  }

  for (const nestedValue of Object.values(value)) {
    const match = findMatchingRecord(nestedValue, matcher, depth + 1)
    if (match) {
      return match
    }
  }

  return null
}

function extractStakePayload(payload: InterceptedNetworkPayload): Stake<unknown> | null {
  const candidates = [payload.data, payload.requestBody]

  for (const candidate of candidates) {
    const match = findMatchingRecord(candidate, isStakeBase)
    if (match) {
      return match
    }
  }

  return null
}

function extractBet88Payload(payload: InterceptedNetworkPayload): Bet88<unknown> | null {
  const candidates = [payload.data, isRecord(payload.data) ? payload.data.data : undefined]

  for (const candidate of candidates) {
    const match = findMatchingRecord(candidate, isBet88Base)
    if (match) {
      return match
    }
  }

  return null
}

function extractRoulettePayload(payload: InterceptedNetworkPayload): CapturedRouletteMessage | null {
  const candidates = [payload.data]

  for (const candidate of candidates) {
    const match = findMatchingRecord(candidate, (entry): entry is CapturedRouletteMessage => {
      return isEvoMessage(entry) || isPragmaticPlayMessage(entry)
    })
    if (match) {
      return match
    }
  }

  return null
}

function detectStakeRoute(url: string, providerData: Stake<unknown>): { game: SupportedGameKey; action: StakeAction } {
  const match = url.toLowerCase().match(/\/casino\/(keno|limbo|dice|mines)\/(bet|roll|next|cashout)\b/)
  if (match && isSupportedGameKey(match[1])) {
    return {
      game: match[1],
      action: match[2] as StakeAction
    }
  }

  if (providerData.game === 'dice') {
    return { game: 'dice', action: 'roll' }
  }

  if (providerData.game === 'mines') {
    if (isStakeMinesCashOutState(providerData.state)) {
      return { game: 'mines', action: 'cashout' }
    }

    if (isStakeMinesNextState(providerData.state)) {
      return { game: 'mines', action: 'next' }
    }
  }

  return {
    game: providerData.game,
    action: 'bet'
  }
}

function resolveStakePayout(game: SupportedGameKey, amount: number, payout: number, payoutMultiplier: number): number {
  if (game === 'keno' && amount > 0 && payoutMultiplier > 0) {
    return amount * payoutMultiplier
  }

  return payout
}

function detectBet88Route(
  url: string,
  providerData: Bet88<unknown>
): { game: SupportedGameKey; action: Bet88Action } | null {
  const match = url.toLowerCase().match(/\/game\/(keno|limbo|dice|mines)\/(bet|play)\b/)
  if (match && isSupportedGameKey(match[1])) {
    return {
      game: match[1],
      action: match[2] as Bet88Action
    }
  }

  const inferredGame = inferBet88Game(providerData.custom)
  if (!inferredGame) {
    return null
  }

  return {
    game: inferredGame,
    action: inferredGame === 'mines' ? 'play' : 'bet'
  }
}

function parseStakeResult(payload: InterceptedNetworkPayload): GameResult | null {
  const providerData = extractStakePayload(payload)
  if (!providerData) return null

  const route = detectStakeRoute(payload.url, providerData)

  // Mines rounds are multi-step; skip interim active states.
  // Instant games (limbo, dice, keno) settle on the first response even when
  // active=true, so we let them through — the dedup logic in saveGameResult
  // will keep the settled version if a second inactive response arrives.
  if (providerData.active && route.game === 'mines') return null

  const payout = resolveStakePayout(route.game, providerData.amount, providerData.payout, providerData.payoutMultiplier)
  const profit = payout - providerData.amount
  const result = resolveFinancialOutcome({
    amount: providerData.amount,
    payout,
    profit,
    fallbackWin: providerData.payoutMultiplier > 0
  })
  const baseResult = {
    id: providerData.id,
    timestamp: parseTimestamp(providerData.updatedAt) ?? payload.timestamp ?? Date.now(),
    updatedAt: providerData.updatedAt,
    result,
    provider: 'stake' as const,
    game: route.game,
    amount: providerData.amount,
    payout,
    profit,
    currency: providerData.currency,
    active: providerData.active,
    roundId: providerData.id,
    multiplier: providerData.payoutMultiplier,
    payoutMultiplier: providerData.payoutMultiplier,
    userName: providerData.user.name,
    url: window.location.href
  }

  switch (route.game) {
    case 'keno':
      if (route.action !== 'bet' || !isStakeKenoState(providerData.state)) {
        return null
      }

      return {
        ...baseResult,
        action: 'bet',
        providerData: {
          provider: 'stake',
          game: 'keno',
          action: 'bet',
          response: {
            ...providerData,
            state: {
              ...providerData.state,
              selectedNumbers: providerData.state.selectedNumbers,
              drawnNumbers: providerData.state.drawnNumbers
            }
          }
        }
      }

    case 'limbo':
      if (route.action !== 'bet' || !isStakeLimboState(providerData.state)) {
        return null
      }

      return {
        ...baseResult,
        action: 'bet',
        providerData: {
          provider: 'stake',
          game: 'limbo',
          action: 'bet',
          response: {
            ...providerData,
            state: providerData.state
          }
        }
      }

    case 'dice':
      if (route.action !== 'roll' || !isStakeDiceState(providerData.state)) {
        return null
      }

      return {
        ...baseResult,
        action: 'roll',
        providerData: {
          provider: 'stake',
          game: 'dice',
          action: 'roll',
          response: {
            ...providerData,
            state: providerData.state
          }
        }
      }

    case 'mines':
      if (route.action === 'cashout' && isStakeMinesCashOutState(providerData.state)) {
        return {
          ...baseResult,
          action: 'cashout',
          providerData: {
            provider: 'stake',
            game: 'mines',
            action: 'cashout',
            response: {
              ...providerData,
              state: providerData.state
            }
          }
        }
      }

      return null
  }
}

function parseBet88Result(payload: InterceptedNetworkPayload): GameResult | null {
  const providerData = extractBet88Payload(payload)
  if (!providerData) return null

  const route = detectBet88Route(payload.url, providerData)
  if (!route) {
    return null
  }

  const requestBody = isRecord(payload.requestBody) ? payload.requestBody : null
  const payout = toNumber(providerData.winAmount)
  const amount = toNumber(requestBody?.amount)
  const profit = payout !== undefined && amount !== undefined ? payout - amount : toNumber(providerData.profit)
  const win = typeof providerData.win === 'boolean' ? providerData.win : providerData.win !== 0
  const result = resolveFinancialOutcome({
    amount,
    payout,
    profit,
    fallbackWin: win
  })

  const baseResult = {
    timestamp: payload.timestamp ?? Date.now(),
    result,
    provider: 'bet88' as const,
    game: route.game,
    action: route.action,
    amount,
    payout,
    profit,
    currency: typeof requestBody?.currency === 'string' ? requestBody.currency : undefined,
    auto: typeof requestBody?.auto === 'boolean' ? requestBody.auto : undefined,
    roundId: providerData.roundId,
    active: providerData.active,
    multiplier: providerData.multiplier,
    winAmount: providerData.winAmount,
    playerId: providerData.playerId,
    url: window.location.href
  }

  switch (route.game) {
    case 'keno':
      const kenoCustom = normalizeBet88KenoCustom(providerData.custom)
      if (!kenoCustom) {
        return null
      }

      return {
        ...baseResult,
        providerData: {
          provider: 'bet88',
          game: 'keno',
          action: 'bet',
          response: {
            ...providerData,
            custom: kenoCustom
          }
        }
      }

    case 'limbo':
      const limboCustom = normalizeBet88LimboCustom(providerData.custom, providerData.multiplier)
      if (!limboCustom) {
        return null
      }

      return {
        ...baseResult,
        providerData: {
          provider: 'bet88',
          game: 'limbo',
          action: 'bet',
          response: {
            ...providerData,
            custom: limboCustom
          }
        }
      }

    case 'dice':
      const diceCustom = normalizeBet88DiceCustom(providerData.custom)
      if (!diceCustom) {
        return null
      }

      return {
        ...baseResult,
        providerData: {
          provider: 'bet88',
          game: 'dice',
          action: 'bet',
          response: {
            ...providerData,
            custom: diceCustom
          }
        }
      }

    case 'mines':
      const minesCustom = normalizeBet88MinesCustom(providerData.custom)
      if (route.action !== 'play' || !minesCustom) {
        return null
      }

      return {
        ...baseResult,
        providerData: {
          provider: 'bet88',
          game: 'mines',
          action: 'play',
          response: {
            ...providerData,
            custom: minesCustom
          }
        }
      }
  }
}

function parseBooleanFlag(value: string): boolean {
  return value.trim().toLowerCase() === 'true'
}

function parseClockTimestamp(value: string, referenceTimestamp: number): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
  if (!match) {
    return null
  }

  const [, hoursText, minutesText, secondsText] = match
  const date = new Date(referenceTimestamp)
  date.setHours(Number(hoursText), Number(minutesText), Number(secondsText), 0)

  const forwardDiff = date.getTime() - referenceTimestamp
  if (forwardDiff > 12 * 60 * 60 * 1000) {
    date.setDate(date.getDate() - 1)
  } else if (forwardDiff < -12 * 60 * 60 * 1000) {
    date.setDate(date.getDate() + 1)
  }

  return date.getTime()
}

function parseRouletteWinningNumber(providerData: CapturedRouletteMessage): number | null {
  const winningNumber = isEvoMessage(providerData)
    ? toNumber(providerData.args.result[0]?.number ?? providerData.args.code)
    : toNumber(providerData.gameresult.score)

  if (winningNumber === undefined || !Number.isInteger(winningNumber) || winningNumber < 0 || winningNumber > 36) {
    return null
  }

  return winningNumber
}

function parseRouletteResult(payload: InterceptedNetworkPayload): RouletteSpinResult | null {
  const providerData = extractRoulettePayload(payload)
  if (!providerData) {
    return null
  }

  if (isPragmaticPlayMessage(providerData) && parseBooleanFlag(providerData.gameresult.pre)) {
    return null
  }

  const winningNumber = parseRouletteWinningNumber(providerData)
  if (winningNumber === null) {
    return null
  }

  if (isPragmaticPlayMessage(providerData)) {
    const referenceTimestamp = payload.timestamp ?? Date.now()
    const timestamp = parseClockTimestamp(providerData.gameresult.time, referenceTimestamp) ?? referenceTimestamp

    return {
      id: providerData.gameresult.id,
      provider: 'bet88',
      source: 'pragmatic-play',
      game: 'roulette',
      eventType: 'gameresult',
      score: providerData.gameresult.score,
      color: providerData.gameresult.color,
      sequence: providerData.gameresult.seq,
      rawValue: providerData.gameresult.value,
      isPreResult: parseBooleanFlag(providerData.gameresult.pre),
      isMegaWin: parseBooleanFlag(providerData.gameresult.megaWin),
      isLuckyWin: parseBooleanFlag(providerData.gameresult.luckyWin),
      description:
        providerData.gameresult.value.trim() || `${providerData.gameresult.score} ${providerData.gameresult.color}`,
      winningNumber,
      timestamp,
      updatedAt: new Date(timestamp).toISOString(),
      url: window.location.href
    }
  }

  const resultNumbers = providerData.args.result
    .map((entry) => toNumber(entry.number))
    .filter((entry): entry is number => entry !== undefined && Number.isInteger(entry) && entry >= 0 && entry <= 36)

  // Read the table display name from the Evolution UI if available.
  const tableName = deepQuery(document, '[data-role="table-name"]')?.textContent?.trim() || undefined

  return {
    id: providerData.id,
    provider: 'stake',
    source: 'evolution',
    game: 'roulette',
    eventType: 'winSpots',
    gameId: providerData.args.gameId,
    code: providerData.args.code,
    description: providerData.args.description,
    winSpots: providerData.args.winSpots,
    resultNumbers,
    winningNumber,
    tableName,
    timestamp: parseTimestamp(providerData.args.timestamp) ?? providerData.time ?? payload.timestamp ?? Date.now(),
    updatedAt: providerData.args.timestamp,
    url: window.location.href
  }
}

function parseGameResult(payload: InterceptedNetworkPayload): GameResult | null {
  const pageSite = getSupportedSite(window.location.href)?.key

  if (pageSite === 'stake') {
    return parseStakeResult(payload) ?? parseBet88Result(payload)
  }

  if (pageSite === 'bet88') {
    return parseBet88Result(payload) ?? parseStakeResult(payload)
  }

  return parseBet88Result(payload) ?? parseStakeResult(payload)
}

async function getDevServerPort(): Promise<number> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['devServerPort'], (data) => {
      resolve(getStoredPort(data.devServerPort))
    })
  })
}

async function sendToDevServer(result: GameResult, port: number): Promise<void> {
  try {
    const response = await fetch(`http://localhost:${port}/api/results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(result)
    })

    if (!response.ok) {
      console.warn(`Dev server responded with status ${response.status}`)
    }
  } catch (error) {
    console.debug('Dev server not available:', error)
  }
}

function findExistingResultIndex(results: GameResult[], candidate: GameResult): number {
  return results.findIndex((entry) => {
    if (
      candidate.id &&
      entry.id &&
      candidate.provider === entry.provider &&
      candidate.game === entry.game &&
      candidate.action === entry.action
    ) {
      return entry.id === candidate.id
    }

    if (
      candidate.roundId !== undefined &&
      entry.roundId !== undefined &&
      candidate.provider === entry.provider &&
      candidate.game === entry.game &&
      candidate.action === entry.action
    ) {
      return entry.roundId === candidate.roundId
    }

    return false
  })
}

function findExistingRouletteResultIndex(results: RouletteSpinResult[], candidate: RouletteSpinResult): number {
  return results.findIndex(
    (entry) => entry.id === candidate.id && entry.provider === candidate.provider && entry.source === candidate.source
  )
}

async function saveLobbyHistories(
  lobbyHistories: LobbyTableHistory[],
  responseData: InterceptedNetworkPayload
): Promise<void> {
  const capture: RouletteLobbyHistoriesCapture = {
    histories: lobbyHistories.map(({ tableId, numbers }) => ({
      tableId,
      numbers: [...numbers]
    })),
    pageUrl: window.location.href,
    captureUrl: responseData.url,
    timestamp: responseData.timestamp ?? Date.now()
  }

  const nextSignature = JSON.stringify(capture.histories)
  if (nextSignature === lastLobbyHistoriesSignature) {
    return
  }

  lastLobbyHistoriesSignature = nextSignature

  return new Promise((resolve) => {
    chrome.storage.local.set(
      { evolutionLobbyHistories: capture.histories, evolutionLobbyHistoriesCapture: capture },
      () => {
        resolve()
      }
    )
  })
}

async function saveGameResults(candidates: GameResult[]): Promise<void> {
  if (candidates.length === 0) return
  return new Promise((resolve) => {
    chrome.storage.local.get(['casinoResults', 'virtualBankroll'], (data) => {
      const virtualBankroll = normalizeVirtualBankroll(data.virtualBankroll)
      const stored = normalizeStoredData(data.casinoResults, virtualBankroll)
      let results = [...stored.results]

      for (const candidate of candidates) {
        const nextResult = applyPaperBankrollToRound({
          ...candidate,
          paperBankrollEnabled:
            virtualBankroll.enabled === true &&
            virtualBankroll.trackingStartedAt !== null &&
            candidate.timestamp >= virtualBankroll.trackingStartedAt,
          paperBetAmount: virtualBankroll.enabled === true ? virtualBankroll.baseBetAmount : undefined
        })

        const existingIndex = findExistingResultIndex(results, nextResult)
        if (existingIndex >= 0) {
          const existing = results[existingIndex]
          if (existing.active === false && nextResult.active === true) continue
          results[existingIndex] = nextResult
        } else {
          results.push(nextResult)
        }
      }

      if (results.length > 1000) {
        results = results.slice(-1000)
      }

      chrome.storage.local.set({ casinoResults: summarizeResults(results) }, () => {
        resolve()
      })
    })
  })
}

async function saveGameResult(result: GameResult): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['casinoResults', 'virtualBankroll'], async (data) => {
      const virtualBankroll = normalizeVirtualBankroll(data.virtualBankroll)
      const stored = normalizeStoredData(data.casinoResults, virtualBankroll)
      const stakeInputBetAmount = result.provider === 'stake' ? getStakeInputBetAmount() : undefined
      const effectivePaperBetAmount =
        virtualBankroll.enabled === true ? (stakeInputBetAmount ?? virtualBankroll.baseBetAmount) : undefined
      const nextResult = applyPaperBankrollToRound({
        ...result,
        paperBankrollEnabled:
          virtualBankroll.enabled === true &&
          virtualBankroll.trackingStartedAt !== null &&
          result.timestamp >= virtualBankroll.trackingStartedAt,
        paperBetAmount: effectivePaperBetAmount
      })
      let results = [...stored.results]

      const existingResultIndex = findExistingResultIndex(results, nextResult)
      if (existingResultIndex >= 0) {
        const existingResult = results[existingResultIndex]

        // Keep the settled round when duplicate events arrive for the same
        // provider/game/action/round. This avoids active interim responses
        // overwriting the final outcome.
        if (existingResult.active === false && nextResult.active === true) {
          resolve()
          return
        }

        results[existingResultIndex] = nextResult
      } else {
        results.push(nextResult)
      }

      if (results.length > 1000) {
        results = results.slice(-1000)
      }

      const nextStored = summarizeResults(results)

      chrome.storage.local.set({ casinoResults: nextStored }, async () => {
        const port = await getDevServerPort()
        await sendToDevServer(nextResult, port)
        resolve()
      })
    })
  })
}

async function saveRouletteResult(result: RouletteSpinResult): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['rouletteResults'], (data) => {
      const stored = normalizeRouletteStoredData(data.rouletteResults)
      let results = [...stored.results]
      const existingResultIndex = findExistingRouletteResultIndex(results, result)

      if (existingResultIndex >= 0) {
        results[existingResultIndex] = result
      } else {
        results.push(result)
      }

      if (results.length > 1000) {
        results = results.slice(-1000)
      }

      chrome.storage.local.set({ rouletteResults: summarizeRouletteResults(results) }, () => {
        resolve()
      })
    })
  })
}

function saveTennisEvents(events: TennisEvent[]): void {
  const nextSignature = JSON.stringify(
    events.map((event) => ({
      id: event.id,
      provider: event.provider,
      href: event.href,
      statusLabel: event.statusLabel,
      tour: event.tour,
      tournament: event.tournament,
      players: event.players,
      markets: event.markets
    }))
  )

  if (nextSignature === lastTennisSignature) {
    return
  }

  lastTennisSignature = nextSignature
  chrome.storage.local.set({ tennisResults: summarizeTennisEvents(events) })
}

function getTennisCapturePageUrl(): string {
  const currentUrl = window.location.href

  if (currentUrl && !currentUrl.startsWith('about:blank') && !currentUrl.startsWith('blob:')) {
    return currentUrl
  }

  if (document.referrer) {
    return document.referrer
  }

  return currentUrl
}

function getTennisCaptureSite(): 'stake' | 'bet88' | null {
  const site = getSupportedSite(getTennisCapturePageUrl())?.key
  if (site === 'stake' || site === 'bet88') {
    return site
  }

  return null
}

function isTennisCaptureContext(): boolean {
  const site = getTennisCaptureSite()
  return site === 'stake'
}

function syncTennisBoardSnapshot(): void {
  if (!isTennisCaptureContext() || !hasTennisSurface(document)) {
    return
  }

  const pageUrl = getTennisCapturePageUrl()
  const site = getTennisCaptureSite()
  if (site !== 'stake') {
    return
  }

  const events = extractTennisEvents(document, pageUrl, site)

  if (events.length === 0) {
    return
  }

  saveTennisEvents(events)
}

function scheduleTennisBoardSync(): void {
  if (tennisSyncTimer !== null) {
    window.clearTimeout(tennisSyncTimer)
  }

  tennisSyncTimer = window.setTimeout(() => {
    tennisSyncTimer = null
    syncTennisBoardSnapshot()
  }, 220)
}

function initTennisCapture(): void {
  if (!isTennisCaptureContext()) {
    return
  }

  const root = document.documentElement
  if (!root) {
    window.addEventListener('DOMContentLoaded', initTennisCapture, { once: true })
    return
  }

  const observer = new MutationObserver(() => {
    scheduleTennisBoardSync()
  })

  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true
  })

  window.addEventListener('load', scheduleTennisBoardSync, { once: true })
  window.addEventListener('popstate', scheduleTennisBoardSync)
  window.addEventListener('hashchange', scheduleTennisBoardSync)

  scheduleTennisBoardSync()
}

initTennisCapture()

// Evolution board element locator — finds selector in any frame, reports coords
// in the TOP-LEVEL viewport so background can dispatch a trusted CDP click there.
// This works across OOPIFs (cross-origin iframes) by walking the frame chain via
// postMessage, adding each iframe's offset as we go up.

function deepQuery(root: ParentNode, selector: string): HTMLElement | null {
  const found = root.querySelector<HTMLElement>(selector)
  if (found) return found
  const hosts = root.querySelectorAll('*')
  for (const host of hosts) {
    if (host.shadowRoot) {
      const inner = deepQuery(host.shadowRoot, selector)
      if (inner) return inner
    }
  }
  return null
}

// We intentionally skip a full visibility check here. SVG bet-spot <rect> and
// chip elements can have temporarily zero paint dimensions during Evolution's
// placement animations, which would cause valid elements to be dropped. As long
// as deepQuery can find the node, getBoundingClientRect will give us the correct
// viewport-relative centre we need for the CDP input dispatch.
function elementCenter(el: HTMLElement): { x: number; y: number } | null {
  const rect = el.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }
  // Fallback: walk up the DOM to find the nearest ancestor with a real rect.
  let parent = el.parentElement
  while (parent) {
    const pr = parent.getBoundingClientRect()
    if (pr.width > 0 && pr.height > 0) {
      return { x: pr.left + pr.width / 2, y: pr.top + pr.height / 2 }
    }
    parent = parent.parentElement
  }
  return null
}

function reportCoordsToBackground(requestId: string, x: number, y: number, selector: string): void {
  // chrome.runtime.id is undefined when the extension context has been invalidated
  // (e.g. after an extension reload without a page refresh).  Attempting to call
  // sendMessage in that state throws "Extension context invalidated" and the
  // background never receives coords, so all trusted clicks time out.
  if (!chrome.runtime?.id) {
    console.warn('[watchful-wind] Extension context invalidated — reload the page to restore click automation.')
    return
  }
  try {
    chrome.runtime.sendMessage({
      type: 'EVO_COORDS_FOUND',
      requestId,
      selector,
      x,
      y,
      frame: window.location.href
    })
  } catch (error) {
    console.warn('[watchful-wind] Failed to report coords:', error)
  }
}

function sendCoordsUp(requestId: string, x: number, y: number, selector: string): void {
  if (window.top === window || !window.parent) {
    reportCoordsToBackground(requestId, x, y, selector)
    return
  }
  window.parent.postMessage({ type: 'EVO_TRANSLATE_COORDS', requestId, selector, local: { x, y } }, '*')
}

function findIframeForSource(source: MessageEventSource | null): HTMLIFrameElement | null {
  if (!source) return null
  const iframes = document.querySelectorAll('iframe')
  for (const iframe of iframes) {
    if (iframe.contentWindow === source) return iframe
  }
  return null
}

// Translate child-frame coords into this frame's viewport, then continue up.
window.addEventListener('message', (event) => {
  const data = event.data
  if (!data || typeof data !== 'object') return
  if (data.type !== 'EVO_TRANSLATE_COORDS') return

  const { requestId, selector, local } = data as {
    requestId: string
    selector: string
    local: { x: number; y: number }
  }

  const iframe = findIframeForSource(event.source)
  if (!iframe) {
    // Can't locate the iframe child — drop. Background will time out.
    return
  }

  const iframeRect = iframe.getBoundingClientRect()
  // Account for iframe borders: getBoundingClientRect includes the border box,
  // but the child's viewport starts at the content box. For most iframes borders
  // are 0, so this is usually a no-op. If needed we could read computed styles.
  const x = iframeRect.left + local.x
  const y = iframeRect.top + local.y

  sendCoordsUp(requestId, x, y, selector)
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EVO_FIND_AND_REPORT') {
    const { selector, requestId } = message as { selector: string; requestId: string }
    try {
      const el = deepQuery(document, selector)
      if (!el) {
        sendResponse({ found: false })
        return false
      }

      const center = elementCenter(el)
      if (!center) {
        sendResponse({ found: false, reason: 'no-rect' })
        return false
      }

      const { x, y } = center
      sendCoordsUp(requestId, x, y, selector)
      sendResponse({ found: true, frame: window.location.href })
    } catch (error) {
      sendResponse({ found: false, error: String(error) })
    }
    return false
  }

  if (message.type === 'EVO_GET_SELECTED_CHIP') {
    // Try common DOM patterns that Evolution (and similar platforms) use to mark
    // the currently active chip. Returns the first match's data-value as a number,
    // or null if none of the selectors produce a result in this frame.
    const ACTIVE_CHIP_SELECTORS = [
      '[data-role="chip"][aria-checked="true"]',
      '[data-role="chip"][aria-pressed="true"]',
      '[data-role="chip"][aria-selected="true"]',
      '[data-role="chip"][data-active="true"]',
      '[data-role="chip"][data-selected="true"]',
      '[data-role="chip"][data-current="true"]'
    ]
    let value: number | null = null
    for (const sel of ACTIVE_CHIP_SELECTORS) {
      const el = deepQuery(document, sel)
      if (el) {
        const raw = el.getAttribute('data-value')
        const parsed = raw ? Number(raw) : NaN
        if (Number.isFinite(parsed) && parsed > 0) {
          value = parsed
          break
        }
      }
    }
    sendResponse({ value })
    return false
  }

  if (message.type === 'PLACE_BET88_BET') {
    const requestId = `bet88-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const onResult = (event: MessageEvent) => {
      if (event.source !== window) return
      if (event.data?.type !== 'BET88_CLICK_RESULT' || event.data?.requestId !== requestId) return
      window.removeEventListener('message', onResult)
      sendResponse({ ok: event.data.ok, error: event.data.error })
    }
    window.addEventListener('message', onResult)
    setTimeout(() => {
      window.removeEventListener('message', onResult)
      sendResponse({ ok: false, error: 'timeout' })
    }, 3000)
    window.postMessage({ type: 'BET88_CLICK', requestId }, '*')
    return true
  }
})

// Evolution chip denomination scraping

// Betting-window detection — Evolution disables the chip stack wrapper
// (pointer-events: none + reduced opacity) during "no more bets" phase.

let lastBettingOpen: boolean | null = null

function scrapeBettingOpen(): boolean {
  // Primary: check chip stack wrapper pointer-events
  const wrapper = deepQuery(document, '[data-role="expanded-chip-stack-wrapper"]')
  if (!wrapper) return false
  const wStyle = window.getComputedStyle(wrapper)
  if (wStyle.pointerEvents === 'none') return false
  if (parseFloat(wStyle.opacity) < 0.5) return false

  // Secondary: confirm at least one chip exists and isn't individually disabled
  const chip = deepQuery(document, '[data-role="chip"]')
  if (!chip) return false
  const cStyle = window.getComputedStyle(chip)
  if (cStyle.pointerEvents === 'none') return false

  return true
}

function syncBettingOpen(): void {
  const open = scrapeBettingOpen()
  if (open === lastBettingOpen) return
  lastBettingOpen = open
  chrome.storage.local.set({ evolutionBettingOpen: open })
}

// Rebet button visibility tracking

let lastRebetVisible: boolean | null = null

function scrapeRebetVisible(): boolean {
  const btn = deepQuery(document, '[data-role="rebet-button"]')
  if (!btn) return false
  const style = window.getComputedStyle(btn)
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
}

function syncRebetVisible(): void {
  const visible = scrapeRebetVisible()
  if (visible === lastRebetVisible) return
  lastRebetVisible = visible
  chrome.storage.local.set({ evolutionRebetVisible: visible })
}

function scrapeEvolutionChipValues(): number[] {
  const chipElements = document.querySelectorAll<HTMLElement>('div[data-role="chip"][data-value]')
  const values: number[] = []

  for (const el of chipElements) {
    const raw = el.getAttribute('data-value')
    if (raw) {
      const parsed = Number(raw)
      if (Number.isFinite(parsed) && parsed > 0) {
        values.push(parsed)
      }
    }
  }

  return values
}

function deepQueryAll(root: ParentNode, selector: string): HTMLElement[] {
  const matches = Array.from(root.querySelectorAll<HTMLElement>(selector))
  const hosts = root.querySelectorAll('*')

  for (const host of hosts) {
    if (host.shadowRoot) {
      matches.push(...deepQueryAll(host.shadowRoot, selector))
    }
  }

  return matches
}

function extractRouletteNumbersFromText(text: string): number[] {
  const values: number[] = []
  const matches = text.match(/\b\d{1,2}\b/g)

  if (!matches) {
    return values
  }

  for (const raw of matches) {
    const parsed = Number(raw)
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 36) {
      values.push(parsed)
    }
  }

  return values
}

function syncEvolutionChips(): void {
  const values = scrapeEvolutionChipValues()
  if (values.length === 0) {
    return
  }

  const signature = values.join(',')
  if (signature === lastChipSignature) {
    return
  }

  lastChipSignature = signature
  console.log('[watchful-wind] chips detected:', values, 'in frame:', window.location.href)
  chrome.storage.local.set({ evolutionChips: values })
}

function scrapeRecentNumbers(): { recent: number[]; history: number[] } {
  const drawer = deepQuery(document, '[data-role="statistic-drawer"]')
  const scope: ParentNode = drawer ?? document
  const statisticsContainers = deepQueryAll(scope, '[data-role="statistics"]')
  const recentNumberContainers = deepQueryAll(scope, '[data-role="recent-number"], [data-role^="recent-number-"]')
  const recent: number[] = []
  const historyNumbers: number[] = []

  for (const container of statisticsContainers) {
    const raw = container.textContent?.trim()
    if (!raw) continue

    historyNumbers.push(...extractRouletteNumbersFromText(raw))
  }

  for (const container of recentNumberContainers.slice(0, 12)) {
    const raw = container.textContent?.trim()
    if (!raw) continue

    const [value] = extractRouletteNumbersFromText(raw)
    if (typeof value === 'number') {
      recent.push(value)
    }
  }

  return {
    recent: recent,
    history: historyNumbers.slice(0, 500)
  }
}

function syncRecentNumbers(): void {
  const { recent, history } = scrapeRecentNumbers()
  const signature = `${recent.join(',')}::${history.join(',')}`
  if (signature === lastRecentNumbersSignature) return
  lastRecentNumbersSignature = signature
  chrome.storage.local.set({
    evolutionRecentNumbers: recent,
    evolutionRecentHistory: history
  })
}

function initEvolutionChipCapture(): void {
  const root = document.documentElement
  if (!root) {
    window.addEventListener('DOMContentLoaded', initEvolutionChipCapture, { once: true })
    return
  }

  const observer = new MutationObserver(() => {
    syncEvolutionChips()
    syncRebetVisible()
    syncBettingOpen()
    syncRecentNumbers()
  })

  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class', 'disabled', 'hidden']
  })

  window.addEventListener(
    'load',
    () => {
      syncEvolutionChips()
      syncRebetVisible()
      syncBettingOpen()
      syncRecentNumbers()
    },
    { once: true }
  )
  syncEvolutionChips()
  syncRebetVisible()
  syncBettingOpen()
  syncRecentNumbers()
}

initEvolutionChipCapture()
