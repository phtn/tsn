import { RED_NUMBERS } from '@/src/lib/roulette'
import { tmap } from '@/src/lib/roulette/evolution-tables'
import { cn } from '@/src/lib/utils'
import { FC } from 'react'
import { LobbyNumber } from './history'
import { NumberBadgeProps, PercentageBarProps } from './types'

export const NumberBadge: FC<NumberBadgeProps> = ({ number, count, isHot = true, showCount = true }) => {
  const getColor = (num: number) => {
    if (num === 0) return 'bg-linear-to-br from-emerald-500 to-emerald-600'
    if (RED_NUMBERS.includes(num)) return 'bg-linear-to-br from-[#B51B13] to-rose-600/80'
    return 'bg-linear-to-br from-neutral-600 to-neutral-700'
  }

  return (
    <div className='relative group'>
      <div
        className={`w-7 h-5.5 ${getColor(number)} rounded-xs flex items-center justify-center font-semibold text-white hover:scale-110 hover:shadow-lg ${isHot ? 'hover:shadow-rose-500/20' : 'hover:shadow-cyan-500/20'}`}>
        <span className='font-semibold text-base'>{number}</span>
      </div>
      {showCount && (
        <div
          className={`absolute -top-1.5 -right-0.5 w-3.5 h-3 rounded-xs flex items-center justify-center text-[8px] font-medium text-white ${isHot ? 'bg-orange-200/20' : 'bg-cyan-100/20'} backdrop-blur-3xl`}>
          {count}
        </div>
      )}
    </div>
  )
}

const PercentageBar: FC<PercentageBarProps> = ({ label, percentage, color, count }) => (
  <div className='group'>
    <div className='flex justify-between items-center mb-1.5'>
      <span className='text-xs text-neutral-300'>{label}</span>
      <div className='flex items-center gap-2'>
        <span className='text-xs text-neutral-500'>({count})</span>
        <span className='text-sm font-semibold text-neutral-200'>{percentage.toFixed(1)}%</span>
      </div>
    </div>
    <div className='h-2 bg-neutral-700/50 rounded-full overflow-hidden'>
      <div
        className={`h-full ${color} rounded-full transition-all duration-700 ease-out group-hover:shadow-lg`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
      />
    </div>
  </div>
)

interface LobbyHistoriesProps {
  data: { tableId: string; numbers: number[] }[]
}

const LobbyHistories = ({ data }: LobbyHistoriesProps) => (
  <div className={cn('rounded-sm p-3 space-y-1 bg-neutral-900')}>
    {data.map(({ tableId, numbers }) => (
      <div key={tableId} className='flex items-center gap-3'>
        <span className='text-xs uppercase text-neutral-200 min-w-48 shrink-0 truncate' title={tableId}>
          {
            tmap[
              `${tableId
                .replace(/0+$/, '')
                .replace(/^[A-Z][a-z]+/, '')
                .toLowerCase()}` as keyof typeof tmap
            ]
          }
        </span>
        <div className='flex gap-0.5 bg-white/40 p-0.5 rounded-xs'>
          {numbers.slice(0, 11).map((n, i) => (
            <LobbyNumber key={i} number={n} />
          ))}
        </div>
      </div>
    ))}
  </div>
)

const MostRecentNumbers = ({
  numbers,
  highlightedIndexes,
  leadingSignalIndexes,
  winningIndexes,
  losingIndexes
}: {
  numbers: number[]
  highlightedIndexes: ReadonlySet<number>
  leadingSignalIndexes: ReadonlySet<number>
  winningIndexes: ReadonlySet<number>
  losingIndexes: ReadonlySet<number>
}) => {
  const displayedNumbers = numbers.slice(0, 13)

  return (
    <div className={cn('rounded-sm p-2 space-y-2 bg-neutral-900')}>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <h2 className='font-okx font-medium text-neutral-200 text-xs uppercase'>Recents</h2>
        </div>
        <p className='font-okx text-neutral-300 text-xs'>{displayedNumbers.length}</p>
      </div>
      <div className='flex max-h-60 flex-wrap gap-0.75 overflow-y-auto pr-1'>
        {displayedNumbers.map((number, index) => (
          <LobbyNumber
            key={`${number}-${index}`}
            highlighted={highlightedIndexes.has(index)}
            leadingSignal={leadingSignalIndexes.has(index)}
            winning={winningIndexes.has(index)}
            losing={losingIndexes.has(index)}
            number={number}
          />
        ))}
      </div>
    </div>
  )
}
