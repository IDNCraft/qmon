/** @jsxImportSource @opentui/react */
import React, { useEffect, useState } from 'react'

import { loadConfig } from './config'
import { Dashboard } from './components/Dashboard'
import { Login } from './components/Login'

export function App() {
  const [hasConfig, setHasConfig] = useState(false)
  useEffect(() => {
    const config = loadConfig()
    if (config && config.token && config.baseUrl) {
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
      {!hasConfig ? <Login onLogin={handleLogin} /> : <Dashboard onLogout={handleLogout} />}
    </box>
  )
}
