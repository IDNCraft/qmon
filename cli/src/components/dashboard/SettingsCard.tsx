/** @jsxImportSource @opentui/react */
import type { MarkdownLine } from '../../markdown'
import type { ReleaseInfo } from '../../update'
import { MouseEvent, RGBA, TextAttributes } from '@opentui/core'

import { renderMarkdownLines } from '../../markdown'
import { Badge, Card, THEME } from '../ui'

export interface SettingsItem {
  type: 'metric' | 'time' | 'provider' | 'checkUpdate'
  label: string
  value: string | boolean
}

export type SettingsRow =
  | { kind: 'section'; key: string; title: string; open: boolean }
  | { kind: 'item'; key: string; item: SettingsItem }
  | { kind: 'release'; key: string; version: string; open: boolean }
  | { kind: 'note'; key: string; line: MarkdownLine }

export function buildSettingsRows(
  items: SettingsItem[],
  releases: ReleaseInfo[],
  openSections: Set<string>,
  openReleases: Set<string>,
  wrapWidth: number
): SettingsRow[] {
  const rows: SettingsRow[] = []
  const sections: Array<{ title: string; items: SettingsItem[] }> = [
    { title: 'Display', items: items.filter((i) => i.type === 'metric' || i.type === 'time') },
    { title: 'Providers', items: items.filter((i) => i.type === 'provider') },
    { title: 'System', items: items.filter((i) => i.type === 'checkUpdate') },
  ]

  for (const section of sections) {
    const open = openSections.has(section.title)
    rows.push({ kind: 'section', key: section.title, title: section.title, open })
    if (open) {
      for (const item of section.items) {
        rows.push({ kind: 'item', key: `item:${item.label}`, item })
      }
    }
  }

  const notesOpen = openSections.has('Release Notes')
  rows.push({ kind: 'section', key: 'Release Notes', title: 'Release Notes', open: notesOpen })
  if (notesOpen) {
    if (releases.length === 0) {
      rows.push({
        kind: 'note',
        key: 'note:none',
        line: { text: 'No releases fetched yet.', bold: false, color: THEME.muted },
      })
    }
    for (const release of releases) {
      const open = openReleases.has(release.version)
      rows.push({
        kind: 'release',
        key: `release:${release.version}`,
        version: release.version,
        open,
      })
      if (open) {
        const lines = renderMarkdownLines(release.notes, wrapWidth)
        if (lines.length === 0) {
          rows.push({
            kind: 'note',
            key: `note:${release.version}:empty`,
            line: { text: 'No release notes published.', bold: false, color: THEME.muted },
          })
        }
        for (const [lineIndex, line] of lines.entries()) {
          rows.push({ kind: 'note', key: `note:${release.version}:${lineIndex}`, line })
        }
      }
    }
  }

  return rows
}

interface Props {
  rows: SettingsRow[]
  selectedIndex: number
  onSelect: (index: number) => void
  onToggle: (row: SettingsRow) => void
  width: number
}

export function SettingsCard({ rows, selectedIndex, onSelect, onToggle, width }: Props) {
  return (
    <Card
      title="Dashboard Settings"
      titleColor={THEME.accent}
      width={width}
      borderColor={THEME.accent}
      backgroundColor={RGBA.fromInts(30, 30, 30, 160)}
      onMouseDown={(e) => {
        e.stopPropagation()
      }}
    >
      <box marginBottom={1}>
        <text selectable={false} attributes={TextAttributes.DIM}>
          Arrows + Space/Enter to expand sections. Esc or S to close.
        </text>
      </box>

      <box flexDirection="column">
        {rows.map((row, index) => {
          const isSelected = index === selectedIndex
          const selected = isSelected ? THEME.selectedBg : undefined

          if (row.kind === 'section') {
            return (
              <box
                key={row.key}
                flexDirection="row"
                marginTop={index === 0 ? 0 : 1}
                paddingLeft={1}
                backgroundColor={selected}
                onMouseOver={() => {
                  onSelect(index)
                }}
                onMouseDown={(e: MouseEvent) => {
                  onToggle(row)
                  e.stopPropagation()
                }}
              >
                <text selectable={false} attributes={TextAttributes.BOLD} fg={THEME.accent}>
                  {`${row.open ? '▾' : '▸'} ${row.title}`}
                </text>
              </box>
            )
          }

          if (row.kind === 'release') {
            return (
              <box
                key={row.key}
                flexDirection="row"
                marginTop={1}
                paddingLeft={3}
                backgroundColor={selected}
                onMouseOver={() => {
                  onSelect(index)
                }}
                onMouseDown={(e: MouseEvent) => {
                  onToggle(row)
                  e.stopPropagation()
                }}
              >
                <text selectable={false} fg={isSelected ? THEME.accent : THEME.text}>
                  {`${row.open ? '▾' : '▸'} v${row.version}`}
                </text>
              </box>
            )
          }

          if (row.kind === 'note') {
            return (
              <box key={row.key} flexDirection="row" paddingLeft={5}>
                <text
                  selectable={false}
                  fg={row.line.color}
                  attributes={row.line.bold ? TextAttributes.BOLD : 0}
                >
                  {row.line.text}
                </text>
              </box>
            )
          }

          const { item } = row
          let displayValue: React.ReactNode = null
          if (item.type === 'metric' || item.type === 'time' || item.type === 'checkUpdate') {
            displayValue = (
              <Badge label={String(item.value)} color={isSelected ? THEME.accent : THEME.muted} />
            )
          } else {
            displayValue = item.value ? (
              <Badge label="Shown" color={THEME.success} />
            ) : (
              <Badge label="Hidden" color={THEME.muted} />
            )
          }

          return (
            <box
              key={row.key}
              flexDirection="row"
              justifyContent="space-between"
              alignItems="center"
              paddingLeft={3}
              paddingRight={1}
              backgroundColor={selected}
              onMouseOver={() => {
                onSelect(index)
              }}
              onMouseDown={(e: MouseEvent) => {
                onToggle(row)
                e.stopPropagation()
              }}
            >
              <box flexGrow={1} justifyContent="center">
                <text
                  selectable={false}
                  attributes={isSelected ? TextAttributes.BOLD : 0}
                  fg={isSelected ? THEME.accent : THEME.text}
                >
                  {item.label}
                </text>
              </box>
              {displayValue}
            </box>
          )
        })}
      </box>
    </Card>
  )
}
