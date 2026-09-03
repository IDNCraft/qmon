/** @jsxImportSource @opentui/react */
import { useEffect, useState } from 'react'

import { Dashboard } from '@/components/Dashboard'
import { Login } from '@/components/Login'
import { loadConfig } from '@/config'

export function App() {
  const [hasConfig, setHasConfig] = useState(false)
  useEffect(() => {
    const config = loadConfig()
    if (config?.token && config.baseUrl) {
      setHasConfig(true)
    }
  }, [])
  const handleLogin = () => {
    setHasConfig(true)
  }
  const handleLogout = () => {
    setHasConfig(false)
  }
  return (
    <box flexDirection="column" alignItems="center" paddingTop={1}>
      {hasConfig ? <Dashboard onLogout={handleLogout} /> : <Login onLogin={handleLogin} />}
    </box>
  )
}
