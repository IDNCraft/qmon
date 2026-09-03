/** @jsxImportSource @opentui/react */
import { TextAttributes } from '@opentui/core'

import { TextInput } from '@/components/TextInput'
import { Button, THEME } from '@/components/ui'

interface Props {
  email: string
  setEmail: (value: string) => void
  password: string
  setPassword: (value: string) => void
  step: number
  loading: boolean
  isDefaultAdmin: boolean
  focusedField: 'email' | 'password' | null
  onFocusField: (field: 'email' | 'password') => void
  emailSuggestion: string
  onSubmitEmail: () => void
  onSubmitPassword: () => void
  onBack: () => void
}

export function LoginForm({
  email,
  setEmail,
  password,
  setPassword,
  step,
  loading,
  isDefaultAdmin,
  focusedField,
  onFocusField,
  emailSuggestion,
  onSubmitEmail,
  onSubmitPassword,
  onBack,
}: Props) {
  return (
    <>
      <text selectable={false} attributes={TextAttributes.DIM} marginBottom={1}>
        Connect to http://localhost:8080
      </text>

      <box flexDirection="column" paddingLeft={1}>
        {step > 1 && (
          <box flexDirection="row" marginBottom={1}>
            <text selectable={false} fg={THEME.muted}>
              Email:{' '}
            </text>
            <text selectable={false}>{email}</text>
          </box>
        )}

        {step === 1 && (
          <box
            flexDirection="row"
            onMouseDown={() => {
              onFocusField('email')
            }}
          >
            <text selectable={false} attributes={TextAttributes.BOLD} fg={THEME.accent} width={10}>
              Email
            </text>
            <TextInput
              value={email}
              onChange={setEmail}
              onSubmit={onSubmitEmail}
              placeholder="your@email.com"
              focused={focusedField === 'email'}
              onMouseDown={() => {
                onFocusField('email')
              }}
            />
            {emailSuggestion && (
              <text selectable={false} attributes={TextAttributes.DIM}>
                {emailSuggestion}
              </text>
            )}
          </box>
        )}

        {step === 2 && (
          <box
            flexDirection="column"
            onMouseDown={() => {
              onFocusField('password')
            }}
          >
            <box flexDirection="row">
              <text
                selectable={false}
                attributes={TextAttributes.BOLD}
                fg={THEME.accent}
                width={10}
              >
                Password
              </text>
              <TextInput
                value={password}
                onChange={setPassword}
                onSubmit={onSubmitPassword}
                focused={focusedField === 'password'}
                placeholder={isDefaultAdmin ? 'password' : ''}
                maskChar="*"
                onMouseDown={() => {
                  onFocusField('password')
                }}
              />
            </box>
            {loading && (
              <box marginTop={1}>
                <text selectable={false} fg={THEME.warning}>
                  Verifying credentials…
                </text>
              </box>
            )}
          </box>
        )}
      </box>

      <box flexDirection="row" gap={1} marginTop={1}>
        {step > 1 && <Button label="Back" color={THEME.muted} onClick={onBack} />}
        {step === 1 && <Button label="Continue" onClick={onSubmitEmail} disabled={!email} />}
        {step === 2 && (
          <Button
            label={loading ? 'Logging in…' : 'Login'}
            onClick={onSubmitPassword}
            disabled={!password || loading}
          />
        )}
      </box>
    </>
  )
}
