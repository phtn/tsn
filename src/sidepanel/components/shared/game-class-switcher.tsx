import { cn } from '../../../lib/utils'

export type GameClassView = 'roulette'

interface GameClassSwitcherProps {
  value: GameClassView
  onChange: (value: GameClassView) => void
}

const GAME_CLASS_OPTIONS: Array<{
  value: GameClassView
  label: string
  detail: string
  badge: string
}> = [
  // {
  //   value: 'originals',
  //   label: 'Originals',
  //   detail: 'Keno, Limbo, Dice, Mines',
  //   badge: 'Live Feed'
  // },
  {
    value: 'roulette',
    label: 'Roulette',
    detail: 'Board, sectors, wheel memory',
    badge: 'Preview'
  }
  // {
  //   value: 'tennis',
  //   label: 'Tennis',
  //   detail: 'Sports board, markets, odds',
  //   badge: 'Live Board'
  // }
]

export function GameClassSwitcher({ value, onChange }: GameClassSwitcherProps) {
  return (
    <section className='rounded-[16.01px] border border-white/60 bg-[#c4c4c4] p-1.5 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.35)] backdrop-blur-xl'>
      <div className='grid grid-cols-3 gap-2'>
        {GAME_CLASS_OPTIONS.map((option) => {
          const isActive = option.value === value
          const nonActiveTone = 'text-slate-700 hover:border-slate-300 hover:text-slate-950'

          return (
            <button
              key={option.value}
              type='button'
              onClick={() => onChange(option.value)}
              className={cn(
                `rounded-xl border px-3.5 py-1.5 text-left transition ${
                  isActive
                    ? 'border-slate-900 bg-slate-900 text-white shadow-[0_16px_34px_-24px_rgba(15,23,42,0.88)] font-semibold'
                    : `border-[#c1c1c1] bg-white ${nonActiveTone}`
                }`
              )}>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <p
                    className={`text-[0.5rem] uppercase tracking-[0.24em] ${
                      isActive ? 'text-cyan-100/60' : 'text-slate-500'
                    }`}>
                    {option.badge}
                  </p>
                  <div className='relative flex items-center justify-between'>
                    <h2 className='absolute font-sans font-bold text-lg leading-none text-fuchsia-100 blur-px'>
                      {' '}
                      {option.label}{' '}
                    </h2>
                    <h2 className='font-line font-medium text-lg leading-none'>{option.label}</h2>
                  </div>
                  <p className={`mt-0.5 text-[8px] ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                    {option.detail}
                  </p>
                </div>
                <span
                  className={`mt-1 h-2.5 w-2.5 rounded-full ${
                    isActive ? 'bg-emerald-300 shadow-[0_0_0_4px_rgba(110,231,183,0.16)]' : 'bg-slate-300'
                  }`}
                />
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
