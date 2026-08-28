import type { QuotaSnapshot } from '../../api'

import { THEME } from '../ui'

const PROVIDER_COLOR: Record<string, string> = {
  antigravity: THEME.accent,
  opencode: THEME.success,
  codex: '#C084FC', // purple so it doesn't clash with exhausted red
  claude: THEME.warning,
  copilot: '#5B8DEF',
}

export interface QuotaCell {
  provider: string
  providerId: string
  providerColor?: string
  model: string
  metric: string
  metricValue: number
  metricColor?: string
  status: string
  statusSegments: { text: string; color?: string }[]
  isExhausted: boolean
}

function formatAbsoluteTime(text: string, referenceDate: Date): string {
  const durationMatches = [...text.matchAll(/\d{1,3}[dhm]/g)]
  const firstMatch = durationMatches[0]
  const lastMatch = durationMatches.at(-1)
  if (
    !firstMatch ||
    !lastMatch ||
    firstMatch.index === undefined ||
    lastMatch.index === undefined
  ) {
    return text
  }

  const durationStart = firstMatch.index
  const durationEnd = lastMatch.index + lastMatch[0].length
  const days = durationMatches
    .filter((match) => match[0].endsWith('d'))
    .reduce((total, match) => total + Number.parseInt(match[0], 10), 0)
  const hours = durationMatches
    .filter((match) => match[0].endsWith('h'))
    .reduce((total, match) => total + Number.parseInt(match[0], 10), 0)
  const minutes = durationMatches
    .filter((match) => match[0].endsWith('m'))
    .reduce((total, match) => total + Number.parseInt(match[0], 10), 0)
  const ms = ((days * 24 + hours) * 60 + minutes) * 60 * 1000
  const dateStr = new Date(referenceDate.getTime() + ms).toLocaleString()

  if (text.includes('Exhausted — ')) {
    return `Exhausted until ${dateStr}`
  }

  const beforeDuration = text.slice(0, durationStart)
  const replacement = beforeDuration.endsWith('in ')
    ? `${text.slice(0, durationStart - 3)}at ${dateStr}`
    : `${beforeDuration}${dateStr}`
  return `${replacement}${text.slice(durationEnd)}`
}

export function buildCells(
  snapshots: QuotaSnapshot[],
  hiddenProviders: Set<string>,
  showUsedMetric: boolean,
  showAbsoluteTime: boolean,
  lastRefreshed: Date | null
): QuotaCell[] {
  const visibleSnapshots = snapshots.filter((snap) => !hiddenProviders.has(snap.name))
  const cells: QuotaCell[] = []

  const sortedSnapshots = visibleSnapshots
    .map((snap) => {
      const updatedSnap = { ...snap }
      if (updatedSnap.provider_id.toLowerCase() === 'opencode') {
        updatedSnap.name = updatedSnap.name.replace(/opencode/i, 'OpenCode Go')
      }
      if (!updatedSnap.quotas) updatedSnap.quotas = []
      const sorted = updatedSnap.quotas.toSorted((a, b) => {
        if (a.is_exhausted && !b.is_exhausted) return -1
        if (!a.is_exhausted && b.is_exhausted) return 1
        const aVal = showUsedMetric ? 100 - a.percent_remaining : a.percent_remaining
        const bVal = showUsedMetric ? 100 - b.percent_remaining : b.percent_remaining
        return aVal - bVal
      })
      return { ...updatedSnap, quotas: sorted }
    })
    .toSorted((a, b) => {
      const getSortGroup = (snapshot: QuotaSnapshot) => {
        if (!snapshot.is_available || !snapshot.quotas?.length) return 2
        return snapshot.quotas.some((q) => q.is_exhausted) ? 1 : 0
      }
      const groupDifference = getSortGroup(a) - getSortGroup(b)
      if (groupDifference !== 0) return groupDifference
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })

  for (const snap of sortedSnapshots) {
    const providerColor = PROVIDER_COLOR[snap.provider_id]

    if (!snap.is_available) {
      cells.push({
        provider: snap.name,
        providerId: snap.provider_id,
        providerColor,
        model: '-',
        metric: '-',
        metricValue: 0,
        status: 'Not Available / Error',
        statusSegments: [{ text: 'Not Available / Error', color: THEME.danger }],
        isExhausted: false,
      })
      continue
    }

    if (!snap.quotas || snap.quotas.length === 0) {
      const status = snap.last_error || 'No quota info'
      cells.push({
        provider: snap.name,
        providerId: snap.provider_id,
        providerColor,
        model: '-',
        metric: '-',
        metricValue: 0,
        status,
        statusSegments: [{ text: status }],
        isExhausted: false,
      })
      continue
    }

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
        existing.modelKeys.add(q.model_key ?? '-')
        existing.quotaTypes.add(q.quota_type ?? '')
      } else {
        groups.push({
          modelKeys: new Set([q.model_key ?? '-']),
          pct: q.percent_remaining,
          resetText: q.reset_text,
          isExhausted: q.is_exhausted ?? false,
          resetsAt: q.resets_at,
          quotaTypes: new Set([q.quota_type ?? '']),
        })
      }
    }

    for (const [i, g] of groups.entries()) {
      const provider = i === 0 ? snap.name : ''
      let modelLabel = [...g.modelKeys].toSorted().join(' & ')
      const qTypes = [...g.quotaTypes].filter((t) => t && t !== 'model_specific')

      if (modelLabel === '-') {
        if (qTypes.length > 0) {
          modelLabel = qTypes.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')
        }
      } else if (qTypes.length > 0) {
        modelLabel += ` (${qTypes.map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')})`
      }

      const value = g.pct
      const displayValue = showUsedMetric ? Math.max(0, 100 - value) : value
      const pctText = `${displayValue.toFixed(2)}%`

      let metricColor: string
      if (g.isExhausted) {
        metricColor = THEME.danger
      } else if (showUsedMetric) {
        metricColor =
          displayValue >= 80 ? THEME.danger : displayValue >= 50 ? THEME.warning : THEME.success
      } else {
        metricColor =
          displayValue >= 50 ? THEME.success : displayValue >= 20 ? THEME.warning : THEME.danger
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
        } else if (!/on \d{4}-\d{2}-\d{2}/.test(displayReset)) {
          displayReset = formatAbsoluteTime(displayReset, lastRefreshed)
        }
      } else if (
        !showAbsoluteTime &&
        lastRefreshed &&
        g.resetsAt &&
        /\(Resets on \d{4}-\d{2}-\d{2}\)/.test(displayReset)
      ) {
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

      let highlightColor: string
      if (g.isExhausted) {
        highlightColor = THEME.danger
      } else if (showUsedMetric) {
        highlightColor =
          displayValue >= 80 ? THEME.danger : displayValue >= 50 ? THEME.warning : THEME.success
      } else {
        highlightColor =
          displayValue >= 50 ? THEME.success : displayValue >= 20 ? THEME.warning : THEME.danger
      }

      const highlightRegex = /\b\d{1,3}[dhm]\b|\$\d+\.\d+|\$\d+/g

      const statusSegments: { text: string; color?: string }[] = []
      let lastIndex = 0
      let match: RegExpExecArray | null
      highlightRegex.lastIndex = 0
      while ((match = highlightRegex.exec(displayReset)) !== null) {
        if (match.index > lastIndex) {
          statusSegments.push({ text: displayReset.slice(lastIndex, match.index) })
        }
        statusSegments.push({ text: match[0], color: highlightColor })
        lastIndex = match.index + match[0].length
      }
      if (lastIndex < displayReset.length) {
        statusSegments.push({ text: displayReset.slice(lastIndex) })
      }
      if (statusSegments.length === 0) statusSegments.push({ text: displayReset })

      cells.push({
        provider,
        providerId: snap.provider_id,
        providerColor: i === 0 ? providerColor : undefined,
        model: modelLabel,
        metric: pctText,
        metricValue: displayValue,
        metricColor,
        status: displayReset,
        statusSegments,
        isExhausted: g.isExhausted,
      })
    }
  }

  return cells
}
