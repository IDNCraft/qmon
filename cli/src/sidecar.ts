import { ChildProcess, spawn } from 'node:child_process'
import { existsSync, openSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

let apiProcess: ChildProcess | null = null

export async function startSidecar(baseUrl: string): Promise<void> {
  // Only start sidecar if baseUrl points to localhost/127.0.0.1
  if (!baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
    return
  }

  // Check if API is already running
  const isUp = await checkHealth(baseUrl)
  if (isUp) {
    return
  }

  let cmd = 'qmon-server'
  let args: string[] = []
  let cwd = process.cwd()

  // 1. Try global install location
  const globalBin = path.join(homedir(), '.local', 'bin', 'qmon-server')

  // 2. Try development location (Monorepo)
  const devApiDir = path.join(process.cwd(), '../api')
  const devBin = path.join(devApiDir, 'qmon-server')

  if (existsSync(globalBin)) {
    cmd = globalBin
  } else if (existsSync(devBin)) {
    cmd = devBin
    cwd = devApiDir
  } else if (existsSync(devApiDir)) {
    cmd = 'go'
    args = ['run', 'main.go']
    cwd = devApiDir
  } else {
    // Rely on PATH if qmon-server is installed elsewhere,
    // but if it fails, the user must run the API manually.
  }

  // Create log file in user's home folder for diagnostics
  const logFilePath = path.join(homedir(), '.qmon-server-sidecar.log')
  const logFd = openSync(logFilePath, 'a')

  // Spawn detached so we can terminate it and its sub-children as a process group
  apiProcess = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', logFd, logFd],
    detached: true,
  })

  apiProcess.on('error', (err) => {
    console.error('\u001B[31m❌ Failed to spawn API process:\u001B[0m', err.message)
  })

  // Wait for it to boot up and respond to /health
  let attempts = 0
  while (attempts < 15) {
    const ok = await checkHealth(baseUrl)
    if (ok) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
    attempts++
  }

  throw new Error(
    `Timeout waiting for built-in API server to start. Check diagnostics at ${logFilePath}`
  )
}

export function stopSidecar(): void {
  if (apiProcess?.pid) {
    try {
      // Kill the process group (minus sign indicates PGID)
      process.kill(-apiProcess.pid, 'SIGINT')
    } catch {
      try {
        apiProcess.kill('SIGINT')
      } catch {}
    }
    apiProcess = null
  }
}

async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const id = setTimeout(() => {
      controller.abort()
    }, 400)
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/health`, { signal: controller.signal })
    clearTimeout(id)
    return res.status === 200
  } catch {
    return false
  }
}
