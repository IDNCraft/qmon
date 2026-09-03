/** @jsxImportSource @opentui/react */
import type { QuotaSnapshot } from '@/api'
import type { QuotaCell } from '@/components/quota/QuotaCells'
import { TextAttributes } from '@opentui/core'
import { useEffect, useMemo } from 'react'

import { QuotaCard } from '@/components/quota/QuotaCard'
import { buildCells } from '@/components/quota/QuotaCells'

interface Props {
  snapshots: QuotaSnapshot[]
  hiddenProviders: Set<string>
  showUsedMetric: boolean
  showAbsoluteTime: boolean
  lastRefreshed: Date | null
  isCompact: boolean
  compactLabelWidth: number
  compactStatusWidth: number
  desktopProviderWidth: number
  desktopModelWidth: number
  desktopMetricWidth: number
  desktopResetWidth: number
  viewportHeight?: number
  onOverflowChange?: (overflow: boolean) => void
}

export function QuotaGrid(props: Props) {
  const {
    snapshots,
    hiddenProviders,
    showUsedMetric,
    showAbsoluteTime,
    lastRefreshed,
    isCompact,
    compactLabelWidth,
    compactStatusWidth,
    desktopProviderWidth,
    desktopModelWidth,
    desktopMetricWidth,
    desktopResetWidth,
    viewportHeight,
    onOverflowChange,
  } = props

  const cells = useMemo(
    () => buildCells(snapshots, hiddenProviders, showUsedMetric, showAbsoluteTime, lastRefreshed),
    [snapshots, hiddenProviders, showUsedMetric, showAbsoluteTime, lastRefreshed]
  )

  const gap = 2
  const availableWidth = useMemo(
    () =>
      isCompact
        ? compactLabelWidth + compactStatusWidth
        : desktopProviderWidth + desktopModelWidth + desktopMetricWidth + desktopResetWidth,
    [
      isCompact,
      compactLabelWidth,
      compactStatusWidth,
      desktopProviderWidth,
      desktopModelWidth,
      desktopMetricWidth,
      desktopResetWidth,
    ]
  )
  // Card overhead: border (2) + horizontal padding (2) = 4 cells per card
  const cardOverhead = 4
  const cardWidth = useMemo(
    () => Math.max(18, Math.floor((availableWidth - gap - 2 * cardOverhead) / 2)),
    [availableWidth]
  )
  const fullWidth = useMemo(() => Math.max(18, availableWidth - cardOverhead), [availableWidth])

  // Group cells by provider
  const groups = useMemo(() => {
    const groups: {
      provider: string
      providerColor?: string
      isAvailable: boolean
      cells: QuotaCell[]
    }[] = []
    for (const cell of cells) {
      if (cell.provider) {
        const snapshot = snapshots.find((s) => s.provider_id === cell.providerId)
        groups.push({
          provider: cell.provider,
          providerColor: cell.providerColor,
          isAvailable: snapshot?.is_available ?? false,
          cells: [cell],
        })
      } else if (groups.length > 0) {
        const lastGroup = groups.at(-1)
        if (lastGroup) {
          lastGroup.cells.push(cell)
        }
      }
    }
    return groups
  }, [cells, snapshots])

  const totalRows = useMemo(
    () =>
      groups.reduce((sum, group) => {
        return sum + (isCompact ? group.cells.length : Math.ceil(group.cells.length / 2))
      }, 0),
    [groups, isCompact]
  )
  const estimatedContentHeight = useMemo(
    () => 12 * totalRows + 2 * groups.length - 1,
    [totalRows, groups.length]
  )

  const viewportHeightValue = viewportHeight ?? 0
  useEffect(() => {
    if (onOverflowChange) {
      onOverflowChange(viewportHeightValue > 0 && estimatedContentHeight > viewportHeightValue)
    }
  }, [estimatedContentHeight, viewportHeightValue, onOverflowChange])

  // Early return must stay below every hook: cells disappear when all
  // providers are hidden, and bailing out mid-component changes the hook
  // count between renders ("Rendered more hooks than during the previous
  // render").
  if (cells.length === 0) {
    return (
      <text selectable={false} attributes={TextAttributes.DIM}>
        No providers selected to display. Press 'S' to open settings.
      </text>
    )
  }

  return (
    <box flexDirection="column">
      {groups.map((group, groupIdx) => (
        <box key={groupIdx} flexDirection="column" marginTop={groupIdx === 0 ? 0 : 1}>
          <box flexGrow={1} marginBottom={1} paddingX={1} paddingY={0}>
            <text selectable={false} attributes={TextAttributes.BOLD} fg={group.providerColor}>
              {group.provider}
            </text>
          </box>
          {(() => {
            const rows: QuotaCell[][] = []
            if (isCompact) {
              for (let i = 0; i < group.cells.length; i++) {
                const cell = group.cells[i]
                if (cell) {
                  rows.push([cell])
                }
              }
            } else {
              for (let i = 0; i < group.cells.length; i += 2) {
                rows.push(group.cells.slice(i, i + 2))
              }
            }
            return (
              <box flexDirection="column">
                {rows.map((row, rowIdx) => (
                  <box key={rowIdx} flexDirection="row" gap={gap} marginTop={rowIdx === 0 ? 0 : 1}>
                    {row.map((cell, colIdx) => (
                      <QuotaCard
                        key={colIdx}
                        cell={cell}
                        isAvailable={group.isAvailable}
                        width={isCompact ? fullWidth : cardWidth}
                        paddingX={isCompact ? 0 : undefined}
                        paddingY={isCompact ? 1 : undefined}
                      />
                    ))}
                    {!isCompact && row.length < 2 && <box width={cardWidth} />}
                  </box>
                ))}
              </box>
            )
          })()}
        </box>
      ))}
    </box>
  )
}
