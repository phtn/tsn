import { cn } from '@/src/lib/utils'
import { GameResult, PanelStatus, ResultSummary } from '../../../types'
import { GameClassView } from './game-class-switcher'

interface HeaderProps {
  status: PanelStatus
  stats: ResultSummary
  latestGame: GameResult | undefined
  gameClass: GameClassView
  onGameClassChange: VoidFunction
}

interface GameClassOption {
  value: GameClassView
  label: string
  icon: string
  style?: string
  badge?: string
}

const GAME_CLASS_OPTIONS: Array<GameClassOption> = [
  {
    value: 'originals',
    label: 'Originals',
    icon: 'url(./icons/originals.svg)',
    style: 'rotate-45 bg-white'
  },
  {
    value: 'roulette',
    label: 'Roulette',
    icon: 'url(./icons/roulette.svg)',
    style: 'rotate-45 bg-zinc-100'
  },
  {
    value: 'tennis',
    label: 'Tennis',
    icon: 'url(./icons/tenns.svg)',
    style: 'bg-[#27D51C] rotate-65'
  }
]
export const MainHeader = ({ status, stats, latestGame, onGameClassChange, gameClass }: HeaderProps) => {
  const currentGameClassLabel = GAME_CLASS_OPTIONS.find((option) => option.value === gameClass)?.label ?? gameClass
  const currentGameClass = GAME_CLASS_OPTIONS.find((option) => option.value === gameClass) ?? {
    icon: 'url(./icons/originals.svg)',
    style: 'rotate-45 bg-white'
  }

  // const gcmap: Record<GameClassView, { url: string; style: string }> = {
  //   originals: { url: 'url(./icons/originals.svg)', style: 'bg-white rotate-45' },
  //   roulette: 'url(./icons/coin-fill.svg)',
  //   tennis: 'url(./icons/tennis.svg)'
  // }

  return (
    <header className='relative overflow-hidden rounded-t-[15.01px] rounded-b-s border-[0.5px] border-[#1f2020]/80 bg-[#1f2020] text-white'>
      <div className='absolute inset-x-[-15%] top-[-24%] h-48 rounded-full bg-[radial-gradient(circle,rgba(200, 204, 207,0.44),transparent_66%)] blur-2xl' />
      <div className='absolute bottom-[-28%] right-[-16%] h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.28),transparent_70%)] blur-2xl' />
      <div className='relative space-y-4 px-4 py-1'>
        <div className='flex items-center justify-between gap-2'>
          <div className='flex items-center gap-2'>
            <div className='p-0'>
              <img
                src={
                  status.site === 'stake'
                    ? 'https://res.cloudinary.com/dx0heqhhe/image/upload/v1774084897/S_gx5txy.svg'
                    : 'https://res.cloudinary.com/dx0heqhhe/image/upload/v1774084886/88_vo2l7g.svg'
                }
                alt='369'
                className='h-12 w-12 aspect-square'
              />
            </div>
            <div>
              <h1 className='font-display mt-1 text-lg font-bold leading-4 drop-shadow-px drop-shadow-black text-white!'>
                36&middot;Stake St
              </h1>
            </div>
          </div>
          <div className='flex items-center space-x-4'>
            <div
              className={`flex items-center gap-2 rounded-full border px-1.5 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.22em] ${
                status.connected
                  ? 'border-emerald-300/35 bg-emerald-300/10 text-emerald-100'
                  : 'border-white/10 bg-white/6 text-slate-300'
              }`}>
              <span
                className={`h-2 w-2 aspect-square rounded-full ${
                  true ? 'animate-[pulse_2.4s_ease-in-out_infinite] bg-emerald-300' : 'bg-slate-500'
                }`}
              />
              {true ? 'Live' : 'Idle'}
            </div>
            <button onClick={onGameClassChange} className='flex items-center space-x-2 text-xs text-slate-300'>
              <span className='w-20 text-center'>{currentGameClassLabel}</span>
              <span
                className={cn(`size-7 rounded-full`, currentGameClass.style)}
                style={{
                  backgroundImage: currentGameClass.icon
                }}></span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
