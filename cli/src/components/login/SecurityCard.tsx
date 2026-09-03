/** @jsxImportSource @opentui/react */
import { TextAttributes } from '@opentui/core'

import { Button, Card, THEME } from '@/components/ui'

interface Props {
  isDefaultAdmin: boolean
  onReset: () => void
  width: number
}

export function SecurityCard({ isDefaultAdmin, onReset, width }: Props) {
  return (
    <Card width={width} borderColor={isDefaultAdmin ? THEME.danger : THEME.success} padding={1}>
      {isDefaultAdmin ? (
        <box flexDirection="column">
          <text selectable={false} fg={THEME.danger} attributes={TextAttributes.BOLD}>
            Default credentials
          </text>
          <text selectable={false} attributes={TextAttributes.DIM} marginTop={1} marginBottom={1}>
            Your instance is using the default admin account:
          </text>
          <box
            border
            borderStyle="single"
            borderColor={THEME.border}
            paddingLeft={1}
            paddingRight={1}
            paddingTop={0}
            paddingBottom={0}
            marginBottom={1}
            flexDirection="column"
          >
            <text selectable={false}>
              Email: <span fg={THEME.accent}>cli@qmon.ai</span>
            </text>
            <text selectable={false} fg={THEME.muted}>
              Password hidden for security · use Tab to auto-fill
            </text>
          </box>
          <text selectable={false} attributes={TextAttributes.DIM} marginBottom={1}>
            Tab to auto-fill · Ctrl+R to reset
          </text>
          <Button label="Reset Credentials" color={THEME.danger} onClick={onReset} />
        </box>
      ) : (
        <box flexDirection="column">
          <text selectable={false} fg={THEME.success} attributes={TextAttributes.BOLD}>
            Secured connection
          </text>
          <text selectable={false} attributes={TextAttributes.DIM} marginTop={1}>
            Custom credentials detected. The default admin account is disabled.
          </text>
        </box>
      )}
    </Card>
  )
}
