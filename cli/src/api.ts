import { loadConfig } from './config'

export interface Quota {
  quota_type: string
  percent_remaining: number
  reset_text: string
  resets_at?: string
  model_key: string
  is_exhausted?: boolean
}

export interface QuotaSnapshot {
  provider_id: string
  name: string
  is_available: boolean
  quotas: Quota[]
  last_error: string
  captured_at: string
}

function getHeaders() {
  const config = loadConfig()
  if (!config) throw new Error('Not logged in')
  return {
    'Authorization': `Bearer ${config.token}`,
    'Content-Type': 'application/json',
  }
}

function getBaseUrl() {
  const config = loadConfig()
  if (!config) throw new Error('Not logged in')
  return config.baseUrl.replace(/\/+$/, '')
}

export async function fetchAllQuotas(): Promise<QuotaSnapshot[]> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/v1/quota/snapshot`, {
      headers: getHeaders(),
    })
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('UNAUTHORIZED')
      }
      throw new Error(`API Error: ${res.statusText}`)
    }
    const data = (await res.json()) as any
    return data.data.providers as QuotaSnapshot[]
  } catch (err: any) {
    throw new Error(err.message || 'Failed to fetch quotas')
  }
}
