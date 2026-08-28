/** @jsxImportSource @opentui/react */
import { MouseEvent, RGBA, TextAttributes } from '@opentui/core'
import React from 'react'

import { Badge, Card, THEME } from '../ui'

export interface SettingsItem {
  type: 'metric' | 'time' | 'provider'
  label: string
  value: string | boolean
}

interface Props {
  items: SettingsItem[]
  selectedIndex: number
  onSelect: (index: number) => void
  onToggleMetric: () => void
  onToggleTime: () => void
  onToggleProvider: (label: string) => void
  width: number
}

export function SettingsCard({
  items,
  selectedIndex,
  onSelect,
  onToggleMetric,
  onToggleTime,
  onToggleProvider,
  width,
}: Props) {
  const toggle = (item: SettingsItem) => {
    if (item.type === 'metric') onToggleMetric()
    else if (item.type === 'time') onToggleTime()
    else if (item.type === 'provider') onToggleProvider(item.label)
  }

  const sections = [
    { title: 'Display', items: items.filter((i) => i.type === 'metric' || i.type === 'time') },
    { title: 'Providers', items: items.filter((i) => i.type === 'provider') },
  ].filter((s) => s.items.length > 0)

  let globalIndex = 0

  return (
    <Card
      title="Dashboard Settings"
      titleColor={THEME.accent}
      width={width}
      borderColor={THEME.accent}
      backgroundColor={RGBA.fromInts(30, 30, 30, 160)}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <box marginBottom={1}>
        <text selectable={false} attributes={TextAttributes.DIM}>
          Arrow keys + Space/Enter to toggle. Esc or S to close.
        </text>
      </box>

      <box flexDirection="column">
        {sections.map((section, sectionIdx) => (
          <box key={sectionIdx} flexDirection="column" marginTop={sectionIdx === 0 ? 0 : 1}>
            <box marginBottom={1}>
              <text selectable={false} attributes={TextAttributes.BOLD} fg={THEME.accent}>
                {section.title}
              </text>
            </box>
            {section.items.map((item) => {
              const idx = globalIndex++
              const isSelected = idx === selectedIndex

              let displayValue: React.ReactNode = null
              if (item.type === 'metric' || item.type === 'time') {
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
                  key={idx}
                  flexDirection="row"
                  justifyContent="space-between"
                  alignItems="center"
                  paddingLeft={1}
                  paddingRight={1}
                  paddingTop={0}
                  paddingBottom={0}
                  marginTop={idx === 0 ? 0 : 1}
                  backgroundColor={isSelected ? THEME.selectedBg : undefined}
                  onMouseOver={() => onSelect(idx)}
                  onMouseDown={(e: MouseEvent) => {
                    toggle(item)
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
        ))}
      </box>
    </Card>
  )
}
