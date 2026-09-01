/** @jsxImportSource @opentui/react */
import type { QuotaCell } from './QuotaCells'
import { TextAttributes } from '@opentui/core'

import { Badge, Card, THEME } from '../ui'

interface Props {
  cell: QuotaCell
  isAvailable: boolean
  width: number
  paddingX?: number
  paddingY?: number
}

export function QuotaCard({ cell, isAvailable, width, paddingX, paddingY }: Props) {
  // Compact cards drop horizontal padding; keep a small inset so content
  // never touches the border.
  const inset = paddingX === 0 ? 1 : 0

  return (
    <Card
      width={width}
      paddingX={paddingX}
      paddingY={paddingY}
      padding={paddingX === undefined && paddingY === undefined ? 1 : undefined}
      borderColor={cell.isExhausted ? THEME.danger : (cell.providerColor ?? THEME.border)}
      marginBottom={0}
    >
      <box flexDirection="column" paddingLeft={inset} paddingRight={inset} gap={1}>
        <box flexDirection="row" justifyContent="space-between">
          {cell.model && cell.model !== '-' ? (
            <text selectable={false} attributes={TextAttributes.DIM}>
              {cell.model}
            </text>
          ) : (
            <text selectable={false} />
          )}
          {isAvailable ? (
            <Badge label="Health" color={THEME.success} />
          ) : (
            <Badge label="Error" color={THEME.danger} />
          )}
        </box>

        <box flexDirection="row" alignItems="flex-end">
          <text selectable={false} attributes={TextAttributes.BOLD} fg={cell.metricColor}>
            {cell.metric}
          </text>
        </box>

        <box flexDirection="row" height={1}>
          <box flexGrow={1}>
            <box width="100%" backgroundColor={THEME.border}>
              <box width={`${cell.metricValue}%`} height={1} backgroundColor={cell.metricColor} />
            </box>
          </box>
        </box>

        <text selectable={false} attributes={TextAttributes.DIM}>
          {cell.statusSegments.map((seg, i) => (
            <span key={i} fg={seg.color}>
              {seg.text}
            </span>
          ))}
        </text>
      </box>
    </Card>
  )
}
