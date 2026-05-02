import { EUROPEAN_WHEEL_ORDER, RED_NUMBERS_SET } from '@/src/lib/roulette'
import { cn } from '@/src/lib/utils'
import { RouletteSpinResult } from '@/src/types/roulette'
import { CSSProperties, FC, useMemo } from 'react'

interface RacetrackProps {
  results: RouletteSpinResult[]
  limit?: number
}

// Oval perimeter layout (clockwise from top-left):
//   TOP  : indices  0–14  → 15 numbers, left→right  (row 1, cols 2–16)
//   RIGHT: indices 15–18  →  4 numbers, top→bottom  (col 17, rows 2–5)
//   BOT  : indices 19–32  → 14 numbers, right→left  (row 6, cols 2–15, reversed)
//   LEFT : indices 33–36  →  4 numbers, bottom→top  (col 1,  rows 2–5, reversed)
//
// Grid: 17 cols × 6 rows.  Empty corner cells naturally form the oval.
const TOP = EUROPEAN_WHEEL_ORDER.slice(0, 15)
const RIGHT = EUROPEAN_WHEEL_ORDER.slice(15, 19)
const BOTTOM = [...EUROPEAN_WHEEL_ORDER.slice(19, 33)].reverse()
const LEFT = [...EUROPEAN_WHEEL_ORDER.slice(33)].reverse() // [26,3,35,12] top→bottom

function heatStyle(t: number): CSSProperties {
  const stops = [
    { at: 0, h: 240, s: 5, l: 18 },
    { at: 0.25, h: 220, s: 60, l: 35 },
    { at: 0.5, h: 45, s: 80, l: 50 },
    { at: 0.75, h: 25, s: 90, l: 50 },
    { at: 1, h: 0, s: 90, l: 45 }
  ]
  let lo = stops[0],
    hi = stops[stops.length - 1]
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].at && t <= stops[i + 1].at) {
      lo = stops[i]
      hi = stops[i + 1]
      break
    }
  }
  const f = hi.at === lo.at ? 0 : (t - lo.at) / (hi.at - lo.at)
  const h = Math.round(lo.h + f * (hi.h - lo.h))
  const s = Math.round(lo.s + f * (hi.s - lo.s))
  const l = Math.round(lo.l + f * (hi.l - lo.l))
  return { backgroundColor: `hsl(${h} ${s}% ${l}%)` }
}

export const Racetrack: FC<RacetrackProps> = ({ results, limit = 50 }) => {
  const freqMap = useMemo(() => {
    const recent = results.slice(-limit)
    const map = new Map<number, number>()
    for (let n = 0; n <= 36; n++) map.set(n, 0)
    recent.forEach((r) => map.set(r.winningNumber, (map.get(r.winningNumber) ?? 0) + 1))
    return map
  }, [results, limit])

  const maxFreq = useMemo(() => Math.max(...freqMap.values(), 1), [freqMap])

  const cell = (num: number, col: number, row: number) => {
    const count = freqMap.get(num) ?? 0
    const isRed = RED_NUMBERS_SET.has(num)
    const isGreen = num === 0
    return (
      <div
        key={num}
        title={`${num} · ${count} hit${count !== 1 ? 's' : ''}`}
        style={{ gridColumn: col, gridRow: row, ...heatStyle(count / maxFreq) }}
        className={cn(
          'flex items-center justify-center rounded-[3px] border',
          'text-[9px] font-bold text-white/90 cursor-default select-none',
          isGreen ? 'border-emerald-400/60' : isRed ? 'border-rose-500/40' : 'border-white/10'
        )}>
        {num}
      </div>
    )
  }

  return (
    <div className='px-3 py-2'>
      <div className='flex items-center justify-between mb-2'>
        <span className='font-semibold text-white uppercase text-xs tracking-widest'>Racetrack</span>
        <span className='text-[10px] text-zinc-500'>last {Math.min(results.length, limit)} spins</span>
      </div>

      {/* Oval track — 17-col × 6-row grid; empty corners create the oval shape */}
      <div
        className='border border-zinc-700/50 rounded-3xl p-1.25 bg-zinc-950/40'
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(17, 1fr)',
          gridTemplateRows: 'repeat(6, 18px)',
          gap: '2px'
        }}>
        {TOP.map((n, i) => cell(n, i + 2, 1))}
        {RIGHT.map((n, i) => cell(n, 17, i + 2))}
        {BOTTOM.map((n, i) => cell(n, i + 2, 6))}
        {LEFT.map((n, i) => cell(n, 1, i + 2))}
      </div>

      {/* Heat legend */}
      <div className='flex items-center justify-end gap-2 mt-2'>
        <span className='text-[10px] text-zinc-600'>cold</span>
        <div className='flex gap-px'>
          {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
            <div key={i} className='w-5 h-1.5 rounded-sm' style={heatStyle(t)} />
          ))}
        </div>
        <span className='text-[10px] text-zinc-600'>hot</span>
      </div>
    </div>
  )
}
