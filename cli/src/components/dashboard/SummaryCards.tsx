/** @jsxImportSource @opentui/react */
import type { QuotaSnapshot } from '@/api'
import { TextAttributes } from '@opentui/core'
import { useMemo } from 'react'

import { Card, THEME } from '@/components/ui'

interface Props {
  isCompact: boolean
  snapshots: QuotaSnapshot[]
  hiddenProviders: Set<string>
  showUsedMetric: boolean
  showAbsoluteTime: boolean
}

export function SummaryCards({
  isCompact,
  snapshots,
  hiddenProviders,
  showUsedMetric,
  showAbsoluteTime,
}: Props) {
  const visibleSnapshots = useMemo(
    () => snapshots.filter((s) => !hiddenProviders.has(s.name)),
    [snapshots, hiddenProviders]
  )
  const uniqueProviders = useMemo(
    () => [...new Set(visibleSnapshots.map((s) => s.name))],
    [visibleSnapshots]
  )
  const exhaustedCount = useMemo(
    () =>
      visibleSnapshots.reduce(
        (acc, s) => acc + (s.quotas?.filter((q) => q.is_exhausted).length || 0),
        0
      ),
    [visibleSnapshots]
  )
  const exhausted = visibleSnapshots.some((s) => s.quotas?.some((q) => q.is_exhausted))

  return (
    <box flexDirection={isCompact ? 'column' : 'row'} gap={1} marginTop={1}>
      {isCompact ? (
        <Card flexGrow={1} padding={1} paddingY={0} borderColor={THEME.border}>
          <text selectable={false} attributes={TextAttributes.DIM}>
            {uniqueProviders.length} providers · {exhaustedCount} exhausted ·{' '}
            {showUsedMetric ? 'Used %' : 'Remaining %'} ·{' '}
            {showAbsoluteTime ? 'Absolute' : 'Relative'}
          </text>
        </Card>
      ) : (
        <>
          <Card flexGrow={1} flexBasis={0} padding={1} paddingY={0} borderColor={THEME.border}>
            <text selectable={false} attributes={TextAttributes.DIM}>
              Providers
            </text>
            <text selectable={false} attributes={TextAttributes.BOLD} fg={THEME.accent}>
              {uniqueProviders.length}
            </text>
          </Card>
          <Card flexGrow={1} flexBasis={0} padding={1} paddingY={0} borderColor={THEME.border}>
            <text selectable={false} attributes={TextAttributes.DIM}>
              Exhausted
            </text>
            <text
              selectable={false}
              attributes={TextAttributes.BOLD}
              fg={exhausted ? THEME.danger : THEME.success}
            >
              {exhaustedCount}
            </text>
          </Card>
          <Card flexGrow={1} flexBasis={0} padding={1} paddingY={0} borderColor={THEME.border}>
            <text selectable={false} attributes={TextAttributes.DIM}>
              Display
            </text>
            <text selectable={false} attributes={TextAttributes.BOLD} fg={THEME.warning}>
              {showUsedMetric ? 'Used %' : 'Remaining %'} ·{' '}
              {showAbsoluteTime ? 'Absolute' : 'Relative'}
            </text>
          </Card>
        </>
      )}
    </box>
  )
}
