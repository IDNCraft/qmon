/** @jsxImportSource @opentui/react */
import { TextAttributes } from '@opentui/core'

import { TextInput } from '../TextInput'
import { Button, THEME } from '../ui'

interface Props {
  resetEmail: string
  setResetEmail: (value: string) => void
  resetPassword: string
  setResetPassword: (value: string) => void
  step: number
  loading: boolean
  focusedField: 'resetEmail' | 'resetPassword' | null
  onFocusField: (field: 'resetEmail' | 'resetPassword') => void
  onSubmitResetEmail: () => void
  onSubmitResetPassword: () => void
  onCancel: () => void
}

export function ResetForm({
  resetEmail,
  setResetEmail,
  resetPassword,
  setResetPassword,
  step,
  loading,
  focusedField,
  onFocusField,
  onSubmitResetEmail,
  onSubmitResetPassword,
  onCancel,
}: Props) {
  return (
    <>
      <text selectable={false} attributes={TextAttributes.DIM} marginBottom={1}>
        Enter your new email and password.
      </text>

      <box flexDirection="column" paddingLeft={1}>
        {step > 3 && (
          <box flexDirection="row" marginBottom={1}>
            <text selectable={false} fg={THEME.muted}>
              New Email:{' '}
            </text>
            <text selectable={false}>{resetEmail}</text>
          </box>
        )}

        {step === 3 && (
          <box
            flexDirection="row"
            onMouseDown={() => {
              onFocusField('resetEmail')
            }}
          >
            <text selectable={false} attributes={TextAttributes.BOLD} fg={THEME.warning} width={12}>
              New Email
            </text>
            <TextInput
              value={resetEmail}
              onChange={setResetEmail}
              onSubmit={onSubmitResetEmail}
              placeholder="my.new.email@example.com"
              focused={focusedField === 'resetEmail'}
              onMouseDown={() => {
                onFocusField('resetEmail')
              }}
            />
          </box>
        )}

        {step === 4 && (
          <box
            flexDirection="column"
            onMouseDown={() => {
              onFocusField('resetPassword')
            }}
          >
            <box flexDirection="row">
              <text
                selectable={false}
                attributes={TextAttributes.BOLD}
                fg={THEME.warning}
                width={12}
              >
                New Password
              </text>
              <TextInput
                value={resetPassword}
                onChange={setResetPassword}
                onSubmit={onSubmitResetPassword}
                focused={focusedField === 'resetPassword'}
                placeholder="strong password"
                maskChar="*"
                onMouseDown={() => {
                  onFocusField('resetPassword')
                }}
              />
            </box>
            {loading && (
              <box marginTop={1}>
                <text selectable={false} fg={THEME.warning}>
                  Updating credentials…
                </text>
              </box>
            )}
          </box>
        )}
      </box>

      <box flexDirection="row" gap={1} marginTop={1}>
        <Button label="Cancel" color={THEME.muted} onClick={onCancel} />
        {step === 3 && (
          <Button
            label="Continue"
            color={THEME.warning}
            onClick={onSubmitResetEmail}
            disabled={!resetEmail}
          />
        )}
        {step === 4 && (
          <Button
            label={loading ? 'Saving…' : 'Save'}
            color={THEME.warning}
            onClick={onSubmitResetPassword}
            disabled={!resetPassword || loading}
          />
        )}
      </box>
    </>
  )
}
