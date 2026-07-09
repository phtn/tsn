import { getNumberTone } from '../../../lib/roulette/utils'
import { RouletteSpinResult } from '../../../types/roulette'
import { getTableName } from './utils'

interface RouletteHeaderProps {
  tableId: string | undefined
  latestSpin: RouletteSpinResult | null
  previewSpins: number[] | readonly number[]
}

function getProviderLabel(spin: RouletteSpinResult | null): string {
  if (!spin) return 'Provider'
  return spin.source === 'evolution' ? 'Evolution' : 'Pragmatic Play'
}

function getTableNameFallback(spin: RouletteSpinResult | null): string {
  if (!spin) return 'Roulette Table'
  if (spin.source === 'evolution') return spin.tableName || spin.description || 'Evolution Roulette'
  return 'Roulette'
}

export const RouletteHeader = ({ tableId, latestSpin, previewSpins }: RouletteHeaderProps) => {
  const providerLabel = getProviderLabel(latestSpin)
  const tableName = latestSpin?.game || getTableName(tableId, getTableNameFallback(latestSpin))
  const recents = latestSpin ? previewSpins.slice(0, 12) : previewSpins.slice(0, 10)

  return (
    <section className='relative overflow-hidden rounded-xs border-t border-white/12 bg-[#1F2020] p-4 text-white'>
      <div className='absolute bottom-[-35%] right-[-16%] h-52 w-52 rounded-full bg-[radial-gradient(circle,rgba(239,68,68,0.28),transparent_68%)] blur-2xl' />
      <div className='relative'>
        <div className='flex items-start justify-between gap-4'>
          <div className='w-full'></div>
          {/*<div
            className={cn(
              `flex items-center justify-center rounded-full border border-emerald-300/25 bg-emerald-300/10 h-12 w-auto aspect-square uppercase text-emerald-100 ${getNumberTone(latestSpin?.winningNumber)} border-3! border-white/15 shadow-inner`
            )}>
            <span className={cn('font-medium text-xs text-center', { 'text-xl font-bold': latestSpin !== null })}>
              {latestSpin ? previewSpins[0] : 'Awaiting Spins'}
            </span>
          </div>*/}
        </div>
        <div className='mt-1 rounded-lg w-full'>
          {/*<div className='flex items-end justify-between gap-3'>
            <p className='text-[0.62rem] uppercase tracking-[0.22em] text-slate-500'>Recent spins</p>
            <p className='text-xs text-slate-500'>{latestSpin ? latestSpin.description : 'Listening for spins'}</p>
          </div>*/}
          <div className='flex flex-wrap gap-1 w-full'>
            {recents.map((value, index) => (
              <div
                key={`preview-spin-${value}-${index}`}
                className={`inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-sm font-semibold ${getNumberTone(value)}`}>
                {value}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
