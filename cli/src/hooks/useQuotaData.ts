import type { QuotaSnapshot } from '../api'
import { useCallback, useEffect, useRef, useState } from 'react'

import { fetchAllQuotas } from '../api'

export function useQuotaData(onLogout: () => void) {
  const [snapshots, setSnapshots] = useState<QuotaSnapshot[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const loadData = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true)
        const data = await fetchAllQuotas(signal)
        if (signal?.aborted) return
        setSnapshots(data)
        setLastRefreshed(new Date())
        setError('')
      } catch (error_: unknown) {
        if (signal?.aborted) return
        const message = error_ instanceof Error ? error_.message : String(error_)
        if (message === 'UNAUTHORIZED') {
          onLogout()
          return
        }
        setError(message)
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [onLogout]
  )

  useEffect(() => {
    // Load persisted settings is handled by useDashboardSettings; refresh quota data here.
    const controller = new AbortController()
    abortControllerRef.current = controller
    loadData(controller.signal)
    const interval = setInterval(() => {
      abortControllerRef.current?.abort()
      const next = new AbortController()
      abortControllerRef.current = next
      loadData(next.signal)
    }, 30000) // 30 second auto-refresh
    return () => {
      clearInterval(interval)
      abortControllerRef.current?.abort()
    }
  }, [loadData])

  return { snapshots, error, loading, lastRefreshed, loadData }
}
