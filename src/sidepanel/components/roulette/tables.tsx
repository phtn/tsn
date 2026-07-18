export const rtnMap: Record<string, string> = {
  table01: 'Lightning Roulette',
  ligh0001: 'XXXtreme Lightning',
  vaultro00001: 'Gold Vault Roulette',
  lightningtable01: 'Lightning Roulette',
  xxxtremeligh0001: 'XXXtreme Lightning',
  goldvaultro00001: 'Gold Vault Roulette',
  '48z5pjps3ntvqc1b': 'Auto Roulette',
  '7x0b1tgh7agmf6hv': 'Immersive Roulette',
  autoro00001: 'Speed Auto Roulette',
  speedautoro00001: 'Speed Auto Roulette',
  '01rb77cq1gtenhmo': 'Auto Roulette VIP',
  privautoro001: 'Salon Prive Auto A',
  privautoro002: 'Salon Prive Auto B',
  salprivautoro001: 'Salon Privé Auto-Roulette A',
  salprivautoro002: 'Salon Privé Auto-Roulette B',
  k37tle5hfceqacik: 'Auto Lightning Roulette',
  vctlz20yfnmp1ylr: 'Roulette',
  ro0000002: 'Instant Roulette',
  lkcbrbdckjxajdol: 'Speed Roulette',
  fireballrou00001: 'Fireball Roulette',
  table001: 'American Roulette',
  americantable001: 'American Roulette',
  wzg6kdkad1oe7m5k: 'VIP Roulette',
  lightnro001: 'Perya Lightning Roulette',
  peryalightnro001: 'Perya Lightning Roulette',
  '7nyiaws9tgqrzaz3': 'Football Roulette',
  ballrou001: 'Double Ball Roulette',
  doubleballrou001: 'Double Ball Roulette',
  ro000000001: 'Perya Roulette',
  peryaro000000001: 'Perya Roulette',
  mdkqijp3dctrhnuv: 'Salon Privé Roulette',
  pv5q45yjhasyt46y: 'Emperor Roulette',
  pv2zgy42anvdwk3l: 'Lotus Roulette'
  // 'live-evolution-26': 'Speed Auto Roulette'
}

export interface RtnTableRef {
  id: string
  name: string
}

function normalizeTableName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/roulette/g, '')
}

export function getRtnTableName(tableId: string | null | undefined): string | undefined {
  if (!tableId) return undefined
  const normalizedId = tableId.trim().toLowerCase()
  return rtnMap[tableId] ?? rtnMap[normalizedId]
}

export function findRtnTableByName(
  tableName: string | null | undefined,
  tableIds: readonly string[]
): RtnTableRef | null {
  const normalizedName = tableName ? normalizeTableName(tableName) : ''
  if (!normalizedName) return null

  for (const tableId of tableIds) {
    const name = getRtnTableName(tableId)
    if (name && normalizeTableName(name) === normalizedName) {
      return { id: tableId, name }
    }
  }

  return null
}
