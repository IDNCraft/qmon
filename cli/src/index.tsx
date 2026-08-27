import { render } from 'ink'
import React from 'react'

import { App } from './App'
import { loginWithPrompt, runAuthFlow, runLogoutFlow } from './auth'
import { clearConfig, loadConfig } from './config'
import { startSidecar, stopSidecar } from './sidecar'

const args = process.argv.slice(2)

async function executeWithLogin<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err: any) {
    if (err.message?.includes('Not logged in')) {
      console.log(`\n\x1b[33m➜ Login required. Let's set that up first.\x1b[0m`)
      await loginWithPrompt()
      return await fn()
    }
    throw err
  }
}

async function main() {
  // Register process termination handlers to guarantee sidecar cleanup
  process.on('exit', () => stopSidecar())
  process.on('SIGINT', () => {
    stopSidecar()
    process.exit(0)
  })
  process.on('SIGTERM', () => {
    stopSidecar()
    process.exit(0)
  })

  if (args.length === 1 && (args[0] === '-h' || args[0] === '--help')) {
    console.log(`
\x1b[1m\x1b[36mQmon CLI - Command Reference\x1b[0m

\x1b[33mUsage:\x1b[0m
  qmon [command]

\x1b[33mCommands:\x1b[0m
  \x1b[32mqmon\x1b[0m                                Open the Qmon Quota Dashboard
  \x1b[32mqmon login <provider>\x1b[0m               Login to a provider (antigravity, claude, codex, copilot)
  \x1b[32mqmon logout\x1b[0m                          Logout of current Qmon account
  \x1b[32mqmon logout <provider> [account]\x1b[0m    Logout of a specific provider account
`)
    process.exit(0)
  }

  if (args[0] === 'login') {
    if (!args[1]) {
      console.log(`\x1b[31mError: Provider not specified.\x1b[0m\n`)
      console.log(`\x1b[33mDid you mean:\x1b[0m`)
      console.log(`  qmon login antigravity`)
      console.log(`  qmon login claude`)
      console.log(`  qmon login codex`)
      console.log(`  qmon login copilot`)
      console.log(`  qmon login opencode\n`)
      process.exit(1)
    }

    const provider = args[1]
    executeWithLogin(async () => {
      const config = loadConfig()
      if (config) {
        await startSidecar(config.baseUrl).catch(() => {})
      }
      await runAuthFlow(provider)
      stopSidecar()
      process.exit(0)
    }).catch((err: any) => {
      console.error(`\x1b[31mError: ${err.message}\x1b[0m`)
      process.exit(1)
    })
  } else if (args[0] === 'logout') {
    if (!args[1]) {
      console.log(`\n\x1b[33m⏳ Logging out of Qmon account...\x1b[0m`)
      clearConfig()
      console.log(`\x1b[32m✅ Logged out. Credentials cleared.\x1b[0m\n`)
      process.exit(0)
    }

    const provider = args[1]
    const accountName = args.length > 2 ? args.slice(2).join(' ') : ''
    executeWithLogin(async () => {
      const config = loadConfig()
      if (config) {
        await startSidecar(config.baseUrl).catch(() => {})
      }
      await runLogoutFlow(provider, accountName)
      stopSidecar()
      process.exit(0)
    }).catch((err: any) => {
      console.error(`\x1b[31mError: ${err.message}\x1b[0m`)
      process.exit(1)
    })
  } else {
    const config = loadConfig()
    if (config) {
      await startSidecar(config.baseUrl).catch((err) => {
        console.error(`\x1b[31mFailed to start built-in API: ${err.message}\x1b[0m`)
      })
    }
    render(<App />)
  }
}

main().catch((err) => {
  console.error(`\x1b[31mFatal error: ${err.message}\x1b[0m`)
  process.exit(1)
})
