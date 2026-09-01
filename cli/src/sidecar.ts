import { ChildProcess, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

let apiProcess: ChildProcess | null = null

// Sidecar state lives in qmon's data directory (XDG_DATA_HOME aware), not in
// $HOME, so a single directory holds all qmon state and is easy to reset.
function qmonDataDir(): string {
  const xdg = process.env.XDG_DATA_HOME
  const base = xdg && path.isAbsolute(xdg) ? xdg : path.join(homedir(), '.local', 'share')
  return path.join(base, 'qmon')
}

// Legacy locations used before sidecar state moved into the data directory.
const LEGACY_PID_FILE = path.join(homedir(), '.qmon-server-sidecar.pid')
const LEGACY_LOG_FILE = path.join(homedir(), '.qmon-server-sidecar.log')

// Sidecar PID persisted to disk so a later qmon run can reap an orphaned
// qmon-server whose parent TUI died (crash, kill -9, or lost signal).
const SIDECAR_PID_FILE = path.join(qmonDataDir(), 'sidecar.pid')

function migrateLegacyFile(from: string, to: string): void {
  try {
    if (existsSync(from) && !existsSync(to)) {
      renameSync(from, to)
    } else if (existsSync(from)) {
      unlinkSync(from)
    }
  } catch {
    // Best-effort migration only.
  }
}

function readSidecarPid(): number | null {
  try {
    const pid = Number.parseInt(readFileSync(SIDECAR_PID_FILE, 'utf8').trim(), 10)
    return Number.isNaN(pid) ? null : pid
  } catch {
    return null
  }
}

function writeSidecarPid(pid: number): void {
  try {
    writeFileSync(SIDECAR_PID_FILE, String(pid))
  } catch {
    // Best-effort bookkeeping only.
  }
}

function reapOrphanSidecar(): void {
  const pid = readSidecarPid()
  if (!pid || pid === apiProcess?.pid) return
  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // Already dead.
    }
  }
}

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

  // API is down but a previous sidecar may still be alive without a parent.
  reapOrphanSidecar()

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

  // Create log file in qmon's data folder for diagnostics
  const dataDir = qmonDataDir()
  try {
    mkdirSync(dataDir, { recursive: true })
  } catch {
    // Fall through: openSync below surfaces a real failure.
  }
  migrateLegacyFile(LEGACY_PID_FILE, SIDECAR_PID_FILE)
  const logFilePath = path.join(dataDir, 'sidecar.log')
  migrateLegacyFile(LEGACY_LOG_FILE, logFilePath)
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
  if (apiProcess.pid) {
    writeSidecarPid(apiProcess.pid)
  }

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
      } catch { }
    }
    apiProcess = null
    try {
      unlinkSync(SIDECAR_PID_FILE)
    } catch {
      // File already gone.
    }
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
