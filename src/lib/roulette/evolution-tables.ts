export const EVOLUTION_TABLE_NAMES_BY_ID = {
  table01: 'Lightning Roulette',
  ligh0001: 'XXXtreme Lightning',
  // RED DOOR
  vaultro00001: 'Gold Vault Roulette',

  '48z5pjps3ntvqc1b': 'Auto Roulette',
  '7x0b1tgh7agmf6hv': 'Immersive Roulette',
  autoro00001: 'Speed Auto Roulette',
  '01rb77cq1gtenhmo': 'Auto Roulette VIP',

  privautoro001: 'Salon Prive Auto A',
  privautoro002: 'Salon Prive Auto B',
  k37tle5hfceqacik: 'Auto Lightning Roulette',
  vctlz20yfnmp1ylr: 'Roulette',

  ro0000002: 'Instant Roulette',
  lkcbrbdckjxajdol: 'Speed Roulette',
  fireballrou00001: 'Fireball Roulette',
  table001: 'American Roulette',

  wzg6kdkad1oe7m5k: 'VIP Roulette',
  lightnro001: 'Perya Lightning Roulette',
  '7nyiaws9tgqrzaz3': 'Football Roulette',
  ballrou001: 'Double Ball Roulette',

  ro000000001: 'Perya Roulette',
  mdkqijp3dctrhnuv: 'Salon Prive Roulette',
  pv5q45yjhasyt46y: 'Emperor Roulette',
  pv2zgy42anvdwk3l: 'Lotus Roulette'
} as const

export const tmap = EVOLUTION_TABLE_NAMES_BY_ID

export type EvolutionTableId = keyof typeof EVOLUTION_TABLE_NAMES_BY_ID

export function normalizeEvolutionTableId(tableId: string): string {
  return tableId
    .replace(/0+$/, '')
    .replace(/^[A-Z][a-z]+/, '')
    .toLowerCase()
}

export function getEvolutionTableDisplayName(tableId: string): string | undefined {
  const direct = EVOLUTION_TABLE_NAMES_BY_ID[tableId as EvolutionTableId]
  if (direct) return direct

  return EVOLUTION_TABLE_NAMES_BY_ID[normalizeEvolutionTableId(tableId) as EvolutionTableId]
}
