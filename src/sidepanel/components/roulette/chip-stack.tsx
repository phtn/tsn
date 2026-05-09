'use client'

import { Icon } from '@/src/lib/icons'
import { cn } from '@/src/lib/utils'
import { TableState } from '@/src/types/roulette'
import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'

interface Chip extends ChipProps {
  id: string
}

// Evolution data-role selectors for the flanking action buttons.
// Inspect the actual DOM if any of these need to be adjusted.
export const EVO_BUTTON_SELECTORS = {
  undo: '[data-role="undo-last-bet-button"]',
  rebet: '[data-role="rebet-button"]',
  double: '[data-role="double-button"]'
} as const

interface ChipStackProps {
  chipsDetected: number[]
  onChipSelect: (value: number) => VoidFunction
  onUndo?: VoidFunction
  /** Only pass this when Evolution's rebet button is visible; omit to hide the button. */
  onRebet?: VoidFunction
  onBetMultiply?: VoidFunction
  betMultiplier?: number
  onTables?: VoidFunction
  tableState?: TableState | null
  isTracking?: boolean
}

export const ChipStack = ({
  chipsDetected,
  onChipSelect,
  onUndo,
  onRebet,
  onBetMultiply,
  betMultiplier,
  tableState,
  isTracking
}: ChipStackProps) => {
  const chips = useMemo(
    () =>
      [
        {
          id: 'n',
          value: 5,
          fill: 'fill-cn',
          stroke: 'stroke-cn',
          selected: true,
          size: 31,
          offset: { x: '36%', y: '57%' }
        },
        {
          id: '0',
          value: 10,
          fill: 'fill-c0',
          stroke: 'stroke-c0',
          selected: true,
          size: 31,
          offset: { x: '28%', y: '57%' }
        },
        {
          id: '1',
          value: 25,
          fill: 'fill-c1',
          stroke: 'stroke-c1',
          selected: true,
          size: 31,
          offset: { x: '26%', y: '57%' }
        },
        {
          id: '2',
          value: 50,
          fill: 'fill-c2',
          stroke: 'stroke-c2',
          selected: false,
          size: 30,
          offset: { x: '25%', y: '57%' }
        },
        { id: '3', value: 100, fill: 'fill-c3', stroke: 'stroke-c3', size: 28, offset: { x: '19.5%', y: '55%' } },
        { id: '4', value: 250, fill: 'fill-c4', stroke: 'stroke-c4', size: 26, offset: { x: '19%', y: '54%' } },
        { id: '5', value: 500, fill: 'fill-c5', stroke: 'stroke-c5', size: 25, offset: { x: '20%', y: '54%' } },
        { id: '6', value: 1000, fill: 'fill-c6', stroke: 'stroke-c6', size: 21, offset: { x: '20%', y: '52%' } },
        { id: '7', value: 1250, fill: 'fill-c5', stroke: 'stroke-c5', size: 22, offset: { x: '16%', y: '54%' } },
        { id: '8', value: 5000, fill: 'fill-c6', stroke: 'stroke-c6', size: 20, offset: { x: '16%', y: '52%' } }
      ].filter((chip) => chipsDetected.includes(chip.value)) as Array<Chip>,
    [chipsDetected]
  )

  const smap: Record<TableState, string> = {
    BETS_OPEN: 'OPEN',
    BETS_CLOSING_SOON: 'CLOSING',
    GAME_RESOLVED: 'RESOLVED',
    BETS_CLOSED_ANNOUNCED: 'CLOSED',
    BETS_CLOSED: 'CLOSED'
  }

  const upwardLabels = new Set(['OPEN', 'RESOLVED'])
  const label = tableState ? smap[tableState] : null
  const [displayedLabel, setDisplayedLabel] = useState<string | null>(label)

  useEffect(() => {
    if (label === displayedLabel) return
    const dir = label && upwardLabels.has(label) ? 'up' : 'down'
    document.documentElement.dataset.stateDir = dir
    if (!document.startViewTransition) {
      setDisplayedLabel(label)
      return
    }
    document.startViewTransition(() => {
      flushSync(() => setDisplayedLabel(label))
    })
  }, [label])

  return (
    <div className='' data-role='footer-perspective-chip-stack' data-is-collapsed='true'>
      <div className='' data-role='chip-stack-wrapper'>
        <div
          className='bg-orange-100/0 py-4 flex items-center justify-center space-x-10'
          data-role='expanded-chip-stack-wrapper'>
          <style>{`
            @keyframes state-slide-up-in    { from { opacity:0; transform:translateY(-20px);  } to { opacity:1; transform:translateY(0); } }
            @keyframes state-slide-down-out { from { opacity:1; transform:translateY(0);      } to { opacity:0; transform:translateY(10px); } }
            @keyframes state-slide-down-in  { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
            @keyframes state-slide-up-out   { from { opacity:1; transform:translateY(0);      } to { opacity:0; transform:translateY(-10px);  } }

            ::view-transition-old(table-state) { animation: state-slide-down-out 0.3s ease-in  both; }
            ::view-transition-new(table-state) { animation: state-slide-up-in    0.3s ease-out both; }
            :root[data-state-dir="down"] ::view-transition-old(table-state) { animation: state-slide-up-out  0.3s ease-in  both; }
            :root[data-state-dir="down"] ::view-transition-new(table-state) { animation: state-slide-down-in 0.3s ease-out both; }
          `}</style>
          <div className='flex items-center justify-center w-20 h-12 overflow-hidden'>
            <p
              id='table-state'
              style={{ viewTransitionName: 'table-state' }}
              className={cn(
                'font-display font-semibold text-sm text-center uppercase py-0.5 drop-shadow-xs',
                {
                  'text-emerald-400': displayedLabel === 'OPEN',
                  'text-orange-300 animate-pulse': displayedLabel === 'CLOSING',
                  'text-red-400': displayedLabel === 'CLOSED',
                  'text-slate-300': displayedLabel === 'RESOLVED'
                },
                !displayedLabel && 'opacity-0'
              )}>
              {displayedLabel ?? '—'}
            </p>
          </div>
          {/*<button className='flex space-x-2' onClick={onUndo} title='Undo last bet'>
            <Icon name='undo' className='size-4 opacity-50' />
          </button>*/}

          <div data-role='chip-stack' className='flex space-x-2'>
            {chips.map((chip) => (
              <Chip key={chip.id} {...chip} onClick={onChipSelect(chip.value)} />
            ))}
          </div>

          {onRebet && (
            <button
              className='flex items-center space-x-2 text-xs font-semibold uppercase tracking-wide opacity-70 hover:opacity-100 transition-opacity'
              onClick={onRebet}
              title='Rebet'>
              <Icon name='rebet' className='size-6' />
            </button>
          )}

          <button
            id='multiply-bets'
            className='flex items-center'
            disabled={isTracking}
            onClick={onBetMultiply}
            title='Multiply Bets'>
            <span
              className={cn(`flex items-center justify-center size-8 bg-no-repeat object-contain`)}
              style={{
                backgroundImage: 'url(./icons/gem-silver.svg)',
                backgroundColor: 'transparent'
              }}>
              <span className='font-okx font-bold text-orange-600 text-lg tracking-tighter'>{betMultiplier}</span>
            </span>
          </button>

          {/*<button
            className='flex items-center text-[0.6rem] font-semibold uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity'
            onClick={onTables}
            title='Browse tables'>
            <span>Tables</span>
          </button>*/}
        </div>
      </div>
    </div>
  )
}

interface ChipProps {
  onClick: VoidFunction
  value: number
  fill?: string
  stroke?: string
  selected?: boolean
  size?: number
  offset?: {
    x?: string
    y?: string
  }
}
const Chip = ({ value, fill, stroke, selected, size, offset, onClick }: ChipProps) => {
  return (
    <div
      onClick={onClick}
      className='chipItem cursor-pointer active:scale-80 transition-transform duration-300 ease-in-out'
      data-role={selected ? 'selected-chip' : 'chip'}>
      <div className='chip' data-role='chip' data-value={value}>
        <svg viewBox='0 0 78 78' className='h-9 aspect-square' data-role='default-svg'>
          <g>
            <circle className={cn(fill, stroke)} cx='39.019' cy='38.999' r='38.5' />
            <path
              className='stroke-white stroke-0.25'
              d='M38.94 12.5A26.5 26.5 0 1 0 65.44 39a26.529 26.529 0 0 0-26.5-26.5zm0 52A25.5 25.5 0 1 1 64.439 39 25.53 25.53 0 0 1 38.94 64.5z'></path>
            <circle className={cn(fill, 'opacity-90')} cx='39' cy='38.997' r='25.5'></circle>
            <path
              className='fill-white/90 stroke-0.5'
              d='M38.941 0a39 39 0 1 0 39 39 39.046 39.046 0 0 0-39-39zm-2.088 76.439l.483-8.471a28.99 28.99 0 0 1-4.668-.639l-1.783 8.291a37.277 37.277 0 0 1-12.144-5.051l4.6-7.124a29.143 29.143 0 0 1-8.85-8.851l-7.124 4.6a37.28 37.28 0 0 1-5.045-12.13l8.3-1.784a28.99 28.99 0 0 1-.639-4.668l-8.483.482C1.463 40.4 1.44 39.7 1.44 39s.023-1.391.061-2.08l8.478.483a28.99 28.99 0 0 1 .639-4.668l-8.3-1.785a37.275 37.275 0 0 1 5.047-12.142l7.126 4.6a29.143 29.143 0 0 1 8.85-8.851l-4.6-7.125a37.28 37.28 0 0 1 12.142-5.05l1.786 8.3a28.99 28.99 0 0 1 4.668-.639l-.483-8.484c.692-.038 1.388-.061 2.089-.061s1.4.023 2.087.061l-.483 8.484a28.99 28.99 0 0 1 4.668.639L47 2.381a37.276 37.276 0 0 1 12.14 5.05l-4.6 7.126a29.14 29.14 0 0 1 8.849 8.85l7.127-4.6a37.276 37.276 0 0 1 5.044 12.142l-8.3 1.785a28.99 28.99 0 0 1 .64 4.666l8.478-.483c.038.689.061 1.382.061 2.08s-.023 1.4-.062 2.1l-8.477-.486a28.99 28.99 0 0 1-.639 4.668l8.3 1.784a37.282 37.282 0 0 1-5.046 12.132l-7.125-4.6a29.14 29.14 0 0 1-8.849 8.85l4.6 7.125A37.275 37.275 0 0 1 47 75.619l-1.783-8.291a28.99 28.99 0 0 1-4.668.639l.483 8.471c-.691.038-1.386.061-2.087.061s-1.401-.022-2.092-.06z'></path>
          </g>
          <text
            className='fill-white stroke-white font-clash font-semibold tracking-tight opacity-100 drop-shadow-xs drop-shadow-gray-700'
            x={offset?.x ?? '25%'}
            y={offset?.y ?? '58%'}
            fontSize={size ?? 34}
            dy='5'
            data-role='chip-value'>
            {value}
          </text>
        </svg>
      </div>
    </div>
  )
}
