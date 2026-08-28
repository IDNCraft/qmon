/** @jsxImportSource @opentui/react */
import { TextAttributes } from '@opentui/core'
import React from 'react'

import { Badge, Card, THEME } from '../ui'
import type { QuotaCell } from './QuotaCells'

interface Props {
  cell: QuotaCell
  isAvailable: boolean
  width: number
  paddingX?: number
  paddingY?: number
}

export function QuotaCard({ cell, isAvailable, width, paddingX, paddingY }: Props) {
  return (
    <Card
      width={width}
      paddingX={paddingX}
      paddingY={paddingY}
      padding={paddingX === undefined && paddingY === undefined ? 1 : undefined}
      borderColor={cell.isExhausted ? THEME.danger : cell.providerColor || THEME.border}
      marginBottom={0}
    >
      <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
        {cell.model && cell.model !== '-' ? (
          <text selectable={false} attributes={TextAttributes.DIM}>{cell.model}</text>
        ) : (
          <text selectable={false} />
        )}
        {!isAvailable ? (
          <Badge label="Error" color={THEME.danger} />
        ) : (
          <Badge label="Health" color={THEME.success} />
        )}
      </box>

      <box flexDirection="row" alignItems="flex-end" marginBottom={1}>
        <text selectable={false} attributes={TextAttributes.BOLD} fg={cell.metricColor}>
          {cell.metric}
        </text>
      </box>

      <box flexDirection="row" height={1} marginBottom={1}>
        <box width="100%" backgroundColor={THEME.border}>
          <box width={`${cell.metricValue}%`} height={1} backgroundColor={cell.metricColor} />
        </box>
      </box>

      <text selectable={false} attributes={TextAttributes.DIM}>
        {cell.statusSegments.map((seg, i) => (
          <span key={i} fg={seg.color}>
            {seg.text}
          </span>
        ))}
      </text>
    </Card>
  )
}
