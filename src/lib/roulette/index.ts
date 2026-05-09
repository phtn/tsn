// Roulette number colors

export const RED_NUMBERS_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
export const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
export const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]

// Wheel sections (European Roulette)
export const TIER_G = [27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33]
export const ORPHELINS_G = [1, 20, 14, 31, 9, 17, 34, 6]
export const VOISINS_G = [22, 18, 29, 7, 28, 12, 35, 3, 26, 0, 32, 15, 19, 4, 21, 2, 25]

export const R2D = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]
] as const

export const ROW1 = R2D[2]
export const ROW2 = R2D[1]
export const ROW3 = R2D[0]

export const DOZ1 = R2D.map((row) => row.slice(0, 4))
export const DOZ2 = R2D.map((row) => row.slice(4, 8))
export const DOZ3 = R2D.map((row) => row.slice(8, 12))

export const EUROPEAN_WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7,
  28, 12, 35, 3, 26
] as const

export const BOARD_ROWS = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]
] as const

export const OUTSIDE_BETS = [
  { label: '1 to 18', tone: 'border-slate-200/80 bg-white text-slate-700' },
  { label: 'Even', tone: 'border-slate-200/80 bg-white text-slate-700' },
  { label: 'Red', tone: 'border-[#b51b13] bg-[#b51b13] text-white' },
  { label: 'Black', tone: 'border-slate-900/80 bg-slate-900 text-white' },
  { label: 'Odd', tone: 'border-slate-200/80 bg-white text-slate-700' },
  { label: '19 to 36', tone: 'border-slate-200/80 bg-white text-slate-700' }
] as const

export const DOZENS = ['1st 12', '2nd 12', '3rd 12'] as const
export const COLUMNS = ['2 to 1', '2 to 1', '2 to 1'] as const

export const SECTOR_PRESETS = [
  {
    label: 'Voisins',
    description: '17-number arc around zero',
    numbers: VOISINS_G
  },
  {
    label: 'Tiers',
    description: '12-number opposite slice',
    numbers: TIER_G
  },
  {
    label: 'Orphelins',
    description: 'Isolated wheel pockets',
    numbers: ORPHELINS_G
  }
] as const

export const SAMPLE_SPIN_TAPE = [32, 15, 19, 4, 21, 2, 25, 17, 34, 6] as const

export * from './kims-algo'
export * from './recent-numbers'
