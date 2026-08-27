import { Box } from 'ink'
import React, { useEffect, useState } from 'react'

import { Dashboard } from './components/Dashboard'
import { Login } from './components/Login'
import { loadConfig } from './config'

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
    <Box>
      {!hasConfig ? <Login onLogin={handleLogin} /> : <Dashboard onLogout={handleLogout} />}
    </Box>
  )
}
