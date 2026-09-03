/** @jsxImportSource @opentui/react */
import { TextAttributes } from '@opentui/core'
import { useEffect, useState } from 'react'

import { Card, THEME } from '@/components/ui'

const FRAMES = [
  [' ╭───╮ ', ' │   │ ', ' │ Q │ ', ' │   │ ', ' ╰───╯ '],
  [' ╱───╲ ', ' │   │ ', ' │ M │ ', ' │   │ ', ' ╲───╱ '],
  [' ╭───╮ ', ' │   │ ', ' │ O │ ', ' │   │ ', ' ╰───╯ '],
  [' ╱───╲ ', ' │   │ ', ' │ N │ ', ' │   │ ', ' ╲───╱ '],
]

interface Props {
  label?: string
}

export function LoadingScreen({ label = 'Loading' }: Props) {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((prev) => (prev + 1) % FRAMES.length)
    }, 180)
    return () => {
      clearInterval(interval)
    }
  }, [])

  const currentFrame = FRAMES[frame] ?? []

  return (
    <box flexGrow={1} justifyContent="center" alignItems="center" marginTop={1}>
      <Card width={32} borderColor={THEME.accent} padding={2}>
        <box flexDirection="column" alignItems="center" gap={1}>
          <text selectable={false} attributes={TextAttributes.BOLD} fg={THEME.accent}>
            QMON
          </text>
          <box flexDirection="column" alignItems="center" marginTop={1} marginBottom={1}>
            {currentFrame.map((line, i) => (
              <text selectable={false} key={i} attributes={TextAttributes.BOLD} fg={THEME.accent}>
                {line}
              </text>
            ))}
          </box>
          <text selectable={false} attributes={TextAttributes.DIM}>
            {label}…
          </text>
        </box>
      </Card>
    </box>
  )
}
