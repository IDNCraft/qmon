import { loadConfig } from '@/config'

interface Quota {
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

// Validation helpers
function assertObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid API response: expected object')
  }
  return value as Record<string, unknown>
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Invalid API response: ${field} must be string`)
  }
  return value
}

function assertOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new TypeError(`Invalid API response: ${field} must be string or null`)
  }
  return value
}

function assertBooleanLike(value: unknown, field: string): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value === 'true'
  throw new Error(`Invalid API response: ${field} must be boolean or 'true'/'false' string`)
}

function assertOptionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number') {
    throw new TypeError(`Invalid API response: ${field} must be number or null`)
  }
  return value
}

function assertArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`Invalid API response: ${field} must be array`)
  }
  return value
}

function validateQuota(value: unknown): Quota {
  const obj = assertObject(value)
  return {
    quota_type: assertOptionalString(obj.quota_type, 'quota_type') ?? '',
    percent_remaining: assertOptionalNumber(obj.percent_remaining, 'percent_remaining') ?? 0,
    reset_text: assertOptionalString(obj.reset_text, 'reset_text') ?? '',
    resets_at: assertOptionalString(obj.resets_at, 'resets_at'),
    model_key: assertOptionalString(obj.model_key, 'model_key') ?? '',
    is_exhausted: assertBooleanLike(obj.is_exhausted, 'is_exhausted'),
  }
}

function validateQuotaSnapshot(value: unknown): QuotaSnapshot {
  const obj = assertObject(value)
  const quotas = Array.isArray(obj.quotas) ? obj.quotas : []
  const providerId = assertString(obj.provider_id, 'provider_id')
  try {
    return {
      provider_id: providerId,
      name: assertString(obj.name, 'name'),
      is_available: assertBooleanLike(obj.is_available, 'is_available'),
      quotas: quotas.map((quota) => validateQuota(quota)),
      last_error: assertOptionalString(obj.last_error, 'last_error') ?? '',
      captured_at: assertOptionalString(obj.captured_at, 'captured_at') ?? '',
    }
  } catch (error: unknown) {
    throw new Error(
      `Invalid API response for provider ${providerId}: ${getThrownErrorMessage(error)}`
    )
  }
}

function validateSnapshotResponse(value: unknown): QuotaSnapshot[] {
  const obj = assertObject(value)
  const data = assertObject(obj.data)
  const providers = assertArray(data.providers, 'data.providers')
  return providers.map((provider) => validateQuotaSnapshot(provider))
}

function validateTokenResponse(value: unknown): { token: string } {
  const obj = assertObject(value)
  const data = assertObject(obj.data)
  return { token: assertString(data.j_token, 'data.j_token') }
}

function validateAppConfigResponse(value: unknown): { isDefaultAdmin: string } {
  const obj = assertObject(value)
  const data = assertObject(obj.data)
  return { isDefaultAdmin: assertString(data.is_default_admin, 'data.is_default_admin') }
}

function validateResetResponse(value: unknown): { message: string } {
  const obj = assertObject(value)
  return { message: assertString(obj.message, 'message') }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function getErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
    return body.message
  }
  return fallback
}

function getThrownErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function fetchAllQuotas(signal?: AbortSignal): Promise<QuotaSnapshot[]> {
  try {
    const res = await fetch(`${getBaseUrl()}/api/v1/quota/snapshot`, {
      headers: getHeaders(),
      signal,
    })
    const body = await safeJson(res)
    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('UNAUTHORIZED')
      }
      throw new Error(`API Error: ${getErrorMessage(body, res.statusText)}`)
    }
    if (body === null) {
      throw new Error('Invalid API response: empty body')
    }
    return validateSnapshotResponse(body)
  } catch (error: unknown) {
    if (signal?.aborted) throw error
    throw new Error(getThrownErrorMessage(error) || 'Failed to fetch quotas')
  }
}

export async function login(
  email: string,
  password: string,
  baseUrl: string,
  signal?: AbortSignal
): Promise<{ token: string }> {
  const cleanUrl = baseUrl.replace(/\/+$/, '')
  try {
    const res = await fetch(`${cleanUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal,
    })
    const body = await safeJson(res)
    if (!res.ok) {
      throw new Error(getErrorMessage(body, 'Login failed'))
    }
    if (body === null) {
      throw new Error('Invalid API response: empty body')
    }
    return validateTokenResponse(body)
  } catch (error: unknown) {
    if (signal?.aborted) throw error
    throw new Error(getThrownErrorMessage(error) || 'Login failed')
  }
}

export async function resetDefaultCredentials(
  newEmail: string,
  newPassword: string,
  baseUrl: string,
  signal?: AbortSignal
): Promise<{ message: string }> {
  const cleanUrl = baseUrl.replace(/\/+$/, '')
  try {
    const res = await fetch(`${cleanUrl}/api/v1/auth/reset-default`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_email: newEmail, new_password: newPassword }),
      signal,
    })
    const body = await safeJson(res)
    if (!res.ok) {
      throw new Error(getErrorMessage(body, 'Reset failed'))
    }
    if (body === null) {
      throw new Error('Invalid API response: empty body')
    }
    return validateResetResponse(body)
  } catch (error: unknown) {
    if (signal?.aborted) throw error
    throw new Error(getThrownErrorMessage(error) || 'Reset failed')
  }
}

export async function fetchAppConfig(
  baseUrl: string,
  signal?: AbortSignal
): Promise<{ isDefaultAdmin: string }> {
  const cleanUrl = baseUrl.replace(/\/+$/, '')
  try {
    const res = await fetch(`${cleanUrl}/api/v1/app-config`, { signal })
    const body = await safeJson(res)
    if (!res.ok) {
      throw new Error(`API Error: ${res.statusText}`)
    }
    if (body === null) {
      throw new Error('Invalid API response: empty body')
    }
    return validateAppConfigResponse(body)
  } catch (error: unknown) {
    if (signal?.aborted) throw error
    throw new Error(getThrownErrorMessage(error) || 'Failed to fetch app config')
  }
}
