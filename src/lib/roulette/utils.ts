import { RED_NUMBERS_SET } from '.'
import { ClassName, PanelStatus } from '../../types'

export function getQuadTone(value: number | undefined, isMember: boolean, isActive: boolean): ClassName {
  if (value === undefined) {
    return ''
  }

  return RED_NUMBERS_SET.has(value) && (isMember || isActive)
    ? 'border-white bg-[#B51B13] text-neutral-50 rounded-none'
    : 'text-slate-100'
}

export function getNumberTone(value: number | undefined): string {
  if (value === undefined) {
    return 'border-slate-200/15 bg-slate-950/78 text-slate-100'
  }
  if (value === 0) {
    return 'border-[#166958] bg-[#166958] text-white'
  }

  return RED_NUMBERS_SET.has(value)
    ? 'border-[#89211d] bg-[#902823] text-neutral-50' //#89211d
    : 'border-black/50 bg-black text-slate-200'
}

function getSourceLabel(status: PanelStatus): string {
  if (!status.connected || !status.site) {
    return 'No live roulette source armed yet'
  }

  return `${status.site === 'stake' ? 'Stake' : 'bet88.ph'} connected`
}
