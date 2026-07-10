import { RED_NUMBERS } from '@/src/lib/roulette'
import { cn } from '@/src/lib/utils'
import { FC, useEffect, useState } from 'react'
import { StatCard } from './components'
import { SignalOverviewProps } from './types'

export const LobbyNumber: FC<{
  number: number
  highlighted?: boolean
  leadingSignal?: boolean
  winning?: boolean
  losing?: boolean
}> = ({ number, highlighted = false, leadingSignal = false, winning = false, losing = false }) => {
  const color =
    winning && leadingSignal
      ? 'bg-pink-400 text-white'
      : winning
        ? 'bg-yellow-300 text-neutral-900'
        : losing
          ? 'bg-red-500 text-white'
          : leadingSignal
            ? 'bg-pink-400 text-white'
            : highlighted
              ? 'bg-sky-600 text-white'
              : number === 0
                ? 'bg-emerald-700 text-white'
                : RED_NUMBERS.includes(number)
                  ? 'bg-neutral-100 text-red-600'
                  : 'bg-slate-500 text-white'
  return (
    <span
      className={`${color} w-9.5 min-h-6 max-h-6 rounded-none flex items-center justify-center font-display font-semibold text-[13px]`}>
      {number}
    </span>
  )
}

function formatElapsedTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} second${seconds === 1 ? '' : 's'} ago`
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  }

  const hours = Math.floor(minutes / 60)
  return `${hours} hour${hours === 1 ? '' : 's'} ago`
}

export const HistoryNumbers: FC<{
  recents: number[]
  numbers: number[]
  highlightedIndexes: ReadonlySet<number>
  leadingSignalIndexes: ReadonlySet<number>
  winningIndexes: ReadonlySet<number>
  losingIndexes: ReadonlySet<number>
  indexOffset?: number
}> = ({
  recents,
  numbers,
  highlightedIndexes,
  leadingSignalIndexes,
  winningIndexes,
  losingIndexes,
  indexOffset = 0
}) => {
  const numbersSignature = `${recents.join(',')}::${numbers.join(',')}`
  const [lastUpdatedAt, setLastUpdatedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setLastUpdatedAt(Date.now())
  }, [numbersSignature])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const elapsedSeconds = Math.max(0, Math.floor((now - lastUpdatedAt) / 1000))

  return (
    <div className={cn('rounded-sm p-2 space-y-3 bg-neutral-950')}>
      <div className='flex items-center justify-between h-8'>
        <div>
          <p className='flex items-center space-x-2 font-sans font-medium text-neutral-100 text-xs uppercase'>
            <span className='font-sans'>Hist</span>
            <span>&middot;</span>
            <span className='opacity-70 font-sans font-light'>{recents.length + numbers.length}</span>
          </p>
        </div>
        <div className='px-3'>
          <p id='last-update' className='font-sans text-xs text-neutral-300 lowercase italic'>
            {formatElapsedTime(elapsedSeconds)}
          </p>
        </div>
      </div>
      <div className='flex h-37 flex-wrap gap-[1.5px] overflow-y-auto bg-slate-700'>
        {numbers.map((number, index) => {
          const displayIndex = index + indexOffset
          return (
            <LobbyNumber
              key={`history-${number}-${index}`}
              highlighted={highlightedIndexes.has(displayIndex)}
              leadingSignal={leadingSignalIndexes.has(displayIndex)}
              winning={winningIndexes.has(displayIndex)}
              losing={losingIndexes.has(displayIndex)}
              number={number}
            />
          )
        })}
      </div>
    </div>
  )
}
export const SignalOverview = ({ total, summary }: SignalOverviewProps) => {
  const resolvedSignals = summary.wins + summary.losses
  const pendingSignals = Math.max(0, summary.signalsFound - resolvedSignals)
  const winPct = resolvedSignals > 0 ? (summary.wins / resolvedSignals) * 100 : 0
  const lossPct = resolvedSignals > 0 ? (summary.losses / resolvedSignals) * 100 : 0

  return (
    <div className={cn('rounded-sm space-y-3 p-2 bg-neutral-950')}>
      <div className='flex items-center justify-between h-8'>
        <div>
          <p className='flex items-center space-x-2 font-sans font-medium text-neutral-100 text-xs uppercase'>
            <span>Stat</span>
            <span>&middot;</span>
            <span className='opacity-70 font-light'>{total}</span>
          </p>
        </div>
        <div className='px-3'>
          <p className='flex items-center space-x-4 font-sans font-medium text-neutral-100 text-xs uppercase mt-1'>
            <span className='space-x-2'>
              <span className='font-sans italic'>Zero</span>
              <span className='font-sans opacity-50'>=</span>
              <span className='font-sans font-semibold text-base'>{summary.zeroLosses}</span>
            </span>
            <span>&middot;</span>
            <span className='space-x-2'>
              <span className='font-sans italic'>Swipe-outs</span>
              <span className='font-sans opacity-50'>=</span>
              <span className='font-sans font-semibold text-base'>{summary.losses - summary.zeroLosses}</span>
            </span>
          </p>
        </div>
      </div>
      <div className='grid grid-cols-4 gap-1 w-full text-xs'>
        <StatCard
          title='Signals'
          value={
            <div className='flex items-end justify-between w-full'>
              <span className='font-sans text-base text-sky-400'>{summary.signalsFound}</span>
              <span className='font-sans font-light text-xl text-slate-200'>{pendingSignals ? 'S' : 'I'}</span>
            </div>
          }
          color='sky'
        />
        <StatCard
          title='Wins'
          value={
            <div className='flex items-end justify-between w-full'>
              <span className='font-sans text-base'>{summary.wins}</span>
              <span
                className={cn('font-sans font-medium text-xl text-rose-400', {
                  'text-rose-400': winPct <= 89,
                  'text-orange-400': winPct <= 85,
                  'text-sky-400': winPct <= 80,
                  'text-green-400': winPct <= 75,
                  'text-emerald-400': winPct <= 65
                })}>
                {winPct.toFixed(0)}
                <span className='font-sans font-medium text-xs italic'>%</span>
              </span>
            </div>
          }
          color='gold'
        />
        <StatCard
          title='Losses'
          value={
            <div className='flex items-end justify-between w-full'>
              <span className='font-sans text-base'>{summary.losses}</span>
              <span className='font-sans font-medium text-xl text-neutral-100'>
                {lossPct.toFixed(0)}
                <span className='font-sans font-medium text-xs italic'>%</span>
              </span>
            </div>
          }
          color='rose'
        />
        <StatCard
          title='Best Streak'
          value={<span className='font-sans font-medium text-base'>{summary.bestWinStreak}</span>}
          color='neutral'
        />
      </div>
      <div className='flex flex-wrap gap-1'>
        {summary.series.slice(0, 39).map((outcome, index) => (
          <span
            key={`${outcome}-${index}`}
            className={cn(
              'inline-flex h-6 min-w-8.25 items-center justify-center rounded-sm text-[10px] font-sans font-medium',
              outcome === 'W'
                ? 'bg-yellow-300/40 text-white'
                : outcome === '0'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-slate-700 text-white'
            )}>
            {outcome}
          </span>
        ))}
      </div>
    </div>
  )
}
