import type { QuotaSnapshot } from '../api'
import Table from 'cli-table3'
import { Box, Text, useInput, useWindowSize } from 'ink'
import React, { useEffect, useState } from 'react'

import { fetchAllQuotas } from '../api'
import { loadConfig, saveConfig } from '../config'

function formatAbsoluteTime(text: string, referenceDate: Date): string {
  const match = text.match(/(?:(\d+)d\s+)?(?:(\d+)h\s+)?(\d+)m/)
  if (match) {
    const days = parseInt(match[1] || '0')
    const hours = parseInt(match[2] || '0')
    const minutes = parseInt(match[3] || '0')
    const ms = ((days * 24 + hours) * 60 + minutes) * 60 * 1000
    const targetDate = new Date(referenceDate.getTime() + ms)

    const dateStr = targetDate.toLocaleString()
    if (text.includes('Exhausted — ')) {
      return `Exhausted until ${dateStr}`
    } else if (text.includes('in ')) {
      return text.replace(/in\s+(?:\d+d\s+)?(?:\d+h\s+)?\d+m/, `at ${dateStr}`)
    } else {
      return text.replace(/(?:\d+d\s+)?(?:\d+h\s+)?\d+m/, dateStr)
    }
  }
  return text
}

interface Props {
  onLogout: () => void
}

export function Dashboard({ onLogout }: Props) {
  const [snapshots, setSnapshots] = useState<QuotaSnapshot[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  // Settings states
  const [showSettings, setShowSettings] = useState(false)
  const [showUsedMetric, setShowUsedMetric] = useState(false)
  const [showAbsoluteTime, setShowAbsoluteTime] = useState(false)
  const [hiddenProviders, setHiddenProviders] = useState<Set<string>>(new Set())
  const [selectedSettingIndex, setSelectedSettingIndex] = useState(0)
  const { columns: terminalColumns } = useWindowSize()
  const isCompact = terminalColumns < 100
  const tableWidth = Math.max(20, terminalColumns - 8)
  const compactStatusWidth = Math.max(12, Math.floor(tableWidth * 0.42))
  const compactLabelWidth = Math.max(8, tableWidth - compactStatusWidth)
  const desktopModelWidth = Math.max(24, Math.floor(tableWidth * 0.32))
  const desktopResetWidth = Math.max(24, tableWidth - 18 - desktopModelWidth - 15)

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await fetchAllQuotas()
      setSnapshots(data)
      setLastRefreshed(new Date())
      setError('')
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') {
        onLogout()
        return
      }
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Load persisted settings
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

    loadData()
    const interval = setInterval(() => {
      loadData()
    }, 30000) // 30 second auto-refresh
    return () => clearInterval(interval)
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

  const uniqueProviders = Array.from(new Set(snapshots.map((s) => s.name)))

  const settingsItems = [
    { type: 'metric', label: 'Metric Display', value: showUsedMetric ? 'Used %' : 'Remaining %' },
    {
      type: 'time',
      label: 'Time Display',
      value: showAbsoluteTime ? 'Absolute (Date)' : 'Relative (Timer)',
    },
    ...uniqueProviders.map((p) => ({ type: 'provider', label: p, value: !hiddenProviders.has(p) })),
  ]

  useInput((input, key) => {
    if (showSettings) {
      if (key.upArrow) {
        setSelectedSettingIndex((prev) => Math.max(0, prev - 1))
      } else if (key.downArrow) {
        setSelectedSettingIndex((prev) => Math.min(settingsItems.length - 1, prev + 1))
      } else if (input === ' ' || key.return) {
        const item = settingsItems[selectedSettingIndex]
        if (!item) return
        if (item.type === 'metric') {
          const next = !showUsedMetric
          setShowUsedMetric(next)
          updateSettings(hiddenProviders, next, showAbsoluteTime)
        } else if (item.type === 'time') {
          const next = !showAbsoluteTime
          setShowAbsoluteTime(next)
          updateSettings(hiddenProviders, showUsedMetric, next)
        } else if (item.type === 'provider') {
          const newHidden = new Set(hiddenProviders)
          if (newHidden.has(item.label)) {
            newHidden.delete(item.label)
          } else {
            newHidden.add(item.label)
          }
          setHiddenProviders(newHidden)
          updateSettings(newHidden, showUsedMetric, showAbsoluteTime)
        }
      } else if (key.escape || input.toLowerCase() === 's') {
        setShowSettings(false)
      }
    } else {
      if (input.toLowerCase() === 'r') {
        loadData()
      } else if (input.toLowerCase() === 's') {
        setShowSettings(true)
        setSelectedSettingIndex(0)
      } else if (input.toLowerCase() === 'u') {
        const next = !showUsedMetric
        setShowUsedMetric(next)
        updateSettings(hiddenProviders, next, showAbsoluteTime)
      } else if (input.toLowerCase() === 't') {
        const next = !showAbsoluteTime
        setShowAbsoluteTime(next)
        updateSettings(hiddenProviders, showUsedMetric, next)
      }
    }
  })

  const buildTable = () => {
    const visibleSnapshots = snapshots.filter((snap) => !hiddenProviders.has(snap.name))

    if (visibleSnapshots.length === 0) {
      return "No providers selected to display. Press 'S' to open settings."
    }

    const table = new Table({
      head: isCompact
        ? ['Provider / Model', showUsedMetric ? 'Used / Reset' : 'Remaining / Reset']
        : ['Provider', 'Model', showUsedMetric ? 'Used %' : 'Remaining %', 'Reset/Status'],
      colWidths: isCompact
        ? [compactLabelWidth, compactStatusWidth]
        : [18, desktopModelWidth, 15, desktopResetWidth],
      wordWrap: true,
      style: { head: ['cyan'] },
    })

    const pushRow = (provider: string, model: string, metric: string, status: string) => {
      if (isCompact) {
        table.push([
          [provider, model].filter((value) => value && value !== '-').join('\n') || '-',
          [metric, status].filter(Boolean).join('\n') || '-',
        ])
        return
      }
      table.push([provider, model, metric, status])
    }

    // Sort: critical (exhausted/lowest remaining) first
    const sortedSnapshots = visibleSnapshots
      .map((snap) => {
        const updatedSnap = { ...snap }
        if (updatedSnap.provider_id.toLowerCase() === 'opencode') {
          updatedSnap.name = updatedSnap.name.replace(/opencode/i, 'OpenCode Go')
        }
        if (!updatedSnap.quotas) updatedSnap.quotas = []
        const sorted = [...updatedSnap.quotas].sort((a, b) => {
          // Exhausted first
          if (a.is_exhausted && !b.is_exhausted) return -1
          if (!a.is_exhausted && b.is_exhausted) return 1
          // Then by percentage (lowest remaining first)
          const aVal = showUsedMetric ? 100 - a.percent_remaining : a.percent_remaining
          const bVal = showUsedMetric ? 100 - b.percent_remaining : b.percent_remaining
          return aVal - bVal
        })
        return { ...updatedSnap, quotas: sorted }
      })
      .sort((a, b) => {
        // Sort providers by their most critical quota
        const aMin = Math.min(
          ...(a.quotas?.map((q) =>
            showUsedMetric ? 100 - q.percent_remaining : q.percent_remaining
          ) || [100])
        )
        const bMin = Math.min(
          ...(b.quotas?.map((q) =>
            showUsedMetric ? 100 - q.percent_remaining : q.percent_remaining
          ) || [100])
        )
        // Exhausted providers first
        const aExhausted = a.quotas?.some((q) => q.is_exhausted) || false
        const bExhausted = b.quotas?.some((q) => q.is_exhausted) || false
        if (aExhausted && !bExhausted) return -1
        if (!aExhausted && bExhausted) return 1
        return aMin - bMin
      })

    sortedSnapshots.forEach((snap) => {
      if (!snap.is_available) {
        pushRow(snap.name, '-', '-', 'Not Available / Error')
        return
      }

      if (!snap.quotas || snap.quotas.length === 0) {
        pushRow(snap.name, '-', '-', snap.last_error || 'No quota info')
        return
      }

      // Group identical quotas by (percent_remaining, reset_text, is_exhausted, quota_type)
      const groups: {
        modelKeys: Set<string>
        pct: number
        resetText: string
        isExhausted: boolean
        resetsAt?: string
        quotaTypes: Set<string>
      }[] = []
      for (const q of snap.quotas) {
        const key = `${q.percent_remaining}|${q.reset_text}|${q.is_exhausted}|${q.quota_type}`
        const existing = groups.find(
          (g) =>
            `${g.pct}|${g.resetText}|${g.isExhausted}|${g.quotaTypes.values().next().value}` === key
        )
        if (existing) {
          existing.modelKeys.add(q.model_key || '-')
          existing.quotaTypes.add(q.quota_type || '')
        } else {
          groups.push({
            modelKeys: new Set([q.model_key || '-']),
            pct: q.percent_remaining,
            resetText: q.reset_text,
            isExhausted: q.is_exhausted || false,
            resetsAt: q.resets_at,
            quotaTypes: new Set([q.quota_type || '']),
          })
        }
      }

      groups.forEach((g, i) => {
        let providerCell = ''
        if (i === 0) {
          let color = ''
          switch (snap.provider_id) {
            case 'antigravity':
              color = '\x1b[36m'
              break // Cyan
            case 'opencode':
              color = '\x1b[32m'
              break // Green
            case 'codex':
              color = '\x1b[35m'
              break // Magenta
            case 'claude':
              color = '\x1b[33m'
              break // Yellow
            case 'copilot':
              color = '\x1b[34m'
              break // Blue
          }
          providerCell = color ? `${color}${snap.name}\x1b[0m` : snap.name
        }
        let modelLabel = [...g.modelKeys].sort().join(' & ')
        const qTypes = [...g.quotaTypes].filter((t) => t && t !== 'model_specific')

        if (modelLabel === '-') {
          if (qTypes.length > 0) {
            modelLabel = qTypes.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')
          }
        } else {
          if (qTypes.length > 0) {
            modelLabel += ` (${qTypes.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')})`
          }
        }

        const value = g.pct
        const displayValue = showUsedMetric ? Math.max(0, 100 - value) : value
        let pct = `${displayValue.toFixed(2)}%`

        // If exhausted, force red regardless of percentage
        if (g.isExhausted) {
          pct = `\x1b[31m${pct}\x1b[0m` // Red
        } else if (showUsedMetric) {
          // For used: higher is worse (red), lower is better (green)
          if (displayValue >= 80) {
            pct = `\x1b[31m${pct}\x1b[0m` // Red
          } else if (displayValue >= 50) {
            pct = `\x1b[33m${pct}\x1b[0m` // Yellow
          } else {
            pct = `\x1b[32m${pct}\x1b[0m` // Green
          }
        } else {
          // For remaining: higher is better (green), lower is worse (red)
          if (displayValue >= 50) {
            pct = `\x1b[32m${pct}\x1b[0m` // Green
          } else if (displayValue >= 20) {
            pct = `\x1b[33m${pct}\x1b[0m` // Yellow
          } else {
            pct = `\x1b[31m${pct}\x1b[0m` // Red
          }
        }
        let displayReset = g.resetText
        if (showAbsoluteTime && lastRefreshed) {
          if (g.resetsAt) {
            const dateStr = new Date(g.resetsAt).toLocaleString()
            if (displayReset.includes('Exhausted — ')) {
              displayReset = displayReset.replace(/Exhausted — .*/, `Exhausted until ${dateStr}`)
            } else if (displayReset.includes('(Resets on ')) {
              displayReset = displayReset.replace(/\(Resets on [^)]+\)/, `(Resets at ${dateStr})`)
            } else if (displayReset.includes('(Resets in ')) {
              displayReset = displayReset.replace(/\(Resets in [^)]+\)/, `(Resets at ${dateStr})`)
            } else if (displayReset.includes('Resets in ')) {
              displayReset = displayReset.replace(/Resets in .*/, `Resets at ${dateStr}`)
            } else if (displayReset.includes('Refreshes in ')) {
              displayReset = displayReset.replace(/Refreshes in .*/, `Refreshes at ${dateStr}`)
            }
          } else if (!displayReset.match(/on \d{4}-\d{2}-\d{2}/)) {
            displayReset = formatAbsoluteTime(displayReset, lastRefreshed)
          }
        } else if (!showAbsoluteTime && lastRefreshed) {
          if (g.resetsAt && displayReset.match(/\(Resets on \d{4}-\d{2}-\d{2}\)/)) {
            const diffMs = new Date(g.resetsAt).getTime() - lastRefreshed.getTime()
            if (diffMs > 0) {
              const d = Math.floor(diffMs / (1000 * 60 * 60 * 24))
              const h = Math.floor((diffMs / (1000 * 60 * 60)) % 24)
              const m = Math.floor((diffMs / (1000 * 60)) % 60)
              let relStr = ''
              if (d > 0) relStr += `${d}d `
              if (h > 0 || d > 0) relStr += `${h}h `
              relStr += `${m}m`
              displayReset = displayReset.replace(
                /\(Resets on \d{4}-\d{2}-\d{2}\)/,
                `(Resets in ${relStr.trim()})`
              )
            }
          }
        }

        let highlightColor = ''
        if (g.isExhausted) {
          highlightColor = '\x1b[31m' // Red
        } else if (showUsedMetric) {
          if (displayValue >= 80) highlightColor = '\x1b[31m'
          else if (displayValue >= 50) highlightColor = '\x1b[33m'
          else highlightColor = '\x1b[32m'
        } else {
          if (displayValue >= 50) highlightColor = '\x1b[32m'
          else if (displayValue >= 20) highlightColor = '\x1b[33m'
          else highlightColor = '\x1b[31m'
        }

        const timeRegex = /(\b\d+d\s*(?:\d+h)?\s*(?:\d+m)?\b|\b\d+h\s*(?:\d+m)?\b|\b\d+m\b)/g
        const moneyRegex = /(\$\d+\.\d+(?:\s*\/\s*\$\d+\.\d+)?)/g

        displayReset = displayReset.replace(timeRegex, `${highlightColor}$1\x1b[0m`)
        displayReset = displayReset.replace(moneyRegex, `${highlightColor}$1\x1b[0m`)

        pushRow(providerCell, modelLabel, pct, displayReset)
      })
    })

    return table.toString()
  }

  const frameWidth = Math.max(8, terminalColumns - 4)
  const frameLine = '─'.repeat(Math.max(0, frameWidth - 2))

  if (showSettings) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="#00ADB5"
        width={Math.max(16, Math.min(80, terminalColumns - 4))}
        paddingX={2}
      >
        <Text bold color="#00ADB5">
          🔧 QMON DASHBOARD SETTINGS
        </Text>
        <Text dimColor wrap="wrap">
          Use Arrow Keys to navigate, Space/Enter to toggle, Esc/S to exit.
        </Text>

        <Box flexDirection="column" marginTop={1} paddingLeft={1} marginBottom={1}>
          {settingsItems.map((item, idx) => {
            const isSelected = idx === selectedSettingIndex
            const prefix = isSelected ? '👉 ' : '   '

            let displayValue: React.ReactNode = null
            if (item.type === 'metric' || item.type === 'time') {
              displayValue = (
                <Text bold={isSelected} color={isSelected ? '#00ADB5' : undefined}>
                  [ {item.value} ]
                </Text>
              )
            } else {
              displayValue = item.value ? (
                <Text color="green">[x] Enabled</Text>
              ) : (
                <Text dimColor>[ ] Disabled</Text>
              )
            }

            return (
              <Box key={idx}>
                <Text bold={isSelected} color={isSelected ? '#00ADB5' : undefined}>
                  {prefix}
                  {item.label}:{' '}
                </Text>
                {displayValue}
              </Box>
            )
          })}
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" paddingX={2}>
      <Text bold color="#00ADB5">
        ╭{frameLine}╮
      </Text>
      <Box flexDirection="row">
        <Text bold color="#00ADB5">
          │{' '}
        </Text>
        <Text bold>📊 QMON QUOTA DASHBOARD</Text>
      </Box>
      <Box flexDirection="row">
        <Text bold color="#00ADB5">
          │{' '}
        </Text>
        <Text dimColor>
          Last updated: {lastRefreshed ? lastRefreshed.toLocaleTimeString() : '...'}
        </Text>
      </Box>
      <Box flexDirection="row">
        <Text bold color="#00ADB5">
          │{' '}
        </Text>
      </Box>

      {error ? (
        <Box flexDirection="row">
          <Text bold color="#00ADB5">
            │{' '}
          </Text>
          <Text color="red">{error}</Text>
        </Box>
      ) : loading && snapshots.length === 0 ? (
        <Box flexDirection="row">
          <Text bold color="#00ADB5">
            │{' '}
          </Text>
          <Text color="yellow">Loading data...</Text>
        </Box>
      ) : (
        <>
          {buildTable()
            .split('\n')
            .map((line, idx) => (
              <Box key={idx} flexDirection="row">
                <Text bold color="#00ADB5">
                  │{' '}
                </Text>
                <Text>{line}</Text>
              </Box>
            ))}
        </>
      )}

      <Box flexDirection="row">
        <Text bold color="#00ADB5">
          │{' '}
        </Text>
      </Box>
      <Box flexDirection="row">
        <Text bold color="#00ADB5">
          │{' '}
        </Text>
        <Text dimColor>
          {loading && snapshots.length > 0
            ? 'Refreshing data...'
            : "(Auto-refreshing every 30s. Press 'R' to refresh manually)"}
        </Text>
      </Box>
      <Box flexDirection="row">
        <Text bold color="#00ADB5">
          │{' '}
        </Text>
        <Text dimColor>
          {
            "(Press 'S' to open settings, 'U' to toggle Used/Remaining, 'T' to toggle Time, Ctrl+C to exit)"
          }
        </Text>
      </Box>
      <Box flexDirection="row">
        <Text bold color="#00ADB5">
          │{' '}
        </Text>
      </Box>
      <Text bold color="#00ADB5">
        ╰{frameLine}╯
      </Text>
    </Box>
  )
}
