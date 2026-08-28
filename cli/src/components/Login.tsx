/** @jsxImportSource @opentui/react */
import { TextAttributes } from '@opentui/core'
import { useKeyboard, useTerminalDimensions } from '@opentui/react'
import React, { useEffect, useState } from 'react'

import { fetchAppConfig, login, resetDefaultCredentials } from '../api'
import { saveConfig } from '../config'
import { startSidecar } from '../sidecar'
import { Card, THEME } from './ui'
import { LoginForm } from './login/LoginForm'
import { ResetForm } from './login/ResetForm'
import { SecurityCard } from './login/SecurityCard'

interface Props {
  onLogin: () => void
}

export function Login({ onLogin }: Props) {
  const url = 'http://localhost:8080'
  const { width: terminalColumns } = useTerminalDimensions()
  const maxCardWidth = Math.max(40, terminalColumns - 4)
  const cardWidth = Math.min(74, maxCardWidth)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState(1) // 1: Email, 2: Password, 3: Reset Email, 4: Reset Password
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDefaultAdmin, setIsDefaultAdmin] = useState(false)

  const [resetEmail, setResetEmail] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetSuccess, setResetSuccess] = useState('')
  const [focusedField, setFocusedField] = useState<'email' | 'password' | 'resetEmail' | 'resetPassword' | null>(null)

  const inResetMode = step >= 3

  useKeyboard((key) => {
    if ((key.name === 'up' || key.name === 'escape') && step > 1) {
      goBack()
    } else if (key.name === 'r' && key.ctrl && isDefaultAdmin && step <= 2) {
      enterResetMode()
    } else if (key.name === 'tab' && isDefaultAdmin && step <= 2) {
      if (step === 1 && 'cli@qmon.ai'.startsWith(email) && email !== 'cli@qmon.ai') {
        setEmail('cli@qmon.ai')
      } else if (step === 2 && 'password'.startsWith(password) && password !== 'password') {
        setPassword('password')
      }
    }
  })

  const checkDefaultAdmin = async (targetUrl: string, signal?: AbortSignal) => {
    try {
      const cleanUrl = targetUrl.replace(/\/+$/, '')
      if (cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1')) {
        await startSidecar(cleanUrl).catch(() => {})
      }
      const { isDefaultAdmin } = await fetchAppConfig(cleanUrl, signal)
      setIsDefaultAdmin(isDefaultAdmin === 'true')
    } catch (e) {
      if (signal?.aborted) return
      setIsDefaultAdmin(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    checkDefaultAdmin(url, controller.signal)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (step === 1) setFocusedField('email')
    else if (step === 2) setFocusedField('password')
    else if (step === 3) setFocusedField('resetEmail')
    else if (step === 4) setFocusedField('resetPassword')
  }, [step])

  const handleSubmitEmail = () => {
    if (email) {
      setStep(2)
      setError('')
    }
  }

  const handleSubmitPassword = async () => {
    if (password && !loading) {
      setLoading(true)
      setError('')
      try {
        const { token } = await login(email, password, url)
        saveConfig({ baseUrl: url, token })
        onLogin()
      } catch (err: any) {
        setError(err.message)
        setLoading(false)
      }
    }
  }

  const handleSubmitResetEmail = () => {
    if (resetEmail) {
      setStep(4)
      setError('')
    }
  }

  const handleSubmitResetPassword = async () => {
    if (resetPassword && !loading) {
      setLoading(true)
      setError('')
      try {
        const { message } = await resetDefaultCredentials(resetEmail, resetPassword, url)
        setResetSuccess(message || 'Success! Please login with your new credentials.')
        setStep(1)
        setIsDefaultAdmin(false)
        setEmail('')
        setPassword('')
        setResetEmail('')
        setResetPassword('')
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
  }

  const emailSuggestion =
    isDefaultAdmin && !inResetMode && 'cli@qmon.ai'.startsWith(email) && email !== 'cli@qmon.ai'
      ? 'cli@qmon.ai'.slice(email.length)
      : ''

  const enterResetMode = () => {
    setStep(3)
    setError('')
    setResetSuccess('')
    setResetEmail('')
    setResetPassword('')
  }

  const goBack = () => {
    if (inResetMode) {
      setStep(1)
      setError('')
    } else {
      setStep((prev) => Math.max(1, prev - 1))
      setError('')
    }
  }

  const title = inResetMode ? 'Reset Credentials' : 'Qmon Login'
  const titleColor = inResetMode ? THEME.warning : THEME.accent
  const borderColor = error ? THEME.danger : focusedField ? THEME.accent : THEME.border

  return (
    <box flexDirection="column" padding={1} alignItems="center">
      {resetSuccess && (
      <Card borderColor={THEME.success} marginBottom={1} width={cardWidth}>
          <text selectable={false} fg={THEME.success} attributes={TextAttributes.BOLD}>
            {resetSuccess}
          </text>
        </Card>
      )}

      <box flexDirection="column" gap={1}>
        <Card
          title={title}
          titleColor={titleColor}
          borderColor={borderColor}
          width={cardWidth}
          onMouseDown={() => setFocusedField((prev) => {
            if (prev) return prev
            if (step === 1) return 'email'
            if (step === 2) return 'password'
            if (step === 3) return 'resetEmail'
            return 'resetPassword'
          })}
        >
          {inResetMode ? (
            <ResetForm
              resetEmail={resetEmail}
              setResetEmail={setResetEmail}
              resetPassword={resetPassword}
              setResetPassword={setResetPassword}
              step={step}
              loading={loading}
              focusedField={
                focusedField === 'resetEmail'
                  ? 'resetEmail'
                  : focusedField === 'resetPassword'
                    ? 'resetPassword'
                    : null
              }
              onFocusField={(field) => setFocusedField(field)}
              onSubmitResetEmail={handleSubmitResetEmail}
              onSubmitResetPassword={handleSubmitResetPassword}
              onCancel={goBack}
            />
          ) : (
            <LoginForm
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              step={step}
              loading={loading}
              isDefaultAdmin={isDefaultAdmin}
              focusedField={
                focusedField === 'email'
                  ? 'email'
                  : focusedField === 'password'
                    ? 'password'
                    : null
              }
              onFocusField={(field) => setFocusedField(field)}
              emailSuggestion={emailSuggestion}
              onSubmitEmail={handleSubmitEmail}
              onSubmitPassword={handleSubmitPassword}
              onBack={goBack}
            />
          )}

          {error && (
            <box
              border
              borderStyle="single"
              borderColor={THEME.danger}
              paddingLeft={1}
              paddingRight={1}
              paddingTop={0}
              paddingBottom={0}
              marginTop={1}
            >
              <text selectable={false} fg={THEME.danger} attributes={TextAttributes.BOLD}>
                {error}
              </text>
            </box>
          )}
        </Card>

        <SecurityCard isDefaultAdmin={isDefaultAdmin} onReset={enterResetMode} width={cardWidth} />
      </box>
    </box>
  )
}
