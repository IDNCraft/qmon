/** @jsxImportSource @opentui/react */
import { TextAttributes } from '@opentui/core'

import { THEME } from '@/components/ui'

interface Props {
  terminalColumns: number
}

export function Footer({ terminalColumns }: Props) {
  const shortcuts = [
    { key: 'R', label: 'Refresh' },
    { key: 'S', label: 'Settings' },
    { key: 'U', label: 'Metric' },
    { key: 'T', label: 'Time' },
    { key: '↑↓', label: 'Scroll' },
    { key: 'Ctrl+C', label: 'Exit' },
  ]
  const columns = terminalColumns < 50 ? 2 : terminalColumns < 80 ? 3 : 4
  const rows: { key: string; label: string }[][] = []
  for (let i = 0; i < shortcuts.length; i += columns) {
    rows.push(shortcuts.slice(i, i + columns))
  }

  return (
    <box flexDirection="column" paddingLeft={1}>
      {rows.map((row, rowIdx) => (
        <box key={rowIdx} flexDirection="row" gap={0} marginTop={rowIdx === 0 ? 0 : 0}>
          {row.map((item, colIdx) => (
            <box key={colIdx} flexDirection="row" gap={0} flexGrow={1}>
              <text selectable={false} attributes={TextAttributes.BOLD} fg={THEME.accent}>
                {item.key}
              </text>
              <text selectable={false} attributes={TextAttributes.DIM}>
                {` ${item.label}`}
              </text>
            </box>
          ))}
        </box>
      ))}
    </box>
  )
}
