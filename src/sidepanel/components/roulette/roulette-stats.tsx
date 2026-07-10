import { cn } from '@/src/lib/utils'
import { Dispatch, ReactNode, SetStateAction } from 'react'
import { fmtAmt } from './utils'

interface RouletteStatsProps {
  round: number
  accWinnings: number
  winStreak: number
  spins: number
  steps: number
  inputMode: 'base' | 'bank'
  setInputMode: Dispatch<SetStateAction<'base' | 'bank'>>
  baseUnit: number
  baseUnitInput: string
  setBaseUnitInput: Dispatch<SetStateAction<string>>
  totalStaked: number
  nextBet: number
  winAmount: number
  lastWinProfit: number | null
  coverage: number
  coveragePercent: number
  accPct: number
}
export const RouletteStats = ({
  round,
  accWinnings,
  winStreak,
  spins,
  steps,
  inputMode,
  setInputMode,
  baseUnit,
  baseUnitInput,
  setBaseUnitInput,
  totalStaked,
  nextBet,
  winAmount,
  lastWinProfit,
  coverage,
  coveragePercent,
  accPct
}: RouletteStatsProps) => {
  const displayProfit = lastWinProfit ?? winAmount - totalStaked
  return (
    <div className='mt-2'>
      <div className='grid grid-cols-7 px-1 gap-1'>
        <Stat cols={1}>
          <p className='text-[0.62rem] uppercase tracking-[0.2em] text-slate-400'>rd</p>
          <p className='mt-1.5 font-okx font-normal text-white text-lg'>{round}</p>
        </Stat>
        <Stat cols={1}>
          <p className='text-[0.62rem] uppercase tracking-[0.2em] text-slate-400'>ws</p>
          <p className='mt-1.5 font-okx font-normal text-white text-lg'>{winStreak}</p>
        </Stat>
        <Stat cols={1}>
          <p className='text-[0.62rem] uppercase tracking-[0.2em] text-slate-400'>spin</p>
          <p className='mt-1.5 text-lg font-normal text-white'>{spins}</p>
        </Stat>
        <Stat>
          <div className='flex items-start justify-between'>
            <span className='text-slate-400 text-[0.62rem] tracking-[0.2em] uppercase'>bank</span>
            <span className='font-okx font-medium text-pink-200'>{accPct.toFixed(1)}</span>
          </div>
          <p className='mt-1.5 font-okx font-normal text-white text-lg'>{accWinnings.toFixed(0)}</p>
        </Stat>

        <Stat>
          <div className='flex items-start justify-between'>
            <span
              className={cn('text-[0.62rem] uppercase tracking-widest text-slate-400', {
                'font-medium text-indigo-300 opacity-100': inputMode === 'base'
              })}>
              {inputMode === 'base' ? `${baseUnit * 272}` : `unit = ${baseUnit.toFixed(2)}`}
            </span>
            <button
              type='button'
              onClick={() => setInputMode((m) => (m === 'base' ? 'bank' : 'base'))}
              className={cn(
                'rounded px-1 py-[0.5px] text-[8px] font-medium uppercase tracking-wide transition-colors',
                inputMode === 'base' ? 'bg-slate-700 text-slate-300' : 'bg-indigo-500/30 text-indigo-200'
              )}>
              {inputMode === 'base' ? 'base' : 'bank'}
            </button>
          </div>
          <input
            type='number'
            min='1'
            step='1'
            value={baseUnitInput}
            onChange={(event) => setBaseUnitInput(event.target.value)}
            className='mt-1.5 w-full rounded-sm bg-slate-950/70 px-3 py-1 text-sm text-white outline-none'
          />
        </Stat>
      </div>
      <div className='grid grid-cols-10 mt-1 px-1 pb-1 gap-1'>
        <Stat>
          <p className='text-[0.62rem] uppercase tracking-[0.2em] text-slate-400'>Next</p>
          <p className='mt-1.5 text-lg font-normal text-white'>{fmtAmt(nextBet)}</p>
        </Stat>
        <Stat>
          <p className=' text-slate-400 text-[0.62rem] tracking-[0.2em] uppercase'>Staked</p>
          <p className='mt-1.5 text-lg font-normal text-white'>{fmtAmt(totalStaked)}</p>
        </Stat>
        <Stat>
          <p className=' text-slate-400 text-[0.62rem] tracking-[0.2em] uppercase whitespace-nowrap'>
            Take &middot; <span className=' text-emerald-400 tracking-widest'>{winAmount}</span>
          </p>
          <p className='mt-1.5 font-okx font-normal text-yellow-300 text-lg'>{fmtAmt(winAmount - totalStaked)}</p>
        </Stat>
        <Stat>
          <p className='text-[0.62rem] uppercase tracking-[0.2em] text-slate-400'>PCT</p>
          <p className='mt-1.5 text-lg font-normal text-indigo-300'>
            {((displayProfit / (baseUnit * 272)) * 100).toFixed(2)}
            <span className='text-[7px]'>%</span>
          </p>
        </Stat>
        <Stat>
          <p className='text-[0.62rem] uppercase tracking-[0.2em] text-slate-400'>cvg &middot; ({coverage})</p>
          <p className='mt-1.5 text-lg font-normal text-white'>
            {coveragePercent.toFixed(2)}
            <span className='text-[7px]'>%</span>
          </p>
        </Stat>
      </div>
    </div>
  )
}

interface StatsProps {
  cols?: number
  children: ReactNode
}
const Stat = ({ children, cols = 2 }: StatsProps) => {
  return (
    <div
      className={cn(
        'rounded-xs border-[0.33px] border-white/15 bg-white/8 backdrop-blur-md px-1.25 pt-1.5 pb-0 col-span-2',
        {
          'col-span-1': cols === 1
        }
      )}>
      {children}
    </div>
  )
}
