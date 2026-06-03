import type { KimQuadrantId } from './kims-algo'

export interface KimAlgoScenario {
  label: string
  startingQuadrant: KimQuadrantId
  baseUnit: number
  spins: number[]
}

export const KIMS_ALGO_SCENARIOS: KimAlgoScenario[] = [
  {
    label: 'Drift Then Quadrant Hit',
    startingQuadrant: 'q1',
    baseUnit: 1,
    spins: [32, 15, 19, 4, 21, 2]
  },
  {
    label: 'Zero Hedge Rescue',
    startingQuadrant: 'q9',
    baseUnit: 1,
    spins: [1, 13, 31, 0, 29]
  },
  {
    label: 'Spread Fill Hit Regression',
    startingQuadrant: 'q1',
    baseUnit: 1,
    spins: [6, 9]
  },
  {
    label: 'Five-Round Collapse Reset',
    startingQuadrant: 'q4',
    baseUnit: 1,
    spins: [14, 25, 32, 7, 18]
  }
]
