import type { ReactNode } from 'react'

// HISTORY

export type SignalOutcome = 'W' | 'L' | '0'

export interface SignalSummary {
  signalsFound: number
  wins: number
  losses: number
  zeroLosses: number
  bestWinStreak: number
  currentWinStreak: number
  winStreaks: number[]
  signalIndexes: number[]
  leadingSignalIndexes: number[]
  winningIndexes: number[]
  losingIndexes: number[]
  series: SignalOutcome[]
}

/**
 * State for one entry in the newest-first history tape sent to /api/bets/r3.
 * `index` is the display index: 0 is always the newest captured number.
 */
export interface RouletteHistoryItem {
  index: number
  number: number
  highlighted: boolean
  leadingSignal: boolean
  winning: boolean
  losing: boolean
}

export interface ResolvedRouletteHistory {
  /** Chronological, oldest-first numbers used by analytics indexes. */
  allNumbersFromStart: number[]
  /** Newest-first items used by the sidepanel and relay history tapes. */
  items: RouletteHistoryItem[]
  summary: SignalSummary
}

export interface SignalOverviewProps {
  total: number
  summary: SignalSummary
}

// COMPONENTS

export interface StatCardProps {
  title: string
  value: ReactNode
  subtitle?: string
  icon?: ReactNode
  trend?: 'up' | 'down' | 'neutral'
  color?: 'emerald' | 'neutral' | 'rose' | 'gold' | 'sky'
  extra?: ReactNode
}

export interface PercentageBarProps {
  label: string
  percentage: number
  color: string
  count: number
}

export interface NumberBadgeProps {
  number: number
  count: number
  isHot?: boolean
  showCount?: boolean
}

// STATS

export interface HotAndColdNumbersProps {
  hotNumbers: [number, number][]
  coldNumbers: [number, number][]
}
