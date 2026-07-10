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
