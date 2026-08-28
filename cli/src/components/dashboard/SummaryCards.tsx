/** @jsxImportSource @opentui/react */
import { TextAttributes } from '@opentui/core'
import React, { useMemo } from 'react'

import type { QuotaSnapshot } from '../../api'
import { Card, THEME } from '../ui'

interface Props {
  isCompact: boolean
  snapshots: QuotaSnapshot[]
  showUsedMetric: boolean
  showAbsoluteTime: boolean
}

export function SummaryCards({ isCompact, snapshots, showUsedMetric, showAbsoluteTime }: Props) {
  const uniqueProviders = useMemo(() => Array.from(new Set(snapshots.map((s) => s.name))), [snapshots])
  const exhaustedCount = useMemo(
    () => snapshots.reduce((acc, s) => acc + (s.quotas?.filter((q) => q.is_exhausted).length || 0), 0),
    [snapshots]
  )
  const exhausted = snapshots.some((s) => s.quotas?.some((q) => q.is_exhausted))

  return (
    <box flexDirection={isCompact ? 'column' : 'row'} gap={1} marginTop={1}>
      {isCompact ? (
        <Card flexGrow={1} padding={1} paddingY={0} borderColor={THEME.border}>
          <text selectable={false} attributes={TextAttributes.DIM}>
            {uniqueProviders.length} providers · {exhaustedCount} exhausted · {showUsedMetric ? 'Used %' : 'Remaining %'} · {showAbsoluteTime ? 'Absolute' : 'Relative'}
          </text>
        </Card>
      ) : (
        <>
          <Card flexGrow={1} padding={1} paddingY={0} borderColor={THEME.border}>
            <text selectable={false} attributes={TextAttributes.DIM}>Providers</text>
            <text selectable={false} attributes={TextAttributes.BOLD} fg={THEME.accent}>
              {uniqueProviders.length}
            </text>
          </Card>
          <Card flexGrow={1} padding={1} paddingY={0} borderColor={THEME.border}>
            <text selectable={false} attributes={TextAttributes.DIM}>Exhausted</text>
            <text
              selectable={false}
              attributes={TextAttributes.BOLD}
              fg={exhausted ? THEME.danger : THEME.success}
            >
              {exhaustedCount}
            </text>
          </Card>
          <Card flexGrow={1} padding={1} paddingY={0} borderColor={THEME.border}>
            <text selectable={false} attributes={TextAttributes.DIM}>Display</text>
            <text selectable={false} attributes={TextAttributes.BOLD} fg={THEME.warning}>
              {showUsedMetric ? 'Used %' : 'Remaining %'} · {showAbsoluteTime ? 'Absolute' : 'Relative'}
            </text>
          </Card>
        </>
      )}
    </box>
  )
}
