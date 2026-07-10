import type { SupportedSiteKey } from '../types'

export interface SupportedSiteConfig {
  key: SupportedSiteKey
  label: string
  hosts: string[]
}

export const SUPPORTED_SITES: SupportedSiteConfig[] = [
  {
    key: 'bet88',
    label: 'bet88.ph',
    hosts: ['bet88.ph']
  },
  {
    key: 'stake',
    label: 'Stake',
    hosts: ['stake.com']
  },
  {
    key: 'okbet',
    label: 'oKbet',
    hosts: ['okbet.com']
  }
]

function hostMatches(hostname: string, host: string): boolean {
  return hostname === host || hostname.endsWith(`.${host}`)
}

export function getSupportedSite(url: string | null | undefined): SupportedSiteConfig | null {
  if (!url) {
    return null
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return SUPPORTED_SITES.find((site) => site.hosts.some((host) => hostMatches(hostname, host))) ?? null
  } catch {
    return null
  }
}

export function isSupportedSite(url: string | null | undefined): boolean {
  return getSupportedSite(url) !== null
}

export function getSiteLabel(site: SupportedSiteKey | null | undefined): string {
  return SUPPORTED_SITES.find((entry) => entry.key === site)?.label ?? 'Unknown'
}
