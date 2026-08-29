import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const CONFIG_PATH = path.join(homedir(), '.qmon-cli.json')

export interface QmonConfig {
  baseUrl: string
  token: string
  hiddenProviders?: string[]
  showUsedMetric?: boolean
  showAbsoluteTime?: boolean
  lastUpdateCheck?: number
}

export function loadConfig(): QmonConfig | null {
  if (!existsSync(CONFIG_PATH)) {
    return null
  }
  try {
    const data = readFileSync(CONFIG_PATH, 'utf8')
    return JSON.parse(data) as QmonConfig
  } catch {
    return null
  }
}

export function saveConfig(config: QmonConfig) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
}

export function clearConfig() {
  if (existsSync(CONFIG_PATH)) {
    unlinkSync(CONFIG_PATH)
  }
}
