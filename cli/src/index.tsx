/** @jsxImportSource @opentui/react */
import { createCliRenderer } from '@opentui/core'
import { createRoot } from '@opentui/react'

import { App } from '@/App'
import { runAuthFlow, runLogoutFlow, runResetLoginFlow, selectProviderInteractively } from '@/auth'
import { clearConfig, loadConfig } from '@/config'
import { startSidecar, stopSidecar } from '@/sidecar'
import { runUpdate, setRendererDestroy } from '@/update'
import packageJson from '../package.json' with { type: 'json' }

const args = process.argv.slice(2)
let activeRenderer: import('@opentui/core').CliRenderer | null = null

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function renderLoginUI(): Promise<void> {
  const config = loadConfig()
  if (config) {
    await startSidecar(config.baseUrl).catch(() => { })
  } else {
    await startSidecar('http://localhost:8080').catch(() => { })
  }
  activeRenderer = await createCliRenderer({ exitOnCtrlC: true })
  activeRenderer.on('destroy', () => {
    stopSidecar()
  })
  setRendererDestroy(() => {
    activeRenderer?.destroy()
  })
  const { Login } = await import('@/components/Login')
  return new Promise<void>((resolve) => {
    const renderer = activeRenderer
    if (!renderer) {
      resolve()
      return
    }
    createRoot(renderer).render(
      <Login
        onLogin={() => {
          renderer.destroy()
          activeRenderer = null
          resolve()
        }}
      />
    )
  })
}

async function executeWithLogin<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error: unknown) {
    if (getErrorMessage(error).includes('Not logged in')) {
      await renderLoginUI()
      return await fn()
    }
    throw error
  }
}

async function main() {
  // Register process termination handlers to guarantee sidecar cleanup
  process.on('exit', () => {
    stopSidecar()
  })
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
\u001B[1m\u001B[36mQmon CLI - Command Reference\u001B[0m

\u001B[33mUsage:\u001B[0m
  qmon [command]

\u001B[33mCommands:\u001B[0m
  \u001B[32mqmon\u001B[0m                                Open the Qmon Quota Dashboard
  \u001B[32mqmon version\u001B[0m                        Show the installed CLI version
  \u001B[32mqmon update\u001B[0m                          Update to the latest release
  \u001B[32mqmon login [provider]\u001B[0m               Login to a provider (antigravity, claude, codex, copilot, opencode)
  \u001B[32mqmon logout\u001B[0m                         Logout of current Qmon account
  \u001B[32mqmon logout [provider] [account]\u001B[0m    Logout of a specific provider account
  \u001B[32mqmon reset-login\u001B[0m                    Recover Qmon login via form (no DB access needed)
`)
    process.exit(0)
  }

  if (args[0] === 'version') {
    if (args.length !== 1) {
      console.error('Usage: qmon version')
      process.exit(1)
    }
    console.log(`qmon v${packageJson.version}`)
    return
  }

  if (args[0] === 'update') {
    if (args.length !== 1) {
      console.error('Usage: qmon update')
      process.exit(1)
    }
    try {
      await runUpdate()
      console.log('Qmon update complete. Restart qmon to use the new version.')
    } catch (error: unknown) {
      console.error(`\u001B[31mUpdate failed: ${getErrorMessage(error)}\u001B[0m`)
      process.exit(1)
    }
    return
  }

  if (args[0] === 'reset-login') {
    if (args.length !== 1) {
      console.error('Usage: qmon reset-login')
      process.exit(1)
    }
    runResetLoginFlow().catch((error: unknown) => {
      console.error(`\u001B[31mError: ${getErrorMessage(error)}\u001B[0m`)
      process.exit(1)
    })
    return
  }

  if (args[0] === 'login') {
    if (args.length > 2) {
      console.error('Usage: qmon login [provider]')
      process.exit(1)
    }

    const provider = args[1] ?? (await selectProviderInteractively())
    executeWithLogin(async () => {
      const config = loadConfig()
      if (config) {
        await startSidecar(config.baseUrl).catch(() => { })
      }
      await runAuthFlow(provider)
      stopSidecar()
      process.exit(0)
    }).catch((error: unknown) => {
      console.error(`\u001B[31mError: ${getErrorMessage(error)}\u001B[0m`)
      process.exit(1)
    })
  } else if (args[0] === 'logout') {
    if (!args[1]) {
      if (args.length === 1) {
        console.log(`\n\u001B[33mLogging out of Qmon account...\u001B[0m`)
        clearConfig()
        console.log(`\u001B[32mLogged out. Credentials cleared.\u001B[0m\n`)
        process.exit(0)
      }
      const picked = await selectProviderInteractively()
      args[1] = picked
    }

    const provider = args[1] ?? ''
    const accountName = args.length > 2 ? args.slice(2).join(' ') : ''
    executeWithLogin(async () => {
      const config = loadConfig()
      if (config) {
        await startSidecar(config.baseUrl).catch(() => { })
      }
      await runLogoutFlow(provider, accountName)
      stopSidecar()
      process.exit(0)
    }).catch((error: unknown) => {
      console.error(`\u001B[31mError: ${getErrorMessage(error)}\u001B[0m`)
      process.exit(1)
    })
  } else {
    const config = loadConfig()
    if (config) {
      await startSidecar(config.baseUrl).catch((error: unknown) => {
        console.error(`\u001B[31mFailed to start built-in API: ${getErrorMessage(error)}\u001B[0m`)
      })
    }

    activeRenderer = await createCliRenderer({ exitOnCtrlC: true })
    activeRenderer.on('destroy', () => {
      stopSidecar()
    })
    setRendererDestroy(() => {
      activeRenderer?.destroy()
    })
    createRoot(activeRenderer).render(<App />)
  }
}

main().catch((error: unknown) => {
  console.error(`\u001B[31mFatal error: ${getErrorMessage(error)}\u001B[0m`)
  process.exit(1)
})
