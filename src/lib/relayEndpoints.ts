export interface RelayEndpointConfig {
  baseUrl: string
  endpoint: string
}

export function normalizeRelayEndpointConfig(value: unknown, fallback: RelayEndpointConfig): RelayEndpointConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fallback
  }

  const record = value as Record<string, unknown>
  return {
    baseUrl: typeof record.baseUrl === 'string' && record.baseUrl.trim() ? record.baseUrl : fallback.baseUrl,
    endpoint: typeof record.endpoint === 'string' && record.endpoint.trim() ? record.endpoint : fallback.endpoint
  }
}

export function resolveRelayEndpointUrl(config: RelayEndpointConfig): string {
  const baseUrl = config.baseUrl.trim().replace(/\/+$/, '')
  const endpoint = config.endpoint.trim()

  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint
  }

  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${baseUrl}${normalizedEndpoint}`
}

export async function postJsonToEndpoint(payload: unknown, endpointUrl: string, label: string): Promise<void> {
  const endpoint = endpointUrl.trim()
  if (!endpoint) {
    console.warn(`[${label}] endpoint is empty`)
    return
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      console.warn(`[${label}] endpoint responded with status ${response.status}`)
    }
  } catch (error) {
    console.debug(`[${label}] endpoint not available:`, error)
  }
}
