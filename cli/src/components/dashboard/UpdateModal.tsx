/** @jsxImportSource @opentui/react */
import type { UpdateProgress } from '../../update'
import { RGBA, TextAttributes } from '@opentui/core'

import { Button, Card, THEME } from '../ui'

interface Props {
  progress: UpdateProgress
  updating: boolean
  error: string
  width: number
  onClose: () => void
  onRestart: () => void
}

export function UpdateModal({ progress, updating, error, width, onClose, onRestart }: Props) {
  const progressWidth = Math.max(12, Math.min(48, width - 10))
  const percentage = progress.total > 0 ? Math.round((progress.step / progress.total) * 100) : 0
  const barWidth = Math.max(
    1,
    Math.min(progressWidth, Math.floor((progressWidth * percentage) / 100))
  )
  const color = error ? THEME.danger : updating ? THEME.warning : THEME.success
  const title = updating ? 'Updating Qmon' : error ? 'Update failed' : 'Update complete'

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      backgroundColor={RGBA.fromValues(0, 0, 0, 0.7)}
      justifyContent="center"
      alignItems="center"
      onMouseDown={(event) => {
        event.stopPropagation()
      }}
    >
      <Card
        title={title}
        titleColor={color}
        width={width}
        borderColor={color}
        padding={2}
        onMouseDown={(event) => {
          event.stopPropagation()
        }}
      >
        <box flexDirection="column" gap={1}>
          <text selectable={false} fg={color} attributes={TextAttributes.BOLD}>
            {progress.label}
          </text>
          <box flexDirection="row" width={progressWidth} height={1} backgroundColor={THEME.border}>
            <box width={barWidth} height={1} backgroundColor={color} />
          </box>
          <text selectable={false} attributes={TextAttributes.DIM}>
            Step {progress.step}/{progress.total} ({percentage}%)
          </text>
          {error && (
            <text selectable={false} fg={THEME.danger}>
              {error}
            </text>
          )}
          {updating ? (
            <text selectable={false} attributes={TextAttributes.DIM}>
              Keep this terminal open until the update finishes.
            </text>
          ) : error ? (
            <Button label="Close" color={color} onClick={onClose} />
          ) : (
            <Button label="Restart Qmon" color={THEME.accent} onClick={onRestart} />
          )}
        </box>
      </Card>
    </box>
  )
}
