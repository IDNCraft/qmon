import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import React, { useEffect, useState } from 'react'

import { saveConfig } from '../config'
import { startSidecar } from '../sidecar'

interface Props {
  onLogin: () => void
}

export function Login({ onLogin }: Props) {
  const url = 'http://localhost:8080'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState(1) // Step 1: Email, 2: Password, 3: Reset Email, 4: Reset Password
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDefaultAdmin, setIsDefaultAdmin] = useState(false)
  const [emailAutofillTrigger, setEmailAutofillTrigger] = useState(0)
  const [passwordAutofillTrigger, setPasswordAutofillTrigger] = useState(0)

  const [resetEmail, setResetEmail] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetSuccess, setResetSuccess] = useState('')

  // Hook to handle Tab autofill and back navigation
  useInput((input, key) => {
    if (key.upArrow && step > 1) {
      setStep((prev) => prev - 1)
      setError('')
    } else if (key.escape && step > 1) {
      if (step === 3 || step === 4) {
        setStep(1) // Cancel reset mode
      } else {
        setStep((prev) => prev - 1)
      }
      setError('')
    } else if (input.toLowerCase() === 'r' && key.ctrl && isDefaultAdmin && step <= 2) {
      setStep(3) // Enter reset mode
      setError('')
      setResetSuccess('')
      setResetEmail('')
      setResetPassword('')
    } else if (key.tab && isDefaultAdmin && step <= 2) {
      if (step === 1 && 'cli@qmon.ai'.startsWith(email) && email !== 'cli@qmon.ai') {
        setEmail('cli@qmon.ai')
        setEmailAutofillTrigger((prev) => prev + 1)
      } else if (step === 2 && 'password'.startsWith(password) && password !== 'password') {
        setPassword('password')
        setPasswordAutofillTrigger((prev) => prev + 1)
      }
    }
  })

  const checkDefaultAdmin = async (targetUrl: string) => {
    try {
      const cleanUrl = targetUrl.replace(/\/+$/, '')
      if (cleanUrl.includes('localhost') || cleanUrl.includes('127.0.0.1')) {
        await startSidecar(cleanUrl).catch(() => {})
      }
      const res = await fetch(`${cleanUrl}/api/v1/app-config`)
      if (res.ok) {
        const data = (await res.json()) as any
        setIsDefaultAdmin(data.data?.is_default_admin === 'true')
      } else {
        setIsDefaultAdmin(false)
      }
    } catch (e) {
      setIsDefaultAdmin(false)
    }
  }

  useEffect(() => {
    checkDefaultAdmin(url)
  }, [])

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
        const res = await fetch(`${url}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })

        const data = (await res.json()) as any
        if (!res.ok) {
          throw new Error(data.message || 'Login failed')
        }

        saveConfig({ baseUrl: url, token: data.data.j_token })
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
        const res = await fetch(`${url}/api/v1/auth/reset-default`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_email: resetEmail, new_password: resetPassword }),
        })

        const data = (await res.json()) as any
        if (!res.ok) {
          throw new Error(data.message || 'Reset failed')
        }

        setResetSuccess(data.message || 'Success! Please login with your new credentials.')
        setStep(1)
        setIsDefaultAdmin(false)
        setEmail('')
        setPassword('')
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <Box flexDirection="column" padding={1} width={80}>
      {resetSuccess && (
        <Box marginBottom={1} paddingX={1} borderStyle="single" borderColor="#4CAF50">
          <Text color="#4CAF50" bold wrap="wrap">
            ✅ {resetSuccess}
          </Text>
        </Box>
      )}

      {/* Main Login Card */}
      {step < 3 ? (
        <Box
          borderStyle="round"
          borderColor="#00ADB5"
          flexDirection="column"
          paddingX={2}
          paddingY={1}
        >
          <Text bold color="#00ADB5">
            🔑 QMON CLI AUTHENTICATION
          </Text>
          <Text dimColor wrap="wrap">
            Connect to your self-hosted quota monitor
          </Text>

          <Box marginTop={1} flexDirection="column" paddingLeft={1}>
            {step > 1 && (
              <Box marginBottom={1}>
                <Text color="#4CAF50">✅ Email: </Text>
                <Text color="#EEEEEE">{email}</Text>
              </Box>
            )}

            {step === 1 && (
              <Box>
                <Text bold color="#EEEEEE">
                  ➜ Email:{' '}
                </Text>
                {isDefaultAdmin && 'cli@qmon.ai'.startsWith(email) ? (
                  <Box>
                    <TextInput
                      key={`email-${emailAutofillTrigger}`}
                      value={email}
                      onChange={setEmail}
                      onSubmit={handleSubmitEmail}
                      showCursor={false}
                    />
                    {'cli@qmon.ai'[email.length] ? (
                      <Box>
                        <Text inverse>{'cli@qmon.ai'[email.length]}</Text>
                        <Text dimColor>{'cli@qmon.ai'.slice(email.length + 1)}</Text>
                      </Box>
                    ) : (
                      <Text inverse> </Text>
                    )}
                  </Box>
                ) : (
                  <TextInput
                    value={email}
                    onChange={setEmail}
                    onSubmit={handleSubmitEmail}
                    placeholder="your@email.com"
                  />
                )}
              </Box>
            )}
            {step === 2 && (
              <Box flexDirection="column">
                <Box>
                  <Text bold color="#EEEEEE">
                    ➜ Password:{' '}
                  </Text>
                  {isDefaultAdmin && password.length === 0 ? (
                    <Box>
                      <TextInput
                        key={`password-${passwordAutofillTrigger}`}
                        value={password}
                        onChange={setPassword}
                        onSubmit={handleSubmitPassword}
                        mask="*"
                        showCursor={false}
                      />
                      <Text inverse>p</Text>
                      <Text dimColor>assword</Text>
                    </Box>
                  ) : (
                    <TextInput
                      key={`password-${passwordAutofillTrigger}`}
                      value={password}
                      onChange={setPassword}
                      onSubmit={handleSubmitPassword}
                      mask="*"
                      placeholder="password"
                    />
                  )}
                </Box>
                {loading && (
                  <Box marginTop={1}>
                    <Text color="#FFD369">⏳ Verifying credentials, please wait...</Text>
                  </Box>
                )}
              </Box>
            )}
          </Box>
          {error && (
            <Box marginTop={1} paddingX={1} borderStyle="single" borderColor="#FF2E93">
              <Text color="#FF2E93" bold wrap="wrap">
                ❌ Error: {error}
              </Text>
            </Box>
          )}
        </Box>
      ) : (
        <Box
          borderStyle="round"
          borderColor="#FFD369"
          flexDirection="column"
          paddingX={2}
          paddingY={1}
        >
          <Text bold color="#FFD369">
            🔄 RESET DEFAULT CREDENTIALS
          </Text>
          <Text dimColor wrap="wrap">
            Enter your new email and password to secure your account.
          </Text>

          <Box marginTop={1} flexDirection="column" paddingLeft={1}>
            {step > 3 && (
              <Box marginBottom={1}>
                <Text color="#4CAF50">✅ New Email: </Text>
                <Text color="#EEEEEE">{resetEmail}</Text>
              </Box>
            )}
            {step === 3 && (
              <Box>
                <Text bold color="#EEEEEE">
                  ➜ New Email:{' '}
                </Text>
                <TextInput
                  value={resetEmail}
                  onChange={setResetEmail}
                  onSubmit={handleSubmitResetEmail}
                  placeholder="my.new.email@example.com"
                />
              </Box>
            )}
            {step === 4 && (
              <Box flexDirection="column">
                <Box>
                  <Text bold color="#EEEEEE">
                    ➜ New Password:{' '}
                  </Text>
                  <TextInput
                    value={resetPassword}
                    onChange={setResetPassword}
                    onSubmit={handleSubmitResetPassword}
                    mask="*"
                    placeholder="strong password"
                  />
                </Box>
                {loading && (
                  <Box marginTop={1}>
                    <Text color="#FFD369">⏳ Updating credentials, please wait...</Text>
                  </Box>
                )}
              </Box>
            )}
          </Box>
          {error && (
            <Box marginTop={1} paddingX={1} borderStyle="single" borderColor="#FF2E93">
              <Text color="#FF2E93" bold wrap="wrap">
                ❌ Error: {error}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* Security Tip Card */}
      <Box
        marginTop={1}
        flexDirection="column"
        borderStyle="round"
        borderColor={isDefaultAdmin ? '#FF5722' : '#4CAF50'}
        paddingX={2}
        paddingY={1}
      >
        {isDefaultAdmin ? (
          <Box flexDirection="column">
            <Text bold color="#FF5722">
              ⚠️ SECURITY WARNING: DEFAULT CREDENTIALS IN USE
            </Text>
            <Box marginTop={1} flexDirection="column" paddingLeft={2}>
              <Text dimColor wrap="wrap">
                Your instance is currently using the default administrator login:
              </Text>
              <Box
                marginY={1}
                paddingX={1}
                borderStyle="single"
                borderColor="#393E46"
                flexDirection="column"
              >
                <Text color="#EEEEEE">
                  {' '}
                  • Email:{' '}
                  <Text bold color="#00ADB5">
                    cli@qmon.ai
                  </Text>
                </Text>
                <Text color="#EEEEEE">
                  {' '}
                  • Password:{' '}
                  <Text bold color="#00ADB5">
                    password
                  </Text>
                </Text>
              </Box>
              <Text color="#FFD369" wrap="wrap">
                👉 To protect your account, press{' '}
                <Text bold inverse>
                  {' '}
                  Ctrl + R{' '}
                </Text>{' '}
                to reset your credentials now, or manually run an UPDATE query in your SQLite
                database (storage/database.sqlite).
              </Text>
            </Box>
          </Box>
        ) : (
          <Box flexDirection="column">
            <Text bold color="#4CAF50">
              🛡️ SECURED CONNECTION
            </Text>
            <Box marginTop={1} paddingLeft={2} flexDirection="column">
              <Text dimColor wrap="wrap">
                Custom credentials detected. Default admin account is disabled.
              </Text>
              <Text color="green" wrap="wrap">
                • If hosting Qmon on a server, always ensure your account is protected with a strong
                password.
              </Text>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
}
