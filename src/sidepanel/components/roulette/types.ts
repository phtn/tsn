export interface Stats {
  zero: {
    count: number
    pct: number
  }
  dozens: {
    count: number
    pct: number
  }[]
  columns: {
    count: number
    pct: number
  }[]
  halves: {
    count: number
    pct: number
  }[]
  colors: {
    red: {
      count: number
      pct: number
    }
    black: {
      count: number
      pct: number
    }
  }
  oddEven: {
    odd: {
      count: number
      pct: number
    }
    even: {
      count: number
      pct: number
    }
  }
  streets: any[]
  sections: {
    tier: {
      count: number
      pct: number
    }
    orphelins: {
      count: number
      pct: number
    }
    voisins: {
      count: number
      pct: number
    }
  }
  hotNumbers: [number, number][] | never[]
  coldNumbers: [number, number][] | never[]
  numberCounts: Map<number, number>
}
