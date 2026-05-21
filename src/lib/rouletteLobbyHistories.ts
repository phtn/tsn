import type { LobbyTableHistory } from '../types/roulette'
import {
  normalizeRelayEndpointConfig,
  postJsonToEndpoint,
  resolveRelayEndpointUrl,
  type RelayEndpointConfig
} from './relayEndpoints'

export type RouletteLobbyHistoriesEndpointConfig = RelayEndpointConfig

export interface RouletteLobbyHistoriesPayload {
  type: 'roulette.lobbyHistories'
  schemaVersion: 1
  emittedAt: string
  capturedAt: string
  pageUrl: string
  captureUrl: string
  histories: LobbyTableHistory[]
}

export interface BuildRouletteLobbyHistoriesPayloadArgs {
  histories: readonly LobbyTableHistory[]
  pageUrl: string
  captureUrl: string
  timestamp: number
}

export type RouletteLobbyHistoriesCapture = BuildRouletteLobbyHistoriesPayloadArgs

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLobbyTableHistory(value: unknown): value is LobbyTableHistory {
  return (
    isRecord(value) &&
    typeof value.tableId === 'string' &&
    Array.isArray(value.numbers) &&
    value.numbers.every((entry) => typeof entry === 'number' && Number.isInteger(entry) && entry >= 0 && entry <= 36)
  )
}

export function getDefaultRouletteLobbyHistoriesEndpointConfig(
  devServerPort: number
): RouletteLobbyHistoriesEndpointConfig {
  return {
    baseUrl: `http://localhost:${devServerPort}`,
    endpoint: '/api/bets/r2'
  }
}

export function normalizeRouletteLobbyHistoriesEndpointConfig(
  value: unknown,
  devServerPort: number
): RouletteLobbyHistoriesEndpointConfig {
  return normalizeRelayEndpointConfig(value, getDefaultRouletteLobbyHistoriesEndpointConfig(devServerPort))
}

export function resolveRouletteLobbyHistoriesEndpointUrl(config: RouletteLobbyHistoriesEndpointConfig): string {
  return resolveRelayEndpointUrl(config)
}

export function normalizeRouletteLobbyHistoriesCapture(value: unknown): RouletteLobbyHistoriesCapture | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    !Array.isArray(value.histories) ||
    !value.histories.every(isLobbyTableHistory) ||
    typeof value.pageUrl !== 'string' ||
    typeof value.captureUrl !== 'string' ||
    typeof value.timestamp !== 'number' ||
    !Number.isFinite(value.timestamp)
  ) {
    return null
  }

  return {
    histories: value.histories.map(({ tableId, numbers }) => ({
      tableId,
      numbers: [...numbers]
    })),
    pageUrl: value.pageUrl,
    captureUrl: value.captureUrl,
    timestamp: value.timestamp
  }
}

export function buildRouletteLobbyHistoriesPayload({
  histories,
  pageUrl,
  captureUrl,
  timestamp
}: BuildRouletteLobbyHistoriesPayloadArgs): RouletteLobbyHistoriesPayload {
  return {
    type: 'roulette.lobbyHistories',
    schemaVersion: 1,
    emittedAt: new Date().toISOString(),
    capturedAt: new Date(timestamp).toISOString(),
    pageUrl,
    captureUrl,
    histories: histories.map(({ tableId, numbers }) => ({
      tableId,
      numbers: [...numbers]
    }))
  }
}

export async function sendRouletteLobbyHistories(
  payload: RouletteLobbyHistoriesPayload,
  endpointUrl: string
): Promise<void> {
  await postJsonToEndpoint(payload, endpointUrl, 'roulette lobby histories')
}
