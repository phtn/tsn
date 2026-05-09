import { TableState } from '@/src/types/roulette'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  KIMS_ALGO_QUADRANTS,
  createKimAlgoBetPlan,
  getKimAlgoGrossReturn,
  getKimQuadrantsContainingPair,
  resolveKimAutoStartingQuadrant,
  simulateKimsAlgo,
  type KimQuadrantId,
  type KimSpreadSelectionMode
} from '../../../lib/roulette'
import { cn } from '../../../lib/utils'
import type { PanelStatus } from '../../../types'
import {
  buildRouletteSpinResultPayload,
  buildRouletteWaitingSpinResultPayload,
  sendRouletteSpinResult
} from '../../lib/rouletteSpinResults'
import { ChipStack, EVO_BUTTON_SELECTORS } from './chip-stack'
import { RouletteControls } from './roulette-controls'
import { RouletteGrid } from './roulette-grid'
import { RouletteStats } from './roulette-stats'
import {
  fmtAmt,
  formatQuadrantLabel,
  getEffectiveStakeMultiplier,
  getHotNumbers,
  getPlacementMap,
  pickVerb
} from './utils'

interface RouletteVirtualBoardProps {
  status: PanelStatus
  winningNumbers: readonly number[]
  evolutionChips: number[]
  evolutionRebetVisible: boolean
  evolutionBettingOpen: boolean
  evolutionTableState: TableState | null
  rouletteResultEndpointUrl: string
}

export function RouletteVirtualBoard({
  winningNumbers,
  evolutionChips,
  evolutionRebetVisible,
  evolutionTableState,
  rouletteResultEndpointUrl
}: RouletteVirtualBoardProps) {
  const [startingQuadrant, setStartingQuadrant] = useState<KimQuadrantId>('q1')
  const [hoveredQuadrant, setHoveredQuadrant] = useState<KimQuadrantId | null>(null)
  const [baseUnitInput, setBaseUnitInput] = useState('1')
  const [isTracking, setIsTracking] = useState(false)
  const [allowOverlaps, setAllowOverlaps] = useState(false)
  const [spreadSelectionMode, setSpreadSelectionMode] = useState<KimSpreadSelectionMode>('within')
  const [scatter, setScatter] = useState(false)
  const [trackedWinningNumbers, setTrackedWinningNumbers] = useState<number[]>([])
  const [lastConsumedIndex, setLastConsumedIndex] = useState(winningNumbers.length)
  const [winStreak, setWinStreak] = useState(0)
  const [accWinnings, setAccWinnings] = useState(0)
  const [lastWinProfit, setLastWinProfit] = useState<number | null>(null)
  const [winVerb, setWinVerb] = useState(pickVerb)
  const [lockedBankValue, setLockedBankValue] = useState<number | null>(null)
  const [inputMode, setInputMode] = useState<'base' | 'bank'>('base')
  const [selectedChip, setSelectedChip] = useState<number | null>(null)
  // Auto-arm: arm the board automatically when a KIM signal is detected
  const [auto, setAuto] = useState(false)
  // Loaded: auto-execute v-board bets on the actual Evolution table each betting window
  const [loaded, setLoaded] = useState(false)
  // Evolution's DOM takes a moment to render bet spots after the window signal fires.
  // Bet verification feedback: 'idle' | 'placing' | 'ok' | 'missed'
  const [betStatus, setBetStatus] = useState<'idle' | 'placing' | 'ok' | 'missed'>('idle')
  const [placedLog, setPlacedLog] = useState<number[][]>([])
  const [betMultiplier, setBetMultiplier] = useState<number>(1)

  const processedStepCountRef = useRef(0)
  const waitingSpinSentCountRef = useRef(winningNumbers.length)
  // Edge-detection refs
  const prevSignalFoundRef = useRef(false)
  // lastBetStepRef: step for which bets were actually *dispatched* to the background.
  // claimedStepRef: step for which a pending timer is scheduled (reset on cancel).
  // Separating these two lets the next betting window retry a step whose timer was
  // cancelled mid-delay (e.g. the window closed before the delay elapsed).
  const lastBetStepRef = useRef(-1)
  const claimedStepRef = useRef(-1)
  // Always-current refs used inside the 700ms timer callback to guard against
  // loaded/isTracking being toggled off between schedule and fire time.
  const loadedRef = useRef(loaded)
  const isTrackingRef = useRef(isTracking)
  // Always-current simulation step count — read inside the betting effect so we
  // can remove simulation.steps.length from the dep array and avoid cancelling
  // in-flight timers when a spin result arrives mid-window.

  const parsedInput = Number.parseFloat(baseUnitInput)
  const baseUnitCandidate =
    selectedChip !== null
      ? selectedChip * betMultiplier
      : Number.isFinite(parsedInput) && parsedInput > 0
        ? inputMode === 'bank'
          ? parsedInput / 272
          : parsedInput
        : null
  const [baseUnitValue, setBaseUnitValue] = useState(baseUnitCandidate ?? 1)
  const baseUnit = baseUnitCandidate ?? baseUnitValue

  useEffect(() => {
    if (baseUnitCandidate === null) return
    setBaseUnitValue((current) => (current === baseUnitCandidate ? current : baseUnitCandidate))
  }, [baseUnitCandidate])

  const hotNumberSource = isTracking ? trackedWinningNumbers : winningNumbers
  const hotNumbers = useMemo(() => getHotNumbers(hotNumberSource), [hotNumberSource])
  const selectedStartingQuadrantNumbers = useMemo(
    () => new Set(KIMS_ALGO_QUADRANTS[startingQuadrant]),
    [startingQuadrant]
  )
  const hoveredQuadrantNumbers = useMemo(
    () => new Set(hoveredQuadrant ? KIMS_ALGO_QUADRANTS[hoveredQuadrant] : []),
    [hoveredQuadrant]
  )
  const autoStartingQuadrant = useMemo(
    () => (!isTracking ? resolveKimAutoStartingQuadrant(winningNumbers, hotNumbers, startingQuadrant) : null),
    [hotNumbers, isTracking, startingQuadrant, winningNumbers]
  )

  useEffect(() => {
    if (!isTracking && autoStartingQuadrant && autoStartingQuadrant !== startingQuadrant) {
      setStartingQuadrant(autoStartingQuadrant)
    }
  }, [autoStartingQuadrant, isTracking, startingQuadrant])

  // Keep the stats input display in sync with the derived base unit
  useEffect(() => {
    if (selectedChip !== null) {
      setBaseUnitInput(String(selectedChip * betMultiplier))
      setInputMode('base')
    }
  }, [selectedChip, betMultiplier])

  // Accumulate placed numbers across rounds — chips persist on the Evolution table,
  // so the full set of numbers physically on the table at step N is the union of
  // all per-round placements up to and including that step.
  const cumulativePlacedLog = useMemo(() => {
    const result: number[][] = []
    const accumulated = new Set<number>()
    for (const nums of placedLog) {
      nums.forEach((n) => accumulated.add(n))
      result.push([...accumulated])
    }
    return result
  }, [placedLog])
  const placedNumbersPerTrackedStep = useMemo(
    () => trackedWinningNumbers.map((_, index) => cumulativePlacedLog[index] ?? []),
    [cumulativePlacedLog, trackedWinningNumbers]
  )

  const simulation = useMemo(
    () =>
      simulateKimsAlgo(trackedWinningNumbers, {
        startingQuadrant,
        baseUnit,
        allowOverlaps,
        spreadSelectionMode,
        scatter,
        placedNumbersPerStep: placedNumbersPerTrackedStep
      }),
    [
      allowOverlaps,
      baseUnit,
      hotNumbers,
      placedNumbersPerTrackedStep,
      scatter,
      spreadSelectionMode,
      startingQuadrant,
      trackedWinningNumbers
    ]
  )

  const simulationStepsRef = useRef(simulation.steps.length)

  const nextBet = useMemo(
    () =>
      createKimAlgoBetPlan(simulation.finalState.nextRound, simulation.finalState.nextQuadrants, baseUnit, {
        allowOverlaps,
        spreadSelectionMode,
        hotNumbers,
        scatter,
        scatterSeed: trackedWinningNumbers.length
      }),
    [allowOverlaps, baseUnit, hotNumbers, scatter, simulation, spreadSelectionMode, trackedWinningNumbers.length]
  )
  const roundMultiplier = getEffectiveStakeMultiplier(nextBet.unitStake, baseUnit, 1)
  const placementMap = useMemo(() => getPlacementMap(nextBet.numbers), [nextBet])
  const latestWinningNumber = trackedWinningNumbers[trackedWinningNumbers.length - 1] ?? null
  const lastResetIndex = useMemo(
    () => simulation.steps.reduce((last, step, idx) => (step.sessionOutcome !== 'continue' ? idx : last), -1),
    [simulation]
  )
  const totalStaked = useMemo(
    () =>
      simulation.steps.slice(lastResetIndex + 1).reduce((sum, step) => sum + step.bet.totalStake, 0) +
      nextBet.totalStake,
    [lastResetIndex, nextBet, simulation]
  )
  const winAmount = 36 * nextBet.unitStake
  // const recentSteps = simulation.steps.slice(-6).reverse()
  const accPct = lockedBankValue && lockedBankValue > 0 ? (accWinnings / lockedBankValue) * 100 : 0

  // Signal: 2 consecutive numbers share a quadrant — only meaningful when not armed
  const signalQuadrants = useMemo(() => {
    if (isTracking || winningNumbers.length < 2) return []
    const last = winningNumbers[winningNumbers.length - 1]
    const prev = winningNumbers[winningNumbers.length - 2]
    return getKimQuadrantsContainingPair(prev, last)
  }, [isTracking, winningNumbers])
  const signalFound = signalQuadrants.length > 0

  // Sync always-current refs every render so timer callbacks see live values.
  loadedRef.current = loaded
  isTrackingRef.current = isTracking
  simulationStepsRef.current = simulation.steps.length

  // Hot rank map: number → rank (1 = hottest), only top 4
  const hotRankMap = useMemo(() => {
    const map = new Map<number, number>()
    hotNumbers.slice(0, 4).forEach((n, i) => map.set(n, i + 1))
    return map
  }, [hotNumbers])

  useEffect(() => {
    if (winningNumbers.length < lastConsumedIndex) {
      setTrackedWinningNumbers([])
      setLastConsumedIndex(winningNumbers.length)
      waitingSpinSentCountRef.current = winningNumbers.length
      return
    }

    if (!isTracking || winningNumbers.length === lastConsumedIndex) {
      return
    }

    setTrackedWinningNumbers((current) => [...current, ...winningNumbers.slice(lastConsumedIndex)])
    setLastConsumedIndex(winningNumbers.length)
  }, [isTracking, lastConsumedIndex, winningNumbers])

  useEffect(() => {
    if (winningNumbers.length < waitingSpinSentCountRef.current) {
      waitingSpinSentCountRef.current = winningNumbers.length
      return
    }

    if (isTracking) {
      waitingSpinSentCountRef.current = winningNumbers.length
      return
    }

    if (winningNumbers.length === waitingSpinSentCountRef.current) {
      return
    }

    const startIndex = waitingSpinSentCountRef.current
    const newWinningNumbers = winningNumbers.slice(startIndex)
    waitingSpinSentCountRef.current = winningNumbers.length

    newWinningNumbers.forEach((winningNumber, index) => {
      const payload = buildRouletteWaitingSpinResultPayload({
        spinIndex: startIndex + index + 1,
        winningNumber,
        controls: {
          winVerb,
          lastWinProfit,
          signalFound,
          isTracking,
          auto,
          scatter,
          allowOverlaps,
          spreadSelectionMode,
          loaded,
          betStatus
        },
        virtualBoard: {
          startingQuadrant,
          baseUnit,
          baseUnitInput,
          inputMode,
          selectedChip,
          betMultiplier,
          roundMultiplier,
          totalStaked,
          winAmount,
          profit: winAmount - totalStaked,
          accWinnings,
          accPct,
          winStreak,
          lockedBankValue,
          spins: winningNumbers.length,
          trackedSpins: trackedWinningNumbers.length,
          hotNumbers,
          tableState: evolutionTableState
        },
        nextBet,
        candidateQuadrants: signalQuadrants,
        selectedQuadrant: autoStartingQuadrant
      })
      void sendRouletteSpinResult(payload, rouletteResultEndpointUrl)
    })
  }, [
    accPct,
    accWinnings,
    allowOverlaps,
    auto,
    autoStartingQuadrant,
    baseUnit,
    baseUnitInput,
    betMultiplier,
    betStatus,
    evolutionTableState,
    hotNumbers,
    inputMode,
    isTracking,
    lastWinProfit,
    loaded,
    lockedBankValue,
    nextBet,
    rouletteResultEndpointUrl,
    roundMultiplier,
    scatter,
    selectedChip,
    signalFound,
    signalQuadrants,
    spreadSelectionMode,
    startingQuadrant,
    totalStaked,
    trackedWinningNumbers.length,
    winAmount,
    winStreak,
    winVerb,
    winningNumbers
  ])

  // Persistent win streak + accumulated winnings — survive arm/disarm cycles
  useEffect(() => {
    const currentCount = simulation.steps.length
    if (currentCount === 0) {
      processedStepCountRef.current = 0
      return
    }
    const newSteps = simulation.steps.slice(processedStepCountRef.current)
    processedStepCountRef.current = currentCount
    if (newSteps.length === 0) return

    let streakDelta = 0
    let streakReset = false
    let winningsGained = 0
    let latestProfit: number | null = null

    for (const step of newSteps) {
      const stepIdx = step.spinIndex - 1
      const placedForStep = placedNumbersPerTrackedStep[stepIdx] ?? []
      const isWin = placedForStep.includes(step.landedNumber)
      let sessionStake = step.bet.totalStake
      for (let i = stepIdx - 1; i >= 0; i--) {
        const prevStep = simulation.steps[i]
        if (prevStep.sessionOutcome !== 'continue') break
        sessionStake += prevStep.bet.totalStake
      }
      const grossReturn = isWin ? getKimAlgoGrossReturn(step.bet, step.landedNumber) : 0
      const profit = grossReturn - sessionStake

      if (!isWin) {
        if (step.sessionOutcome === 'reset_after_max_loss') streakReset = true
      } else {
        streakDelta += 1
        winningsGained += profit
        latestProfit = profit
      }

      const payload = buildRouletteSpinResultPayload({
        step,
        sessionStake,
        grossReturn,
        winningNumber: latestWinningNumber ?? null,
        controls: {
          winVerb,
          lastWinProfit: isWin ? profit : lastWinProfit,
          signalFound,
          isTracking,
          auto,
          scatter,
          allowOverlaps,
          spreadSelectionMode,
          loaded,
          betStatus
        },
        virtualBoard: {
          startingQuadrant,
          baseUnit,
          baseUnitInput,
          inputMode,
          selectedChip,
          betMultiplier,
          roundMultiplier,
          totalStaked,
          winAmount,
          profit: winAmount - totalStaked,
          accWinnings: accWinnings + winningsGained,
          accPct,
          winStreak: streakReset ? 0 : winStreak + streakDelta,
          lockedBankValue,
          spins: winningNumbers.length,
          trackedSpins: trackedWinningNumbers.length,
          hotNumbers,
          tableState: evolutionTableState
        },
        nextBet,
        placedNumbers: placedForStep,
        cumulativePlacedNumbers: placedForStep
      })
      void sendRouletteSpinResult(payload, rouletteResultEndpointUrl)
    }

    setWinStreak((prev) => (streakReset ? 0 : prev + streakDelta))
    if (winningsGained !== 0) setAccWinnings((prev) => prev + winningsGained)
    if (latestProfit !== null) {
      setLastWinProfit(latestProfit)
      setWinVerb(pickVerb())
    }
  }, [
    accPct,
    accWinnings,
    allowOverlaps,
    auto,
    baseUnit,
    baseUnitInput,
    betMultiplier,
    betStatus,
    cumulativePlacedLog,
    evolutionTableState,
    hotNumbers,
    inputMode,
    isTracking,
    lastWinProfit,
    loaded,
    lockedBankValue,
    nextBet,
    placedNumbersPerTrackedStep,
    rouletteResultEndpointUrl,
    roundMultiplier,
    scatter,
    selectedChip,
    signalFound,
    simulation.steps,
    spreadSelectionMode,
    startingQuadrant,
    totalStaked,
    trackedWinningNumbers.length,
    winAmount,
    winStreak,
    winVerb,
    winningNumbers.length
  ])

  // Auto-disarm on win, max-loss, or zero without a hedge (rounds 1–3)
  useEffect(() => {
    if (!isTracking) return
    const latestStep = simulation.steps[simulation.steps.length - 1]
    if (!latestStep) return
    if (
      latestStep.sessionOutcome === 'reset_after_win' ||
      latestStep.sessionOutcome === 'reset_after_max_loss' ||
      (latestStep.landedNumber === 0 && latestStep.bet.zeroStake === 0)
    ) {
      setIsTracking(false)
    }
  }, [simulation.steps, isTracking])

  // ── Auto-arm ──────────────────────────────────────────────────────────────
  // Fire exactly once on the rising edge of signalFound while auto is on.
  useEffect(() => {
    if (!auto) {
      // Reset ref so enabling auto with an existing signal is treated as a rising edge.
      prevSignalFoundRef.current = false
      return
    }
    if (isTracking) {
      // Signal is forced false while tracking; keep ref in sync.
      prevSignalFoundRef.current = false
      return
    }
    const wasSignal = prevSignalFoundRef.current
    prevSignalFoundRef.current = signalFound
    if (signalFound && !wasSignal) {
      // Signal just appeared — arm the board
      if (autoStartingQuadrant) setStartingQuadrant(autoStartingQuadrant)
      setTrackedWinningNumbers([])
      setPlacedLog([])
      setLastConsumedIndex(winningNumbers.length)
      setLockedBankValue(baseUnit * 272)
      setIsTracking(true)
    }
  }, [auto, signalFound, isTracking, autoStartingQuadrant, baseUnit, winningNumbers.length])

  // ── Loaded: auto-execute bets once per simulation step ───────────────────
  // Reset the step guard on every arm/disarm so each new session starts fresh.
  // On disarm (win, loss, or manual), also clear stale bet status and tracked numbers
  // so the board returns to a clean idle state without requiring a manual re-arm cycle.
  useEffect(() => {
    lastBetStepRef.current = -1
    claimedStepRef.current = -1
    if (!isTracking) {
      setBetStatus('idle')
      setTrackedWinningNumbers([])
    }
  }, [isTracking])

  useEffect(() => {
    if (!loaded || !isTracking || evolutionTableState !== 'BETS_OPEN') return
    if (!selectedChip) return // no chip selected yet
    if (nextBet.numbers.length === 0) return // nothing to bet

    // Read step count from ref so that an incoming spin result mid-window does
    // NOT cancel this timer. Only evolutionTableState/loaded/isTracking/chip
    // changes should interrupt an in-flight timer.
    const currentStep = simulationStepsRef.current
    if (lastBetStepRef.current === currentStep) return // already dispatched for this step
    if (claimedStepRef.current === currentStep) return // timer already pending for this step
    claimedStepRef.current = currentStep // reserve a pending timer slot

    setBetStatus('placing')

    // Snapshot everything needed inside the closure so the delayed callback
    // uses the values from *this* render, not a potentially-stale later one.
    const effectivePlacementMap = new Map(placementMap)
    if (nextBet.zeroStake > 0) effectivePlacementMap.set(0, 1)

    const multiplier = betMultiplier
    const baseNumbers: number[] = []
    for (const [num, count] of effectivePlacementMap) {
      for (let i = 0; i < count * multiplier; i++) baseNumbers.push(num)
    }

    const doubleCount = roundMultiplier > 1 ? Math.log2(roundMultiplier) : 0
    const chip = selectedChip
    const round = nextBet.round
    const effectiveDelay = 700

    // Delay the actual placement so Evolution's bet-spot DOM has time to render
    // after the betting-window signal fires.
    const timer = setTimeout(() => {
      claimedStepRef.current = -1 // release the pending slot

      // Guard: loaded or tracking may have changed between schedule and fire.
      if (!loadedRef.current || !isTrackingRef.current) {
        setBetStatus('idle')
        return
      }

      lastBetStepRef.current = currentStep // mark step as dispatched
      chrome.runtime.sendMessage(
        { type: 'PLACE_EVOLUTION_BETS', chipValue: chip, numbers: baseNumbers, doubleCount },
        (response) => {
          const missed: number[] = response?.missed ?? []
          const placed: number[] = response?.placed ?? []
          const ok = !chrome.runtime.lastError && response?.ok && missed.length === 0

          setPlacedLog((prev) => [...prev, [...new Set(placed)]])
          console.log(`[kim] R${round} placed on table: [${placed.join(', ')}]`)

          setBetStatus(ok ? 'ok' : 'missed')
          setTimeout(() => setBetStatus('idle'), 4000)

          if (!ok) {
            const runtimeErr = chrome.runtime.lastError?.message ?? 'none'
            const missedStr = missed.length ? missed.join(', ') : 'none'
            console.warn(
              `[Load] ⚠ placed ${placed.length}/${baseNumbers.length} — missed: [${missedStr}] | runtime error: ${runtimeErr} | round ${round} (chip ${chip})`
            )
          }
        }
      )
    }, effectiveDelay)

    return () => {
      clearTimeout(timer)
      claimedStepRef.current = -1 // release claim without dispatching — next window can retry
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evolutionTableState, loaded, isTracking, selectedChip])
  // ^ placementMap/roundMultiplier/nextBet/simulation.steps.length intentionally
  //   omitted from deps — snapshotted into locals (or read via ref) at fire time.
  //   Trigger: evolutionTableState === 'BETS_OPEN' — one bet per window.
  //   Step count is read via simulationStepsRef so incoming results mid-window
  //   don't cancel the in-flight timer and reschedule at the wrong round.

  const handleTrackingToggle = () => {
    if (isTracking) {
      setIsTracking(false)
      return
    }

    if (autoStartingQuadrant) {
      setStartingQuadrant(autoStartingQuadrant)
    }

    setTrackedWinningNumbers([])
    setPlacedLog([])
    setLastConsumedIndex(winningNumbers.length)
    setLockedBankValue(baseUnit * 272)
    setIsTracking(true)
  }
  const placeEvolutionBets = (numbers: number[]) => {
    if (!selectedChip) return
    chrome.runtime.sendMessage({ type: 'PLACE_EVOLUTION_BETS', chipValue: selectedChip, numbers }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('Failed to place bets:', chrome.runtime.lastError.message)
        return
      }
      if (response?.ok) {
        console.log('Bets placed:', response.placed)
      } else {
        console.warn('Bet placement issue:', response)
      }
    })
  }

  const sendEvoClick = useCallback((selector: string, label: string) => {
    chrome.runtime.sendMessage({ type: 'CLICK_EVOLUTION_ELEMENT', selector }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn(`[evo] ${label} click failed:`, chrome.runtime.lastError.message)
      } else {
        console.log(`[evo] ${label} click:`, response)
      }
    })
  }, [])

  const onChipSelect = useCallback(
    (v: number) => () => {
      setSelectedChip(v)
      sendEvoClick(`div[data-role="chip"][data-value="${v}"]`, `chip-${v}`)
    },
    [sendEvoClick]
  )

  const toggleAuto = useCallback(() => setAuto((v) => !v), [setAuto])
  const toggleLoaded = useCallback(() => setLoaded((v) => !v), [setLoaded])
  const toggleScatter = useCallback(() => setScatter((v) => !v), [setScatter])
  const toggleAllowOverlaps = useCallback(() => setAllowOverlaps((v) => !v), [setAllowOverlaps])
  const toggleSpreadSelectionMode = useCallback(
    () => setSpreadSelectionMode((current) => (current === 'within' ? 'across' : 'within')),
    [setSpreadSelectionMode]
  )

  const onUndo = useCallback(() => sendEvoClick(EVO_BUTTON_SELECTORS.undo, 'undo'), [sendEvoClick])
  const onRebet = useCallback(() => sendEvoClick(EVO_BUTTON_SELECTORS.rebet, 'rebet'), [sendEvoClick])
  const onBetMultiply = useCallback(() => setBetMultiplier((v) => (v % 3) + 1), [setBetMultiplier])
  // const onTables = useCallback(() => sendEvoClick('[data-role="plus-table-button"]', 'tables'), [sendEvoClick])
  // border border-white/12 bg-[linear-gradient(180deg,rgba(8,15,29,0.96),rgba(11,19,35,0.92))]
  return (
    <section
      className={cn(
        'overflow-hidden rounded-s-lg text-white pl-2',
        'bg-[radial-gradient(circle,rgba(239,68,68,0.28),transparent_68%)]'
      )}>
      <RouletteControls
        fmtAmt={fmtAmt}
        winVerb={winVerb}
        lastWinProfit={lastWinProfit}
        signalFound={signalFound}
        isTracking={isTracking}
        auto={auto}
        toggleAuto={toggleAuto}
        scatter={scatter}
        toggleScatter={toggleScatter}
        allowOverlaps={allowOverlaps}
        toggleAllowOverlaps={toggleAllowOverlaps}
        spreadSelectionMode={spreadSelectionMode}
        toggleSpreadSelectionMode={toggleSpreadSelectionMode}
        loaded={loaded}
        toggleLoaded={toggleLoaded}
        toggleTracking={handleTrackingToggle}
        betStatus={betStatus}
      />

      <div className='grid gap-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]'>
        <div className='bg-[linear-gradient(180deg,rgba(255,255,255,0.01),rgba(255,255,255,0)),linear-gradient(180deg,rgba(31,35,41,0.96),rgba(12,14,19,0.9))]'>
          <RouletteGrid
            selectedChip={selectedChip}
            placeEvolutionBets={placeEvolutionBets}
            zeroStake={nextBet.zeroStake}
            latestWinningNumber={latestWinningNumber}
            roundMultiplier={roundMultiplier}
            round={nextBet.round}
            placementMap={placementMap}
            getESM={getEffectiveStakeMultiplier}
            unitStake={nextBet.unitStake}
            baseUnit={baseUnit}
            hotNumbers={hotNumbers}
            selectedStartingQuadrantNumbers={selectedStartingQuadrantNumbers}
            hoveredQuadrantNumbers={hoveredQuadrantNumbers}
            hotRankMap={hotRankMap}
            startingQuadrant={startingQuadrant}
            setStartingQuadrant={setStartingQuadrant}
            setHoveredQuadrant={setHoveredQuadrant}
          />

          <div className='relative mt-2'>
            {/*Hover a quadrant corner pocket to preview all four numbers, or click it to set the starting quadrant.*/}
            {!isTracking && autoStartingQuadrant ? (
              <span className='absolute top-0 left-4 block text-slate-400 text-xs italic'>
                Auto idle start: {formatQuadrantLabel(autoStartingQuadrant)} from the latest shared pair.
              </span>
            ) : null}
          </div>

          <div className='mt-2'>
            <ChipStack
              isTracking={isTracking}
              chipsDetected={evolutionChips}
              onChipSelect={onChipSelect}
              onUndo={onUndo}
              onRebet={evolutionRebetVisible ? onRebet : undefined}
              onBetMultiply={onBetMultiply}
              betMultiplier={betMultiplier}
              tableState={evolutionTableState}
            />
          </div>

          {/* Placed bets log — one scrollable row per session, grouped by round */}
          <div className='mt-1 min-h-4 px-1'>
            {placedLog.some((nums) => nums.length > 0) && (
              <div className='flex items-center gap-x-px overflow-x-auto scrollbar-none py-0.5'>
                {(() => {
                  const roundBgs = [
                    'bg-yellow-50 text-neutral-950',
                    'bg-emerald-200 text-neutral-950',
                    'bg-blue-200 text-neutral-950',
                    'bg-indigo-300 text-neutral-950',
                    'bg-fuchsia-300 text-neutral-950'
                  ]
                  const seenDisplay = new Set<number>()
                  return placedLog.map((nums, idx) => {
                    const displayNums = nums.filter((n) => !seenDisplay.has(n))
                    nums.forEach((n) => seenDisplay.add(n))
                    if (displayNums.length === 0) return null
                    const step = simulation.steps[idx]
                    const isWin =
                      step != null && placedNumbersPerTrackedStep[idx]?.includes(step.landedNumber)
                    return (
                      <Fragment key={idx}>
                        {idx > 0 && <span className='shrink-0 text-slate-400 text-[0.55rem] font-thin'>│</span>}
                        {displayNums.map((n) => (
                          <span
                            key={`${idx}-${n}`}
                            className={cn(
                              'shrink-0 tabular-nums text-[0.69rem] leading-none rounded-xs flex items-center justify-center w-5 h-4 font-okx font-semibold',
                              roundBgs[idx],
                              winningNumbers.slice().reverse()[0] === n && isWin
                                ? 'bg-neutral-900 font-bold text-emerald-500 text-lg -tracking-widest px-0.5'
                                : n === 0
                                  ? 'bg-emerald-950/60 border-emerald-700/40 text-emerald-300'
                                  : 'text-neutral-950'
                            )}>
                            {n}
                          </span>
                        ))}
                      </Fragment>
                    )
                  })
                })()}
              </div>
            )}
          </div>

          <RouletteStats
            spins={winningNumbers.length}
            steps={simulation.steps.length}
            round={nextBet.round}
            winStreak={winStreak}
            accWinnings={accWinnings}
            setInputMode={setInputMode}
            inputMode={inputMode}
            baseUnit={baseUnit}
            baseUnitInput={baseUnitInput}
            setBaseUnitInput={setBaseUnitInput}
            totalStaked={totalStaked}
            nextBet={nextBet.unitStake}
            winAmount={winAmount}
            lastWinProfit={lastWinProfit}
            coverage={nextBet.coverageCount}
            coveragePercent={nextBet.coveragePercent}
            accPct={accPct}
          />
        </div>
      </div>
    </section>
  )
}

/*
<div className='mt-3 flex flex-wrap gap-2 text-[0.66rem] uppercase tracking-[0.16em] text-slate-300'>
            <StepTone value='Emerald ring = next active bet' />
            <StepTone value='Amber outline = latest winning number' />
            <StepTone value='badge = effective unit multiple' />
            <StepTone
              value={
                allowOverlaps ? 'overlap mode = stacked straight-ups allowed' : 'spread guard = no stacked overlaps'
              }
            />
            {!allowOverlaps && nextBet.spreadQuadrants.length > 0 ? (
              <StepTone value={`spread applied on ${nextBet.spreadQuadrants.map(formatQuadrantLabel).join(' + ')}`} />
            ) : null}
            {nextBet.zeroStake > 0 ? <StepTone value='Zero hedge armed' /> : null}
          </div>

          <div className='mt-3 space-y-2'>
                        {recentSteps.length > 0 ? (
                          recentSteps.map((step) => (
                            <div
                              key={`sim-step-${step.spinIndex}`}
                              className='rounded-2xl border border-white/8 bg-slate-950/45 px-3 py-2.5 text-sm text-slate-200'>
                              <div className='flex items-center justify-between gap-3'>
                                <div className='font-semibold text-white'>
                                  Spin {step.spinIndex} · {step.landedNumber}
                                </div>
                                <div className='text-xs uppercase tracking-[0.16em] text-slate-400'>
                                  R{step.bet.round} · {formatQuadrantLabel(step.bet.quadrant)}
                                </div>
                              </div>
                              <div className='mt-1 text-xs text-slate-400'>
                                Bet {step.bet.coverageCount} placements for {step.bet.totalStake} total · {step.hitType} ·{' '}
                                {formatSessionOutcome(step.sessionOutcome)}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className='rounded-2xl border border-dashed border-white/12 bg-slate-950/35 px-3 py-6 text-center text-sm text-slate-400'>
                            {isTracking
                              ? 'Waiting for the first winning number after the simulator was armed.'
                              : 'Simulation paused. Live roulette results continue to log outside the replay session.'}
                          </div>
                        )}
                      </div>
*/
