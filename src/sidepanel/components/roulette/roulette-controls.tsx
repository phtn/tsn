import { useSFX } from '@/src/lib/sfx'
import { cn } from '@/src/lib/utils'
import { useEffect } from 'react'

interface RouletteControlsProps {
  winVerb: string
  lastWinProfit: number | null
  signalFound: boolean
  isTracking: boolean
  fmtAmt: (amt: number) => string
  autoMode: 'off' | 'semi' | 'auto'
  toggleAutoMode: VoidFunction
  scatter: boolean
  toggleScatter: VoidFunction
  allowOverlaps: boolean
  toggleAllowOverlaps: VoidFunction
  spreadSelectionMode: 'within' | 'across'
  toggleSpreadSelectionMode: VoidFunction
  loaded: boolean
  toggleLoaded: VoidFunction
  toggleTracking: VoidFunction
  betStatus: 'missed' | 'ok' | 'placing' | 'idle'
}

export const RouletteControls = ({
  winVerb,
  lastWinProfit,
  signalFound,
  isTracking,
  fmtAmt,
  autoMode,
  toggleAutoMode,
  scatter,
  toggleScatter,
  allowOverlaps,
  toggleAllowOverlaps,
  spreadSelectionMode,
  toggleSpreadSelectionMode,
  loaded,
  toggleLoaded,
  toggleTracking,
  betStatus
}: RouletteControlsProps) => {
  const { winSFX, startSFX } = useSFX()

  useEffect(() => {
    if (!isTracking && signalFound) {
      startSFX()
    }
  }, [isTracking, signalFound, startSFX])

  useEffect(() => {
    if (isTracking) {
      startSFX()
    }
  }, [isTracking, startSFX])

  useEffect(() => {
    if (lastWinProfit) {
      winSFX()
    }
  }, [lastWinProfit, winSFX])

  return (
    <div className='flex items-center justify-between bg-zinc-950 py-2 px-3 rounded-s-lg shadow-inner'>
      <div className=''>
        {lastWinProfit !== null && (
          <p className='font-semibold text-lg italic uppercase text-emerald-100'>
            <span className='-tracking-widest'>{winVerb}</span>{' '}
            <span className='font-extrabold text-amber-300'>+{fmtAmt(lastWinProfit)}</span>
          </p>
        )}
      </div>
      <div className='flex flex-col items-end gap-2'>
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <div
            className={cn(
              'bg-zinc-900/70 border border-zinc-900/70 rounded-lg h-6 w-6 flex items-center justify-center',
              {
                'bg-green-400/80 border-green-400/50 animate-pulse': signalFound && !isTracking
              }
            )}>
            <span
              className={cn(`h-5 min-w-5 bg-no-repeat object-contain`, {
                'animate-pulse': signalFound && !isTracking,
                'grayscale-75 opacity-40': !signalFound,
                'opacity-10': autoMode !== 'off'
              })}
              style={{
                backgroundImage: 'url(./icons/gem-lime.svg)',
                backgroundColor: 'transparent'
              }}></span>
          </div>

          <button
            type='button'
            title='Scatter: randomly sample slots from the active quadrant pool each round'
            onClick={toggleScatter}
            className={cn(
              'h-5 w-5 bg-zinc-900/60 border border-zinc-900/60 backdrop-blur-2xl rounded-md flex items-center justify-center ml-1',
              {
                'opacity-25': !scatter
              }
            )}>
            <span
              className={cn(`h-5 min-w-5`)}
              style={{
                backgroundImage: 'url(./icons/gem-blue.svg)',
                backgroundColor: 'transparent'
              }}></span>
          </button>

          <div className='flex items-center'>
            <button
              type='button'
              onClick={toggleAllowOverlaps}
              disabled={scatter}
              className={cn(
                'flex items-center justify-center h-7 w-7 disabled:cursor-not-allowed disabled:opacity-40'
              )}>
              <span
                className={cn('font-medium text-base leading-0 uppercase text-orange-100/70', {
                  'text-cyan-100/70': allowOverlaps
                })}>
                {allowOverlaps ? 'O' : 'S'}
              </span>
            </button>

            <button
              type='button'
              onClick={toggleSpreadSelectionMode}
              disabled={allowOverlaps}
              className={cn(
                'flex items-center justify-center h-7 w-7 transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                spreadSelectionMode === 'within' ? ' text-cyan-300/80' : ' text-fuchsia-300/80'
              )}>
              <span className='font-medium text-base leading-0 uppercase'>
                {spreadSelectionMode === 'within' ? 'W' : 'A'}
              </span>
            </button>
          </div>

          {/* Auto-arm toggle */}
          <div className='flex items-center'>
            <button
              type='button'
              onClick={toggleAutoMode}
              title='Auto-arm mode'
              className={cn(
                'rounded-s-sm bg-white/5 border border-white/15 py-1 text-center w-12 transition-colors',
                ' font-medium text-xs uppercase tracking-widest text-slate-400 hover:text-slate-200',
                {
                  'border-white/80': isTracking,
                  'bg-rose-800/10 text-white border-slate-200/60': autoMode !== 'off',
                  ' border-slate-200/60': autoMode !== 'off' && !isTracking,
                  ' border-cyan-200/60': autoMode === 'semi' && !isTracking,
                  ' border-rose-300/60': autoMode === 'auto' && !isTracking
                }
              )}>
              {autoMode === 'off' ? 'off' : autoMode === 'semi' ? 'M/T' : 'A/T'}
            </button>

            {/* Arm toggle */}
            <button
              type='button'
              onClick={toggleTracking}
              className={cn(
                'rounded-e-sm min-w-20 border border-l-0 px-2 py-1 text-xs uppercase tracking-wider transition-colors drop-shadow-xs',
                isTracking ? 'border-rose-100 bg-rose-500 text-white' : 'border-white/15 bg-rose-100/70 text-rose-800'
              )}>
              <span className='font-extrabold'>{isTracking ? 'Armed' : 'Arm'}</span>
            </button>
          </div>

          {/* Loaded toggle — executes v-board bets on actual Evolution table */}
          <button
            type='button'
            onClick={toggleLoaded}
            title='Execute v-board bets on the Evolution table each betting window'
            className={cn('relative inline-flex items-center justify-center ml-2', !loaded && 'opacity-40 grayscale')}>
            <span
              className={`h-5 min-w-5 bg-no-repeat object-contain`}
              style={{
                backgroundImage: loaded ? 'url(./icons/loaded.svg)' : 'url(./icons/loaded.svg)',
                backgroundColor: 'transparent'
              }}
            />
            {/* Bet-status badge */}
            {loaded && betStatus !== 'idle' && (
              <span
                className={cn(
                  'absolute -right-1.5 -top-1.5 flex h-3 w-3 items-center justify-center rounded-full text-[7px] font-bold',
                  betStatus === 'placing' && 'bg-amber-400 animate-pulse',
                  betStatus === 'ok' && 'bg-emerald-400',
                  betStatus === 'missed' && 'bg-rose-500'
                )}
              />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
