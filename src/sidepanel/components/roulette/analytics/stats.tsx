import { cn } from '@/src/lib/utils'
import { Stats } from '../types'
import { StatCard, VPctBar } from './components'
import { NumberBadge } from './not-used'
import { HotAndColdNumbersProps } from './types'

export const StatsOverview = ({ stats }: { stats: Stats }) => (
  <div className='grid grid-cols-4 gap-1'>
    <StatCard
      title='EVEN'
      value={`${stats.oddEven.even.pct.toFixed(1)}%`}
      subtitle={`${stats.oddEven.even.count}`}
      color='neutral'
    />
    <StatCard
      title='RED'
      value={`${stats.colors.red.pct.toFixed(1)}%`}
      subtitle={`${stats.colors.red.count}`}
      color='rose'
    />
    <StatCard
      title='BLACK'
      value={`${stats.colors.black.pct.toFixed(1)}%`}
      subtitle={`${stats.colors.black.count}`}
      color='neutral'
    />
    <StatCard
      title='ODD'
      value={`${stats.oddEven.odd.pct.toFixed(1)}%`}
      subtitle={`${stats.oddEven.odd.count}`}
      color='neutral'
    />
  </div>
)

export const HotAndColdNumbers = ({ hotNumbers, coldNumbers }: HotAndColdNumbersProps) => (
  <div className={cn('grid grid-cols-2 gap-1 px-1 py-2 bg-neutral-950 mt-4')}>
    <div className={cn('')}>
      <div className='flex flex-wrap gap-1.5'>
        <div className='p-0.5 h-4'>
          <span className='font-display font-semibold text-orange-300 text-sm uppercase'>Hot</span>
        </div>
        {hotNumbers.length > 0 ? (
          hotNumbers.map(([num, count]) => <NumberBadge key={num} number={num} count={count} isHot={true} />)
        ) : (
          <p className='text-neutral-500 text-sm'>Awaiting data...</p>
        )}
      </div>
    </div>

    <div className={cn('')}>
      <div className='flex flex-wrap gap-1.5 justify-end'>
        <div className='p-0.5 h-4'>
          <span className='font-display font-semibold text-cyan-400 text-sm uppercase'>Cold</span>
        </div>
        {coldNumbers.length > 0 ? (
          coldNumbers.map(([num, count]) => <NumberBadge key={num} number={num} count={count} isHot={false} />)
        ) : (
          <p className='text-neutral-500 text-sm'>No data yet</p>
        )}
      </div>
    </div>
  </div>
)

export const VPctOverview = ({ stats }: { stats: Stats }) => (
  <div className='grid grid-cols-11 gap-1'>
    <VPctBar
      label='ZERO'
      percentage={stats.zero.pct}
      color='bg-linear-to-b from-emerald-500 to-emerald-600'
      count={stats.zero.count}
      cols='col-span-2'
    />
    <VPctBar
      label='1 - 12'
      percentage={stats.dozens[0].pct}
      color='bg-linear-to-b from-cyan-300/50 to-cyan-500'
      count={stats.dozens[0].count}
      cols='col-span-3'
    />
    <VPctBar
      label='13 - 24'
      percentage={stats.dozens[1].pct}
      color='bg-linear-to-b from-sky-300/50 to-sky-500'
      count={stats.dozens[1].count}
      cols='col-span-3'
    />
    <VPctBar
      label='25 - 36'
      percentage={stats.dozens[2].pct}
      color='bg-linear-to-b from-blue-300/50 to-blue-500'
      count={stats.dozens[2].count}
      cols='col-span-3'
    />
  </div>
)
