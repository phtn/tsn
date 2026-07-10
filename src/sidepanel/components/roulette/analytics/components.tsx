import { cn } from '@/src/lib/utils'
import { FC } from 'react'
import { PercentageBarProps, StatCardProps } from './types'

const STAT_VALUE_CLASS_NAME: Record<NonNullable<StatCardProps['color']>, string> = {
  emerald: 'bg-linear-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent',
  neutral: 'bg-linear-to-r from-neutral-200 to-neutral-200 bg-clip-text text-transparent',
  rose: 'text-rose-200',
  gold: 'bg-linear-to-r from-yellow-300 to-yellow-200 bg-clip-text text-transparent',
  sky: 'bg-linear-to-r from-sky-500 to-sky-500 bg-clip-text text-transparent'
}

export const StatCard: FC<StatCardProps> = ({ title, value, trend, color = 'emerald', extra }) => (
  <div
    className={cn(
      'rounded-xs border-[0.33px] border-white/15 bg-white/8 backdrop-blur-md px-3.5 pt-2 pb-0.5 space-y-1'
    )}>
    <div className='flex items-center justify-between'>
      <span className='text-[9px] font-sans text-neutral-300 uppercase tracking-widest'>{title}</span>
      {extra}
    </div>
    <div className='flex items-end w-full'>
      <div className={cn('font-sans font-medium text-xl w-full', STAT_VALUE_CLASS_NAME[color])}>{value}</div>
      {trend && (
        <span
          className={` ${trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-rose-400' : 'text-neutral-400'}`}>
          {trend === 'up' ? (
            <span className='size-4'>up</span>
          ) : trend === 'down' ? (
            <span className='size-4'>down</span>
          ) : // <TrendingDown size={16} />
          null}
        </span>
      )}
    </div>
  </div>
)

export const VPctBar: FC<PercentageBarProps & { cols?: string }> = ({ label, percentage, color, count, cols }) => (
  <div className={cn('group', cols)}>
    <div className={cn('relative h-10 bg-neutral-700 rounded-t-sm overflow-hidden flex items-end')}>
      <div
        className={`w-full ${color} rounded-xs rounded-b-none transition-all duration-700 ease-out group-hover:shadow-lg`}
        style={{ height: `${Math.min(percentage, 100) + 0.66}%` }}
      />

      <span className='absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 text-sm font-semibold text-neutral-200'>
        {percentage.toFixed(1)}%
      </span>
    </div>
    <div className='flex items-center justify-center space-x-2 mt-1.5'>
      <span className='text-xs text-neutral-300'>{label}</span>
      <span className='text-xs text-neutral-500'>{count}</span>
    </div>
  </div>
)
