import {
  BOARD_ROWS,
  getKimQuadrantsContainingNumber,
  KimQuadrantId,
  KIMS_ALGO_QUADRANTS,
  resolveKimQuadrantPreference
} from '@/src/lib/roulette'
import { getNumberTone, getQuadTone } from '@/src/lib/roulette/utils'
import { cn } from '@/src/lib/utils'
import { Dispatch, SetStateAction } from 'react'

interface RouletteGridProps {
  selectedChip: number | null
  placeEvolutionBets: (numbers: number[]) => void
  zeroStake: number
  latestWinningNumber: number
  roundMultiplier: number
  round: number
  placementMap: Map<number, number>
  getESM: (unitStake: number, baseUnit: number, placementCount: number) => number
  unitStake: number
  baseUnit: number
  hotNumbers: number[]
  selectedStartingQuadrantNumbers: Set<number>
  hoveredQuadrantNumbers: Set<number>
  hotRankMap: Map<number, number>
  startingQuadrant: KimQuadrantId
  setStartingQuadrant: Dispatch<SetStateAction<KimQuadrantId>>
  setHoveredQuadrant: Dispatch<SetStateAction<KimQuadrantId | null>>
}

export const RouletteGrid = ({
  selectedChip,
  placeEvolutionBets,
  zeroStake,
  latestWinningNumber,
  roundMultiplier,
  round,
  placementMap,
  getESM,
  unitStake,
  baseUnit,
  hotNumbers,
  selectedStartingQuadrantNumbers,
  hoveredQuadrantNumbers,
  hotRankMap,
  startingQuadrant,
  setStartingQuadrant,
  setHoveredQuadrant
}: RouletteGridProps) => {
  return (
    <div className='mt-4 grid grid-cols-[28px_1fr] rounded-s-lg rounded-e-sm gap-1 bg-white/40'>
      <button
        type='button'
        disabled={!selectedChip}
        title='Place zero bet on Evolution'
        onClick={() => placeEvolutionBets([0])}
        className={cn(
          'relative flex items-center justify-center rounded-s-sm rounded-e-xs border font-semibold transition-all disabled:cursor-default',
          getNumberTone(0),
          selectedChip && 'cursor-pointer hover:border-white',
          zeroStake > 0 && 'ring-2 ring-emerald-300/75 ring-offset-2 ring-offset-slate-950',
          latestWinningNumber === 0 && 'border-amber-300 shadow-[0_0_0_1px_rgba(252,211,77,0.55)]'
        )}>
        <span className='font-semibold text-lg drop-shadow-xs'>0</span>
        {zeroStake > 0 ? (
          <>
            <span className='absolute bottom-1 rounded-full bg-emerald-300 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-[0.14em] text-slate-950'>
              Z
            </span>
            {roundMultiplier > 1 ? (
              <span className='absolute -right-1.5 -top-1.5 rounded-full bg-amber-300 px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-[0.12em] text-slate-950'>
                {roundMultiplier}
              </span>
            ) : null}
          </>
        ) : null}
      </button>

      <div className='space-y-0.75 py-1'>
        {BOARD_ROWS.map((row) => (
          <div key={row.join('-')} className='grid grid-cols-12 w-fit'>
            {row.map((value) => {
              const placementCount = placementMap.get(value) ?? 0
              const effectiveMultiplier = getESM(unitStake, baseUnit, placementCount)
              const isActive = placementCount > 0
              const isLatest = latestWinningNumber === value
              const interactiveQuadrant = resolveKimQuadrantPreference(
                getKimQuadrantsContainingNumber(value),
                hotNumbers,
                startingQuadrant
              )
              const isStartingQuadrantTrigger = interactiveQuadrant !== null
              const isSelectedStartingQuadrant = selectedStartingQuadrantNumbers.has(value)
              const isHoveredQuadrantMember = hoveredQuadrantNumbers.has(value)

              const hotRank = hotRankMap.get(value)

              return (
                <button
                  key={value}
                  type='button'
                  onClick={() => {
                    if (interactiveQuadrant) {
                      setStartingQuadrant(interactiveQuadrant)
                      if (selectedChip) {
                        placeEvolutionBets([...KIMS_ALGO_QUADRANTS[interactiveQuadrant]])
                      }
                    }
                  }}
                  onMouseEnter={() => {
                    if (interactiveQuadrant) {
                      setHoveredQuadrant(interactiveQuadrant)
                    }
                  }}
                  onMouseLeave={() => setHoveredQuadrant(null)}
                  onFocus={() => {
                    if (interactiveQuadrant) {
                      setHoveredQuadrant(interactiveQuadrant)
                    }
                  }}
                  onBlur={() => setHoveredQuadrant(null)}
                  disabled={!interactiveQuadrant}
                  title={
                    interactiveQuadrant ? `${formatQuadrantLabel(interactiveQuadrant)} · set start quadrant` : undefined
                  }
                  className={cn(
                    'mr-0.75 relative h-8.5 w-10.5 flex items-center justify-center aspect-square rounded-none border disabled:cursor-default',
                    getNumberTone(value),
                    getQuadTone(value, isHoveredQuadrantMember, isActive),
                    isActive &&
                      'ring-2 ring-emerald-400 border-emerald-400 ring-offset-0 ring-offset-lime-emerald rounded-none',
                    isActive && hotRank && round >= 4 && 'animate-pulse',
                    isLatest && 'border-amber-300 shadow-[0_0_0_1px_rgba(252,211,77,0.55)]',
                    isHoveredQuadrantMember && 'ring-2 ring-white ring-offset-0 ring-offset-slate-950',
                    isStartingQuadrantTrigger && 'cursor-pointer',
                    isSelectedStartingQuadrant && 'border-emerald-400',
                    'transition-all duration-200 ease-in-out'
                  )}>
                  <span className='font-sans font-semibold text-lg drop-shadow-xs'>{value}</span>
                  {isActive && effectiveMultiplier > 1 ? (
                    <span
                      className={cn(
                        'absolute -right-1 -top-1 z-9999 rounded-xs bg-blue-200 size-3.5 text-center text-[7px] font-bold uppercase -tracking-widest text-slate-950',
                        {
                          'bg-indigo-400 text-white': effectiveMultiplier === 4,
                          'bg-fuchsia-300': effectiveMultiplier === 8
                        }
                      )}>
                      <span className='scale-75'>{effectiveMultiplier}</span>
                    </span>
                  ) : null}
                  {hotRank ? (
                    <span
                      className={cn(
                        'absolute -bottom-px -left-px flex h-3 w-3 items-center justify-center rounded-xs rounded-bl-xs text-[7px] font-bold shadow-sm',
                        hotRank === 1 && 'bg-amber-400 text-amber-900',
                        hotRank === 2 && 'bg-zinc-300 text-zinc-700',
                        hotRank === 3 && 'bg-orange-600 text-orange-100',
                        hotRank === 4 && 'bg-violet-500 text-white'
                      )}>
                      {hotRank}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function formatQuadrantLabel(quadrant: KimQuadrantId): string {
  return quadrant.toUpperCase()
}
