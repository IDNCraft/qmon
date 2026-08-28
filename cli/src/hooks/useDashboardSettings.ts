import { useEffect, useState } from 'react'

import { loadConfig, saveConfig } from '../config'

export function useDashboardSettings() {
  const [showSettings, setShowSettings] = useState(false)
  const [selectedSettingIndex, setSelectedSettingIndex] = useState(0)
  const [showUsedMetric, setShowUsedMetric] = useState(false)
  const [showAbsoluteTime, setShowAbsoluteTime] = useState(false)
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(new Set())

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
  }, [])

  const updateSettings = (newHidden: Set<string>, newMetric: boolean, newAbsTime: boolean) => {
    const config = loadConfig()
    if (config) {
      config.hiddenProviders = Array.from(newHidden)
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

  return {
    showSettings,
    setShowSettings,
    selectedSettingIndex,
    setSelectedSettingIndex,
    showUsedMetric,
    showAbsoluteTime,
    hiddenProviders,
    toggleUsedMetric,
    toggleAbsoluteTime,
    toggleProviderVisibility,
  }
}
