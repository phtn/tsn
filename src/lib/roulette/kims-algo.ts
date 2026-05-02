export type KimQuadrantId = 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q6' | 'q7' | 'q8' | 'q9' | 'q10' | 'q11' | 'q12'
export type KimAlgoRound = 1 | 2 | 3 | 4 | 5
export type KimSpreadSelectionMode = 'within' | 'across'

const EUROPEAN_ROULETTE_SLOT_COUNT = 37

export interface KimAlgoOptions {
  startingQuadrant: KimQuadrantId
  baseUnit: number
  allowOverlaps?: boolean
  spreadSelectionMode?: KimSpreadSelectionMode
  hotNumbers?: readonly number[]
  scatter?: boolean
  /** Actual numbers physically placed on the table for each spin, indexed by spin position.
   *  When present for a given step, takes precedence over bet.quadrantNumbers for hit detection. */
  placedNumbersPerStep?: ReadonlyArray<readonly number[]>
}

export interface KimAlgoBetPlan {
  round: KimAlgoRound
  quadrant: KimQuadrantId
  quadrants: KimQuadrantId[]
  numbers: number[]
  quadrantNumbers: number[]
  unitStake: number
  zeroStake: number
  totalStake: number
  coverageCount: number
  coveragePercent: number
  allowOverlaps: boolean
  spreadQuadrants: KimQuadrantId[]
  spreadSelectionMode: KimSpreadSelectionMode
  scatter: boolean
}

export interface KimAlgoSelection {
  number: number
  candidateQuadrants: KimQuadrantId[]
  selectedQuadrant: KimQuadrantId | null
}

export interface KimAlgoStep {
  spinIndex: number
  landedNumber: number
  bet: KimAlgoBetPlan
  hit: boolean
  hitType: 'quadrant' | 'zero' | 'miss'
  sessionOutcome: 'continue' | 'reset_after_win' | 'reset_after_max_loss'
  selection: KimAlgoSelection
  nextRound: KimAlgoRound
  nextQuadrant: KimQuadrantId
  nextQuadrants: KimQuadrantId[]
}

export interface KimAlgoSimulation {
  options: KimAlgoOptions
  assumptions: string[]
  steps: KimAlgoStep[]
  stats: {
    winCount: number
    currentWinStreak: number
    bestWinStreak: number
  }
  finalState: {
    nextRound: KimAlgoRound
    nextQuadrant: KimQuadrantId
    nextQuadrants: KimQuadrantId[]
  }
}

export const KIMS_ALGO_QUADRANTS: Record<KimQuadrantId, readonly number[]> = {
  q1: [1, 2, 5, 4],
  q2: [2, 3, 6, 5],
  q3: [7, 8, 11, 10],
  q4: [8, 9, 12, 11],
  q5: [13, 14, 17, 16],
  q6: [14, 15, 18, 17],
  q7: [19, 20, 23, 22],
  q8: [20, 21, 24, 23],
  q9: [25, 26, 29, 28],
  q10: [26, 27, 30, 29],
  q11: [31, 32, 35, 34],
  q12: [32, 33, 36, 35]
} as const

export const KIMS_ALGO_MAX_ROUNDS = 5
export const KIMS_ALGO_PROGRESSIVE_MULTIPLIERS = [1, 1, 2, 4, 8] as const

export const KIMS_ALGO_ASSUMPTIONS = [
  'The YAML is treated as authoritative for all quadrant definitions, including q5 = [13, 14, 17, 16].',
  'The round ladder counts straight-up number placements, not unique board coverage: round 1 places 4 numbers, round 2 places 8, round 3 places 12, round 4 places 16 plus zero, and round 5 places 20 plus zero.',
  'Per-number stake progression is interpreted as [1x, 1x, 2x, 4x, 8x].',
  'Overlap mode defaults to off. When a new quadrant would overlap existing placements, the overlapping slots are replaced by hot-prioritized local spread picks. Win detection uses quadrantNumbers — the subset of placed numbers that also belong to an active quadrant definition — so spread fills never trigger a win and displaced quadrant numbers (not physically placed) are also excluded.',
  'Idle auto-start uses the latest two logged numbers when they share a quadrant; shared top-vs-bottom ties are broken by hot-number density, then hot rank, then current quadrant.',
  'Zero is hedged on rounds 4 and 5 with the same per-number stake used on the quadrant.',
  'After each miss, the next quadrant is chosen from the landed number and added to the active sequence before the next round begins.',
  'If a winning number belongs to multiple quadrants, the selector prefers the hotter quadrant first — provided the hotter quadrant is not already in the active sequence; if the hotter quadrant is already active, an unused quadrant wins instead; remaining ties break by hot rank score, proximity to the current quadrant id, then by lower quadrant id.',
  'If a reset spin lands on 0, the next quadrant stays on the current quadrant because 0 does not belong to any quadrant.'
] as const

function getQuadrantIndex(quadrantId: KimQuadrantId): number {
  return Number.parseInt(quadrantId.slice(1), 10)
}

function getQuadrantBand(quadrantId: KimQuadrantId): 'lower' | 'upper' {
  return getQuadrantIndex(quadrantId) % 2 === 1 ? 'lower' : 'upper'
}

// ── Board-layout helpers ──────────────────────────────────────────────────
// The roulette board is 3 rows × 12 columns:
//   row 1 (n%3===1): 1, 4, 7, 10, … 34  — unique row for lower-band (odd) quadrants
//   row 2 (n%3===2): 2, 5, 8, 11, … 35  — shared row (never a spread target)
//   row 3 (n%3===0): 3, 6, 9, 12, … 36  — unique row for upper-band (even) quadrants

/** 1-based column of a number on the roulette board. */
function getNumberColumn(n: number): number {
  return Math.ceil(n / 3)
}

/**
 * The pair of columns spanned by a quadrant.
 * q1/q2 → [1,2], q3/q4 → [3,4], …, q11/q12 → [11,12].
 */
function getQuadrantColumns(quadrantId: KimQuadrantId): readonly [number, number] {
  const group = Math.ceil(getQuadrantIndex(quadrantId) / 2)
  return [group * 2 - 1, group * 2] as const
}

/** Minimum column distance from number n to the nearest edge of a quadrant's column span. */
function getColumnDistance(n: number, cols: readonly [number, number]): number {
  const col = getNumberColumn(n)
  return Math.min(Math.abs(col - cols[0]), Math.abs(col - cols[1]))
}

function assertValidRound(round: number): asserts round is KimAlgoRound {
  if (!Number.isInteger(round) || round < 1 || round > KIMS_ALGO_MAX_ROUNDS) {
    throw new Error(`Round must be an integer between 1 and ${KIMS_ALGO_MAX_ROUNDS}.`)
  }
}

function assertValidUnit(baseUnit: number): void {
  if (!Number.isFinite(baseUnit) || baseUnit <= 0) {
    throw new Error('Base unit must be a finite number greater than 0.')
  }
}

function assertValidSpinNumber(number: number): void {
  if (!Number.isInteger(number) || number < 0 || number > 36) {
    throw new Error('Roulette spin numbers must be integers between 0 and 36.')
  }
}

export function getKimQuadrantsContainingNumber(number: number): KimQuadrantId[] {
  assertValidSpinNumber(number)

  return (Object.entries(KIMS_ALGO_QUADRANTS) as Array<[KimQuadrantId, readonly number[]]>)
    .filter(([, values]) => values.includes(number))
    .map(([quadrantId]) => quadrantId)
}

export function getKimQuadrantsContainingPair(firstNumber: number, secondNumber: number): KimQuadrantId[] {
  assertValidSpinNumber(firstNumber)
  assertValidSpinNumber(secondNumber)

  const secondQuadrants = new Set(getKimQuadrantsContainingNumber(secondNumber))
  return getKimQuadrantsContainingNumber(firstNumber).filter((quadrant) => secondQuadrants.has(quadrant))
}

export function resolveKimQuadrantPreference(
  candidateQuadrants: readonly KimQuadrantId[],
  hotNumbers: readonly number[],
  currentQuadrant?: KimQuadrantId
): KimQuadrantId | null {
  if (candidateQuadrants.length === 0) {
    return null
  }

  if (candidateQuadrants.length === 1) {
    return candidateQuadrants[0]
  }

  const hotNumberRanks = new Map(hotNumbers.map((value, index) => [value, index]))

  return [...candidateQuadrants].sort((left, right) => {
    const leftNumbers = KIMS_ALGO_QUADRANTS[left]
    const rightNumbers = KIMS_ALGO_QUADRANTS[right]
    const leftHotCount = leftNumbers.filter((value) => hotNumberRanks.has(value)).length
    const rightHotCount = rightNumbers.filter((value) => hotNumberRanks.has(value)).length

    if (leftHotCount !== rightHotCount) {
      return rightHotCount - leftHotCount
    }

    const leftHotRankScore = leftNumbers.reduce((score, value) => {
      const rank = hotNumberRanks.get(value)
      return score + (rank === undefined ? 0 : hotNumbers.length - rank)
    }, 0)
    const rightHotRankScore = rightNumbers.reduce((score, value) => {
      const rank = hotNumberRanks.get(value)
      return score + (rank === undefined ? 0 : hotNumbers.length - rank)
    }, 0)

    if (leftHotRankScore !== rightHotRankScore) {
      return rightHotRankScore - leftHotRankScore
    }

    if (currentQuadrant) {
      const leftMatchesCurrent = left === currentQuadrant
      const rightMatchesCurrent = right === currentQuadrant

      if (leftMatchesCurrent !== rightMatchesCurrent) {
        return leftMatchesCurrent ? -1 : 1
      }
    }

    return getQuadrantIndex(left) - getQuadrantIndex(right)
  })[0]
}

export function resolveKimAutoStartingQuadrant(
  spins: readonly number[],
  hotNumbers: readonly number[],
  currentQuadrant?: KimQuadrantId
): KimQuadrantId | null {
  if (spins.length < 2) {
    return null
  }

  const [firstNumber, secondNumber] = spins.slice(-2)
  const candidateQuadrants = getKimQuadrantsContainingPair(firstNumber, secondNumber)

  return resolveKimQuadrantPreference(candidateQuadrants, hotNumbers, currentQuadrant)
}

function resolveQuadrantPlacements(
  quadrant: KimQuadrantId,
  placedNumbers: readonly number[],
  allowOverlaps: boolean,
  spreadSelectionMode: KimSpreadSelectionMode,
  hotNumbers: readonly number[]
): {
  numbers: number[]
  spreadApplied: boolean
} {
  const baseNumbers = [...KIMS_ALGO_QUADRANTS[quadrant]]

  if (allowOverlaps) {
    return { numbers: baseNumbers, spreadApplied: false }
  }

  const placedSet = new Set(placedNumbers)
  const uniqueNumbers = baseNumbers.filter((v) => !placedSet.has(v))
  const missingCount = baseNumbers.length - uniqueNumbers.length

  if (missingCount <= 0) {
    return { numbers: baseNumbers, spreadApplied: false }
  }

  const hotRanks = new Map(hotNumbers.map((v, i) => [v, i]))

  let spreadNumbers: number[]

  if (spreadSelectionMode === 'across') {
    // ── Across ─────────────────────────────────────────────────────────────
    // Take the top hot numbers (hottest-first) that are not yet placed or in
    // the quadrant's own unique slots.  If hot numbers run out, fall back to
    // any remaining unplaced number sorted hot-first then descending.
    const isAvailable = (n: number) => n !== 0 && !placedSet.has(n) && !uniqueNumbers.includes(n)

    const candidates: number[] = []
    for (const n of hotNumbers) {
      if (isAvailable(n)) {
        candidates.push(n)
        if (candidates.length === missingCount) break
      }
    }

    if (candidates.length < missingCount) {
      const candidateSet = new Set(candidates)
      const extra = Array.from({ length: 36 }, (_, i) => i + 1)
        .filter((n) => isAvailable(n) && !candidateSet.has(n))
        .sort((a, b) => {
          const ha = hotRanks.get(a)
          const hb = hotRanks.get(b)
          if (ha !== undefined && hb !== undefined) return ha - hb
          if (ha !== undefined) return -1
          if (hb !== undefined) return 1
          return b - a
        })
      candidates.push(...extra.slice(0, missingCount - candidates.length))
    }

    spreadNumbers = candidates
  } else {
    // ── Within ─────────────────────────────────────────────────────────────
    // Spread along the quadrant's own "unique row":
    //   lower-band (odd index) quadrants → row 1 (n % 3 === 1): 1, 4, 7, … 34
    //   upper-band (even index) quadrants → row 3 (n % 3 === 0): 3, 6, 9, … 36
    // Pick the closest available numbers in that row (by column distance),
    // with equal-distance ties broken by hot rank.
    const targetRow = getQuadrantBand(quadrant) === 'lower' ? 1 : 3
    const quadCols = getQuadrantColumns(quadrant)

    const rowNumbers =
      targetRow === 1
        ? Array.from({ length: 12 }, (_, i) => i * 3 + 1) // 1, 4, 7, … 34
        : Array.from({ length: 12 }, (_, i) => (i + 1) * 3) // 3, 6, 9, … 36

    spreadNumbers = rowNumbers
      .filter((n) => !placedSet.has(n) && !uniqueNumbers.includes(n))
      .sort((a, b) => {
        const dA = getColumnDistance(a, quadCols)
        const dB = getColumnDistance(b, quadCols)
        if (dA !== dB) return dA - dB
        // Equal distance → prefer hot, then keep both directions available
        const ha = hotRanks.get(a)
        const hb = hotRanks.get(b)
        if (ha !== undefined && hb !== undefined) return ha - hb
        if (ha !== undefined) return -1
        if (hb !== undefined) return 1
        return 0
      })
      .slice(0, missingCount)
  }

  return {
    numbers: [...uniqueNumbers, ...spreadNumbers],
    spreadApplied: true
  }
}

function appendKimQuadrant(quadrants: readonly KimQuadrantId[], nextQuadrant: KimQuadrantId): KimQuadrantId[] {
  return [...quadrants, nextQuadrant]
}

function summarizeKimWinStreaks(steps: readonly KimAlgoStep[]): KimAlgoSimulation['stats'] {
  let winCount = 0
  let currentWinStreak = 0
  let bestWinStreak = 0

  for (const step of steps) {
    if (step.hitType === 'miss') {
      // Only reset streak when the full sequence is exhausted or zero hit without a hedge
      if (step.sessionOutcome === 'reset_after_max_loss') {
        currentWinStreak = 0
      }
      continue
    }

    winCount += 1
    currentWinStreak += 1
    bestWinStreak = Math.max(bestWinStreak, currentWinStreak)
  }

  return {
    winCount,
    currentWinStreak,
    bestWinStreak
  }
}

export function selectKimQuadrant(
  number: number,
  options: {
    currentQuadrant?: KimQuadrantId
    usedQuadrants?: readonly KimQuadrantId[]
    hotNumbers?: readonly number[]
  } = {}
): KimAlgoSelection {
  const candidateQuadrants = getKimQuadrantsContainingNumber(number)
  const { currentQuadrant, usedQuadrants = [], hotNumbers = [] } = options

  if (candidateQuadrants.length === 0) {
    return {
      number,
      candidateQuadrants,
      selectedQuadrant: currentQuadrant ?? null
    }
  }

  const usedQuadrantSet = new Set(usedQuadrants)
  const hotNumberRanks = new Map(hotNumbers.map((value, index) => [value, index]))
  const currentIndex = currentQuadrant ? getQuadrantIndex(currentQuadrant) : null

  const selectedQuadrant = [...candidateQuadrants].sort((left, right) => {
    const leftIsUsed = usedQuadrantSet.has(left)
    const rightIsUsed = usedQuadrantSet.has(right)
    const leftNumbers = KIMS_ALGO_QUADRANTS[left]
    const rightNumbers = KIMS_ALGO_QUADRANTS[right]
    const leftHotCount = leftNumbers.filter((value) => hotNumberRanks.has(value)).length
    const rightHotCount = rightNumbers.filter((value) => hotNumberRanks.has(value)).length

    // 1. Prefer the hotter quadrant, but only if the hotter one is not already in the active sequence
    if (leftHotCount !== rightHotCount) {
      const hotterIsLeft = leftHotCount > rightHotCount
      const hotterIsUsed = hotterIsLeft ? leftIsUsed : rightIsUsed
      if (!hotterIsUsed) {
        return rightHotCount - leftHotCount
      }
    }

    // 2. Prefer quadrant not already in the active sequence
    if (leftIsUsed !== rightIsUsed) {
      return leftIsUsed ? 1 : -1
    }

    // 3. Prefer quadrant with more hot numbers (both have same used status)
    if (leftHotCount !== rightHotCount) {
      return rightHotCount - leftHotCount
    }

    // 4. Prefer quadrant with higher cumulative hot rank score (lower rank index = hotter)
    const leftHotScore = leftNumbers.reduce((score, value) => {
      const rank = hotNumberRanks.get(value)
      return score + (rank === undefined ? 0 : hotNumbers.length - rank)
    }, 0)
    const rightHotScore = rightNumbers.reduce((score, value) => {
      const rank = hotNumberRanks.get(value)
      return score + (rank === undefined ? 0 : hotNumbers.length - rank)
    }, 0)
    if (leftHotScore !== rightHotScore) {
      return rightHotScore - leftHotScore
    }

    // 5. Prefer quadrant closest to the current quadrant by index
    if (currentIndex !== null) {
      const distanceToLeft = Math.abs(getQuadrantIndex(left) - currentIndex)
      const distanceToRight = Math.abs(getQuadrantIndex(right) - currentIndex)
      if (distanceToLeft !== distanceToRight) {
        return distanceToLeft - distanceToRight
      }
    }

    // 6. Lower quadrant id as final tiebreaker
    return getQuadrantIndex(left) - getQuadrantIndex(right)
  })[0]

  return {
    number,
    candidateQuadrants,
    selectedQuadrant
  }
}

export function getKimAlgoGrossReturn(
  bet: Pick<KimAlgoBetPlan, 'numbers' | 'unitStake' | 'zeroStake'>,
  landedNumber: number
): number {
  if (landedNumber === 0) {
    return bet.zeroStake > 0 ? 36 * bet.zeroStake : 0
  }

  const placementCount = bet.numbers.reduce((count, value) => count + (value === landedNumber ? 1 : 0), 0)
  return placementCount > 0 ? 36 * bet.unitStake * placementCount : 0
}

export function getKimAlgoNetProfit(
  bet: Pick<KimAlgoBetPlan, 'numbers' | 'unitStake' | 'zeroStake' | 'totalStake'>,
  landedNumber: number
): number {
  return getKimAlgoGrossReturn(bet, landedNumber) - bet.totalStake
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items]
  let s = (seed + 1) >>> 0
  for (let i = result.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function createKimAlgoBetPlan(
  round: KimAlgoRound,
  quadrants: readonly KimQuadrantId[],
  baseUnit: number = 1,
  options: Pick<KimAlgoOptions, 'allowOverlaps' | 'spreadSelectionMode' | 'hotNumbers' | 'scatter'> & {
    scatterSeed?: number
  } = {}
): KimAlgoBetPlan {
  assertValidRound(round)
  assertValidUnit(baseUnit)

  if (quadrants.length === 0) {
    throw new Error('At least one quadrant is required to create a Kim Algo bet plan.')
  }

  const unitStake = baseUnit * KIMS_ALGO_PROGRESSIVE_MULTIPLIERS[round - 1]
  const zeroStake = round >= 4 ? unitStake : 0
  const scatter = options.scatter ?? false
  const allowOverlaps = options.allowOverlaps ?? false
  const spreadSelectionMode = options.spreadSelectionMode ?? 'within'
  const spreadQuadrants: KimQuadrantId[] = []
  let numbers: number[]

  if (scatter) {
    // Resolve overlaps with the same within/across spread logic, then shuffle
    const resolved = quadrants.reduce<number[]>((placements, quadrant) => {
      const r = resolveQuadrantPlacements(quadrant, placements, false, spreadSelectionMode, options.hotNumbers ?? [])
      if (r.spreadApplied) spreadQuadrants.push(quadrant)
      placements.push(...r.numbers)
      return placements
    }, [])
    numbers =
      options.scatterSeed !== undefined
        ? seededShuffle(resolved, options.scatterSeed)
        : [...resolved].sort(() => Math.random() - 0.5)
  } else {
    numbers = quadrants.reduce<number[]>((placements, quadrant) => {
      const resolved = resolveQuadrantPlacements(
        quadrant,
        placements,
        allowOverlaps,
        spreadSelectionMode,
        options.hotNumbers ?? []
      )

      if (resolved.spreadApplied) {
        spreadQuadrants.push(quadrant)
      }

      placements.push(...resolved.numbers)
      return placements
    }, [])
  }

  const coverageCount = numbers.length + (zeroStake > 0 ? 1 : 0)
  const placedSet = new Set(numbers)
  const quadrantNumbers = [...quadrants]
    .flatMap((q) => (KIMS_ALGO_QUADRANTS[q] as readonly number[]).filter((n) => placedSet.has(n)))
    .filter((n, i, arr) => arr.indexOf(n) === i)

  return {
    round,
    quadrant: quadrants[quadrants.length - 1],
    quadrants: [...quadrants],
    numbers,
    quadrantNumbers,
    unitStake,
    zeroStake,
    totalStake: numbers.length * unitStake + zeroStake,
    coverageCount,
    coveragePercent: (coverageCount / EUROPEAN_ROULETTE_SLOT_COUNT) * 100,
    allowOverlaps,
    spreadQuadrants,
    spreadSelectionMode,
    scatter
  }
}

export function simulateKimsAlgo(spins: readonly number[], options: Partial<KimAlgoOptions> = {}): KimAlgoSimulation {
  const resolvedOptions: KimAlgoOptions = {
    startingQuadrant: options.startingQuadrant ?? 'q1',
    baseUnit: options.baseUnit ?? 1,
    allowOverlaps: options.allowOverlaps ?? false,
    spreadSelectionMode: options.spreadSelectionMode ?? 'within',
    hotNumbers: options.hotNumbers ?? [],
    scatter: options.scatter ?? false
  }

  assertValidUnit(resolvedOptions.baseUnit)

  let activeQuadrants: KimQuadrantId[] = [resolvedOptions.startingQuadrant]
  let activeQuadrant = resolvedOptions.startingQuadrant
  let activeRound: KimAlgoRound = 1

  const steps = spins.map((landedNumber, index) => {
    assertValidSpinNumber(landedNumber)

    const bet = createKimAlgoBetPlan(activeRound, activeQuadrants, resolvedOptions.baseUnit, {
      allowOverlaps: resolvedOptions.allowOverlaps,
      spreadSelectionMode: resolvedOptions.spreadSelectionMode,
      hotNumbers: resolvedOptions.hotNumbers,
      scatter: resolvedOptions.scatter,
      scatterSeed: index
    })
    // A win requires the ball to land on a number that was physically placed AND belongs
    // to an active quadrant definition. Spread replacements are not in quadrantNumbers so
    // they cannot trigger a session reset, and quadrant numbers displaced by spread fills
    // (never actually placed) are also excluded.
    // Use actually-placed numbers from Evolution when available; fall back to the
    // computed quadrantNumbers so the simulator still works without live data.
    const actualPlaced = resolvedOptions.placedNumbersPerStep?.[index]
    // A win requires landing on a quadrant number (never a spread fill).
    // In live mode also require the number was physically placed (guards missed spots).
    const hitQuadrant = actualPlaced
      ? bet.quadrantNumbers.includes(landedNumber) && actualPlaced.includes(landedNumber)
      : bet.quadrantNumbers.includes(landedNumber)

    console.log(
      `[kim] spin ${index + 1} | R${activeRound} | quadrants: [${activeQuadrants.join(', ')}]` +
        ` | placed: [${(actualPlaced ?? bet.numbers).join(', ')}]` +
        ` | landed: ${landedNumber} | hit: ${hitQuadrant}` +
        (actualPlaced ? ' (live)' : ' (sim)')
    )

    const hitZero = bet.zeroStake > 0 && landedNumber === 0
    const hit = hitQuadrant || hitZero
    // Zero on rounds 1–3 (no zero hedge) is an immediate loss — don't escalate
    const zeroOnUnhedgedRound = landedNumber === 0 && bet.zeroStake === 0
    const isSessionReset = hit || activeRound === KIMS_ALGO_MAX_ROUNDS || zeroOnUnhedgedRound

    // After a session reset the next quadrant belongs to a fresh sequence — pass no
    // usedQuadrants so the selector picks purely by hot count and proximity to the
    // current quadrant. During a miss-chain, pass activeQuadrants to avoid repeating
    // a quadrant that is already in the escalating sequence.
    const selection = selectKimQuadrant(landedNumber, {
      currentQuadrant: activeQuadrant,
      usedQuadrants: isSessionReset ? [] : activeQuadrants,
      hotNumbers: resolvedOptions.hotNumbers
    })

    let sessionOutcome: KimAlgoStep['sessionOutcome'] = 'continue'
    let nextRound: KimAlgoStep['nextRound'] = activeRound === 5 ? 5 : ((activeRound + 1) as KimAlgoStep['nextRound'])
    let nextQuadrant = activeQuadrant
    let nextQuadrants = [...activeQuadrants]

    if (hit) {
      sessionOutcome = 'reset_after_win'
      nextRound = 1
      nextQuadrant = selection.selectedQuadrant ?? activeQuadrant
      nextQuadrants = [nextQuadrant]
    } else if (activeRound === KIMS_ALGO_MAX_ROUNDS || zeroOnUnhedgedRound) {
      sessionOutcome = 'reset_after_max_loss'
      nextRound = 1
      nextQuadrant = selection.selectedQuadrant ?? activeQuadrant
      nextQuadrants = [nextQuadrant]
    } else {
      nextRound = (activeRound + 1) as KimAlgoStep['nextRound']
      nextQuadrant = selection.selectedQuadrant ?? activeQuadrant
      nextQuadrants = appendKimQuadrant(activeQuadrants, nextQuadrant)
    }

    const step: KimAlgoStep = {
      spinIndex: index + 1,
      landedNumber,
      bet,
      hit,
      hitType: hitQuadrant ? 'quadrant' : hitZero ? 'zero' : 'miss',
      sessionOutcome,
      selection,
      nextRound,
      nextQuadrant,
      nextQuadrants
    }

    activeRound = nextRound
    activeQuadrant = nextQuadrant
    activeQuadrants = nextQuadrants

    return step
  })

  return {
    options: resolvedOptions,
    assumptions: [...KIMS_ALGO_ASSUMPTIONS],
    steps,
    stats: summarizeKimWinStreaks(steps),
    finalState: {
      nextRound: activeRound,
      nextQuadrant: activeQuadrant,
      nextQuadrants: activeQuadrants
    }
  }
}
