import type { ReleaseInfo, UpdateProgress } from '../update'
import { useEffect, useRef, useState } from 'react'

import packageJson from '../../../package.json' with { type: 'json' }
import { loadConfig, saveConfig } from '../config'
import { LATEST_RELEASE_API_URL, RECENT_RELEASES_API_URL } from '../openUrl'
import { runUpdate } from '../update'

const INITIAL_UPDATE_PROGRESS: UpdateProgress = { step: 0, total: 3, label: '' }
const UPDATE_RECHECK_INTERVAL_MS = 15 * 60 * 1000
type UpdateState = 'idle' | 'updating' | 'success' | 'error'

function compareSemver(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const naValue = partsA[i] ?? 0
    const nbValue = partsB[i] ?? 0
    const na = Number.isNaN(naValue) ? 0 : naValue
    const nb = Number.isNaN(nbValue) ? 0 : nbValue
    if (na !== nb) return na - nb
  }
  return 0
}

async function fetchRecentReleases(
  latestVersion: string,
  latestBody: string
): Promise<ReleaseInfo[]> {
  try {
    const res = await fetch(RECENT_RELEASES_API_URL, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error('GitHub API error')
    const data = (await res.json()) as Array<{ tag_name?: string; name?: string; body?: string }>
    const parsed = data
      .filter((release) => typeof release.tag_name === 'string' && release.tag_name)
      .map((release) => ({
        version: (release.tag_name ?? '').replace(/^v/, ''),
        name: release.name ?? '',
        notes: release.body ?? '',
      }))
    if (parsed.length > 0 && parsed[0]?.version === latestVersion) {
      return parsed
    }
  } catch {
    // Fall back to the single latest release below.
  }
  return [{ version: latestVersion, name: '', notes: latestBody }]
}

export function useDashboardSettings() {
  const [showSettings, setShowSettings] = useState(false)
  const [selectedSettingIndex, setSelectedSettingIndex] = useState(0)
  const [showUsedMetric, setShowUsedMetric] = useState(false)
  const [showAbsoluteTime, setShowAbsoluteTime] = useState(false)
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(new Set())
  const [updateStatus, setUpdateStatus] = useState('Check')
  const [availableVersion, setAvailableVersion] = useState('')
  const [updating, setUpdating] = useState(false)
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [updateProgress, setUpdateProgress] = useState(INITIAL_UPDATE_PROGRESS)
  const [updateError, setUpdateError] = useState('')
  const [releases, setReleases] = useState<ReleaseInfo[]>([])
  const [showReleaseNotes, setShowReleaseNotes] = useState(false)
  const updateLockRef = useRef(false)
  const updateStateRef = useRef<UpdateState>('idle')
  const checkForUpdateRef = useRef<(options?: { silent?: boolean }) => Promise<void>>(
    async () => {}
  )

  useEffect(() => {
    const config = loadConfig()
    if (config) {
      if (config.hiddenProviders) {
        setHiddenProviders(new Set(config.hiddenProviders))
      }
      if (config.showUsedMetric !== undefined) {
        setShowUsedMetric(config.showUsedMetric)
      }
      if (config.showAbsoluteTime !== undefined) {
        setShowAbsoluteTime(config.showAbsoluteTime)
      }
    }
    void checkForUpdateRef.current()
    // Live re-check: a release published while qmon stays open surfaces the
    // Update button without restarting. Silent mode never overwrites status text.
    const interval = setInterval(() => {
      if (updateLockRef.current || updateStateRef.current !== 'idle') return
      void checkForUpdateRef.current({ silent: true })
    }, UPDATE_RECHECK_INTERVAL_MS)
    return () => {
      clearInterval(interval)
    }
  }, [])

  const updateSettings = (newHidden: Set<string>, newMetric: boolean, newAbsTime: boolean) => {
    const config = loadConfig()
    if (config) {
      config.hiddenProviders = [...newHidden]
      config.showUsedMetric = newMetric
      config.showAbsoluteTime = newAbsTime
      saveConfig(config)
    }
  }

  const toggleUsedMetric = () => {
    const next = !showUsedMetric
    setShowUsedMetric(next)
    updateSettings(hiddenProviders, next, showAbsoluteTime)
  }

  const toggleAbsoluteTime = () => {
    const next = !showAbsoluteTime
    setShowAbsoluteTime(next)
    updateSettings(hiddenProviders, showUsedMetric, next)
  }

  const toggleProviderVisibility = (label: string) => {
    const newHidden = new Set(hiddenProviders)
    if (newHidden.has(label)) {
      newHidden.delete(label)
    } else {
      newHidden.add(label)
    }
    setHiddenProviders(newHidden)
    updateSettings(newHidden, showUsedMetric, showAbsoluteTime)
  }

  const checkForUpdate = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false
    if (!silent) setUpdateStatus('Checking...')
    try {
      const res = await fetch(LATEST_RELEASE_API_URL, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error('GitHub API error')
      const data = (await res.json()) as { tag_name?: string; body?: string }
      const latest = (data.tag_name ?? '').replace(/^v/, '')
      const current = packageJson.version
      if (!latest) throw new Error('no release tag')
      // Always populate the release list so the Settings release notes stay
      // available even when the installed version is already the latest.
      setReleases(await fetchRecentReleases(latest, data.body ?? ''))
      if (compareSemver(latest, current) > 0) {
        setUpdateStatus(`v${latest} available`)
        setAvailableVersion(latest)
        // Show the release-notes modal once per version; closing it is safe
        // because the Update button stays in the dashboard header.
        const dismissed = loadConfig()?.dismissedUpdateVersion
        setShowReleaseNotes(dismissed !== latest)
      } else {
        if (!silent) setUpdateStatus('Up to date')
        setAvailableVersion('')
      }
    } catch {
      if (!silent) setUpdateStatus('Check failed')
    } finally {
      const config = loadConfig()
      if (config) {
        config.lastUpdateCheck = Date.now()
        saveConfig(config)
      }
    }
  }

  const updateNow = async () => {
    if (!availableVersion || updateLockRef.current) return
    const targetVersion = availableVersion
    updateLockRef.current = true
    setUpdating(true)
    setUpdateState('updating')
    setUpdateError('')
    setUpdateProgress({
      step: 0,
      total: INITIAL_UPDATE_PROGRESS.total,
      label: `Preparing update v${targetVersion}...`,
    })
    setUpdateStatus(`Updating v${targetVersion}...`)
    try {
      await runUpdate(targetVersion, setUpdateProgress)
      setAvailableVersion('')
      setUpdateStatus(`Updated v${targetVersion}; restart qmon`)
      setUpdateState('success')
      setUpdateProgress({
        step: INITIAL_UPDATE_PROGRESS.total,
        total: INITIAL_UPDATE_PROGRESS.total,
        label: `Updated v${targetVersion}. Restart qmon to use it.`,
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setUpdateStatus(`Update failed: ${message}`)
      setUpdateError(message)
      setUpdateState('error')
      setUpdateProgress((progress) => ({ ...progress, label: 'Update failed.' }))
    } finally {
      updateLockRef.current = false
      setUpdating(false)
    }
  }

  const dismissUpdate = () => {
    if (updating) return
    setUpdateState('idle')
    setUpdateError('')
  }

  const dismissReleaseNotes = () => {
    setShowReleaseNotes(false)
    if (availableVersion) {
      const config = loadConfig()
      if (config) {
        config.dismissedUpdateVersion = availableVersion
        saveConfig(config)
      }
    }
  }

  const openReleaseNotes = () => {
    setShowReleaseNotes(true)
  }

  checkForUpdateRef.current = checkForUpdate
  updateStateRef.current = updateState

  return {
    showSettings,
    setShowSettings,
    selectedSettingIndex,
    setSelectedSettingIndex,
    showUsedMetric,
    showAbsoluteTime,
    hiddenProviders,
    updateStatus,
    availableVersion,
    updating,
    updateState,
    updateProgress,
    updateError,
    toggleUsedMetric,
    toggleAbsoluteTime,
    toggleProviderVisibility,
    checkForUpdate,
    updateNow,
    dismissUpdate,
    releases,
    showReleaseNotes,
    dismissReleaseNotes,
    openReleaseNotes,
  }
}
