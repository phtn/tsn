import {
  normalizeRelayEndpointConfig,
  postJsonToEndpoint,
  resolveRelayEndpointUrl,
  type RelayEndpointConfig
} from '@/src/lib/relayEndpoints'
import type { KimAlgoBetPlan, KimAlgoStep, KimQuadrantId, KimSpreadSelectionMode } from '@/src/lib/roulette'
import type { TableState } from '@/src/types/roulette'

type RouletteBetStatus = 'missed' | 'ok' | 'placing' | 'idle'

export type RouletteResultEndpointConfig = RelayEndpointConfig

export interface RouletteBetSlotPayload {
  number: number
  bet: number
  placements: number
  unitStake: number
  isZeroHedge: boolean
  isQuadrantSlot: boolean
}

export interface RouletteSpinResultPayload {
  type: 'roulette.spinResult'
  schemaVersion: 1
  phase: 'tracking' | 'waiting_for_signal'
  emittedAt: string
  controls: {
    winVerb: string
    lastWinProfit: number | null
    signalFound: boolean
    isTracking: boolean
    auto: boolean
    scatter: boolean
    allowOverlaps: boolean
    spreadSelectionMode: KimSpreadSelectionMode
    loaded: boolean
    betStatus: RouletteBetStatus
  }
  virtualBoard: {
    startingQuadrant: KimQuadrantId
    baseUnit: number
    baseUnitInput: string
    inputMode: 'base' | 'bank'
    selectedChip: number | null
    betMultiplier: number
    roundMultiplier: number
    totalStaked: number
    winAmount: number
    profit: number
    accWinnings: number
    accPct: number
    winStreak: number
    lockedBankValue: number | null
    winningNumber: number | null
    spins: number
    trackedSpins: number
    hotNumbers: number[]
    tableState: TableState | null
    nextBet: SerializedRouletteBetPlan
  }
  spin: {
    spinIndex: number
    winningNumber: number | null
    hit: boolean
    round: number
    hitType: KimAlgoStep['hitType']
    sessionOutcome: KimAlgoStep['sessionOutcome']
    nextRound: KimAlgoStep['nextRound']
    nextQuadrant: KimAlgoStep['nextQuadrant']
    nextQuadrants: KimAlgoStep['nextQuadrants']
    candidateQuadrants: KimQuadrantId[]
    selectedQuadrant: KimQuadrantId | null
  }
  result: {
    stake: number
    sessionStake: number
    winningNumber: number | null
    winAmount: number
    profit: number
    round: number
    profitPct: number
  }
  bet: SerializedRouletteBetPlan
  placed: {
    numbers: number[]
    cumulativeNumbers: number[]
    slots: RouletteBetSlotPayload[]
  }
}

export interface SerializedRouletteBetPlan extends Omit<
  KimAlgoBetPlan,
  'numbers' | 'quadrantNumbers' | 'quadrants' | 'spreadQuadrants'
> {
  numbers: number[]
  quadrantNumbers: number[]
  quadrants: KimQuadrantId[]
  spreadQuadrants: KimQuadrantId[]
  slots: RouletteBetSlotPayload[]
}

export interface BuildRouletteSpinResultPayloadArgs {
  step: KimAlgoStep
  sessionStake: number
  grossReturn: number
  winningNumber: number | null
  controls: RouletteSpinResultPayload['controls']
  virtualBoard: Omit<RouletteSpinResultPayload['virtualBoard'], 'winningNumber' | 'nextBet'>
  nextBet: KimAlgoBetPlan
  placedNumbers: readonly number[]
  cumulativePlacedNumbers: readonly number[]
}

export interface BuildRouletteWaitingSpinResultPayloadArgs {
  spinIndex: number
  winningNumber: number | null
  controls: RouletteSpinResultPayload['controls']
  virtualBoard: Omit<RouletteSpinResultPayload['virtualBoard'], 'winningNumber' | 'nextBet'>
  nextBet: KimAlgoBetPlan
  candidateQuadrants: readonly KimQuadrantId[]
  selectedQuadrant: KimQuadrantId | null
}

function countNumbers(numbers: readonly number[]): Map<number, number> {
  const counts = new Map<number, number>()
  numbers.forEach((number) => counts.set(number, (counts.get(number) ?? 0) + 1))
  return counts
}

function serializeBetSlots(bet: KimAlgoBetPlan): RouletteBetSlotPayload[] {
  const slots = [...countNumbers(bet.numbers)]
    .map(([number, placements]) => ({
      number,
      bet: placements * bet.unitStake,
      placements,
      unitStake: bet.unitStake,
      isZeroHedge: false,
      isQuadrantSlot: bet.quadrantNumbers.includes(number)
    }))
    .sort((left, right) => left.number - right.number)

  if (bet.zeroStake > 0) {
    slots.unshift({
      number: 0,
      bet: bet.zeroStake,
      placements: 1,
      unitStake: bet.zeroStake,
      isZeroHedge: true,
      isQuadrantSlot: false
    })
  }

  return slots
}

function serializeBetPlan(bet: KimAlgoBetPlan): SerializedRouletteBetPlan {
  return {
    ...bet,
    numbers: [...bet.numbers],
    quadrantNumbers: [...bet.quadrantNumbers],
    quadrants: [...bet.quadrants],
    spreadQuadrants: [...bet.spreadQuadrants],
    slots: serializeBetSlots(bet)
  }
}

function serializePlacedSlots(placedNumbers: readonly number[], bet: KimAlgoBetPlan): RouletteBetSlotPayload[] {
  const betSlotsByNumber = new Map(serializeBetSlots(bet).map((slot) => [slot.number, slot]))

  return [...countNumbers(placedNumbers)]
    .map(([number, placements]) => {
      const planned = betSlotsByNumber.get(number)
      const unitStake = planned?.unitStake ?? bet.unitStake

      return {
        number,
        bet: placements * unitStake,
        placements,
        unitStake,
        isZeroHedge: number === 0,
        isQuadrantSlot: bet.quadrantNumbers.includes(number)
      }
    })
    .sort((left, right) => left.number - right.number)
}

export function buildRouletteSpinResultPayload({
  step,
  sessionStake,
  grossReturn,
  controls,
  virtualBoard,
  nextBet,
  placedNumbers,
  cumulativePlacedNumbers
}: BuildRouletteSpinResultPayloadArgs): RouletteSpinResultPayload {
  return {
    type: 'roulette.spinResult',
    schemaVersion: 1,
    phase: 'tracking',
    emittedAt: new Date().toISOString(),
    controls,
    virtualBoard: {
      ...virtualBoard,
      winningNumber: step.landedNumber,
      nextBet: serializeBetPlan(nextBet)
    },
    spin: {
      spinIndex: step.spinIndex,
      winningNumber: step.landedNumber,
      round: step.nextRound - 1,
      hit: step.hit,
      hitType: step.hitType,
      sessionOutcome: step.sessionOutcome,
      nextRound: step.nextRound,
      nextQuadrant: step.nextQuadrant,
      nextQuadrants: [...step.nextQuadrants],
      candidateQuadrants: [...step.selection.candidateQuadrants],
      selectedQuadrant: step.selection.selectedQuadrant
    },
    result: {
      stake: step.bet.totalStake,
      sessionStake,
      winAmount: grossReturn,
      winningNumber: step.landedNumber,
      round: step.nextRound,
      profit: grossReturn - sessionStake,
      profitPct: sessionStake > 0 ? (grossReturn - sessionStake) / sessionStake : 0
    },
    bet: serializeBetPlan(step.bet),
    placed: {
      numbers: [...placedNumbers],
      cumulativeNumbers: [...cumulativePlacedNumbers],
      slots: serializePlacedSlots(cumulativePlacedNumbers, step.bet)
    }
  }
}

export function buildRouletteWaitingSpinResultPayload({
  spinIndex,
  winningNumber,
  controls,
  virtualBoard,
  nextBet,
  candidateQuadrants,
  selectedQuadrant
}: BuildRouletteWaitingSpinResultPayloadArgs): RouletteSpinResultPayload {
  return {
    type: 'roulette.spinResult',
    schemaVersion: 1,
    phase: 'waiting_for_signal',
    emittedAt: new Date().toISOString(),
    controls,
    virtualBoard: {
      ...virtualBoard,
      winningNumber,
      nextBet: serializeBetPlan(nextBet)
    },
    spin: {
      spinIndex,
      winningNumber,
      round: 0,
      hit: false,
      hitType: 'miss',
      sessionOutcome: 'continue',
      nextRound: nextBet.round,
      nextQuadrant: nextBet.quadrant,
      nextQuadrants: [...nextBet.quadrants],
      candidateQuadrants: [...candidateQuadrants],
      selectedQuadrant
    },
    result: {
      stake: 0,
      sessionStake: 0,
      winningNumber: winningNumber,
      winAmount: 0,
      round: 0,
      profit: 0,
      profitPct: 0
    },
    bet: serializeBetPlan(nextBet),
    placed: {
      numbers: [],
      cumulativeNumbers: [],
      slots: []
    }
  }
}

export function getDefaultRouletteResultEndpointConfig(devServerPort: number): RouletteResultEndpointConfig {
  return {
    baseUrl: `http://localhost:${devServerPort}`,
    endpoint: '/api/bets/r1'
  }
}

export function normalizeRouletteResultEndpointConfig(
  value: unknown,
  devServerPort: number
): RouletteResultEndpointConfig {
  return normalizeRelayEndpointConfig(value, getDefaultRouletteResultEndpointConfig(devServerPort))
}

export function resolveRouletteResultEndpointUrl(config: RouletteResultEndpointConfig): string {
  return resolveRelayEndpointUrl(config)
}

export async function sendRouletteSpinResult(payload: RouletteSpinResultPayload, endpointUrl: string): Promise<void> {
  await postJsonToEndpoint(payload, endpointUrl, 'roulette result')
}
