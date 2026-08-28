import { useEffect, useState } from 'react'

import packageJson from '../../../package.json' with { type: 'json' }
import { loadConfig, saveConfig } from '../config'
import { LATEST_RELEASE_API_URL } from '../openUrl'
import { runUpdate } from '../update'

const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

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

export function useDashboardSettings() {
  const [showSettings, setShowSettings] = useState(false)
  const [selectedSettingIndex, setSelectedSettingIndex] = useState(0)
  const [showUsedMetric, setShowUsedMetric] = useState(false)
  const [showAbsoluteTime, setShowAbsoluteTime] = useState(false)
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(new Set())
  const [autoUpdate, setAutoUpdate] = useState(false)
  const [updateStatus, setUpdateStatus] = useState('Check')
  const [availableVersion, setAvailableVersion] = useState('')
  const [updating, setUpdating] = useState(false)

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
      if (config.autoUpdate !== undefined) {
        setAutoUpdate(config.autoUpdate)
      }
      const dueForCheck =
        !config.lastUpdateCheck || Date.now() - config.lastUpdateCheck > UPDATE_CHECK_INTERVAL_MS
      if (config.autoUpdate && dueForCheck) {
        checkForUpdate()
      }
    }
  }, [])

  const updateSettings = (
    newHidden: Set<string>,
    newMetric: boolean,
    newAbsTime: boolean,
    newAutoUpdate: boolean
  ) => {
    const config = loadConfig()
    if (config) {
      config.hiddenProviders = [...newHidden]
      config.showUsedMetric = newMetric
      config.showAbsoluteTime = newAbsTime
      config.autoUpdate = newAutoUpdate
      saveConfig(config)
    }
  }

  const toggleUsedMetric = () => {
    const next = !showUsedMetric
    setShowUsedMetric(next)
    updateSettings(hiddenProviders, next, showAbsoluteTime, autoUpdate)
  }

  const toggleAbsoluteTime = () => {
    const next = !showAbsoluteTime
    setShowAbsoluteTime(next)
    updateSettings(hiddenProviders, showUsedMetric, next, autoUpdate)
  }

  const toggleProviderVisibility = (label: string) => {
    const newHidden = new Set(hiddenProviders)
    if (newHidden.has(label)) {
      newHidden.delete(label)
    } else {
      newHidden.add(label)
    }
    setHiddenProviders(newHidden)
    updateSettings(newHidden, showUsedMetric, showAbsoluteTime, autoUpdate)
  }

  const toggleAutoUpdate = () => {
    const next = !autoUpdate
    setAutoUpdate(next)
    updateSettings(hiddenProviders, showUsedMetric, showAbsoluteTime, next)
  }

  const checkForUpdate = async () => {
    setUpdateStatus('Checking...')
    try {
      const res = await fetch(LATEST_RELEASE_API_URL, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error('GitHub API error')
      const data = (await res.json()) as { tag_name?: string }
      const latest = (data.tag_name ?? '').replace(/^v/, '')
      const current = packageJson.version
      if (!latest) throw new Error('no release tag')
      if (compareSemver(latest, current) > 0) {
        setUpdateStatus(`v${latest} available`)
        setAvailableVersion(latest)
      } else {
        setUpdateStatus('Up to date')
        setAvailableVersion('')
      }
    } catch {
      setUpdateStatus('Check failed')
    } finally {
      const config = loadConfig()
      if (config) {
        config.lastUpdateCheck = Date.now()
        saveConfig(config)
      }
    }
  }

  const updateNow = async () => {
    if (!availableVersion || updating) return
    const targetVersion = availableVersion
    setUpdating(true)
    setUpdateStatus(`Updating v${targetVersion}...`)
    try {
      await runUpdate(targetVersion)
      setAvailableVersion('')
      setUpdateStatus(`Updated v${targetVersion}; restart qmon`)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      setUpdateStatus(`Update failed: ${message}`)
    } finally {
      setUpdating(false)
    }
  }

  return {
    showSettings,
    setShowSettings,
    selectedSettingIndex,
    setSelectedSettingIndex,
    showUsedMetric,
    showAbsoluteTime,
    hiddenProviders,
    autoUpdate,
    updateStatus,
    availableVersion,
    updating,
    toggleUsedMetric,
    toggleAbsoluteTime,
    toggleProviderVisibility,
    toggleAutoUpdate,
    checkForUpdate,
    updateNow,
  }
}
