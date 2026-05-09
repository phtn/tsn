export function getNewRecentSpinCount(prevNewestFirst: readonly number[], currNewestFirst: readonly number[]): number {
  for (let offset = 0; offset < currNewestFirst.length; offset++) {
    const overlapLength = Math.min(prevNewestFirst.length, currNewestFirst.length - offset)
    if (overlapLength === 0) continue

    let matches = true
    for (let i = 0; i < overlapLength; i++) {
      if (currNewestFirst[offset + i] !== prevNewestFirst[i]) {
        matches = false
        break
      }
    }

    if (matches) {
      return offset
    }
  }

  return 1
}
