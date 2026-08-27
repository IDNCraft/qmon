import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const CONFIG_PATH = join(homedir(), '.qmon-cli.json')

export interface QmonConfig {
  baseUrl: string
  token: string
  hiddenProviders?: string[]
  showUsedMetric?: boolean
  showAbsoluteTime?: boolean
}

export function loadConfig(): QmonConfig | null {
  if (!existsSync(CONFIG_PATH)) {
    return null
  }
  try {
    const data = readFileSync(CONFIG_PATH, 'utf-8')
    return JSON.parse(data) as QmonConfig
  } catch (e) {
    return null
  }
}

export function saveConfig(config: QmonConfig) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}

export function clearConfig() {
  if (existsSync(CONFIG_PATH)) {
    unlinkSync(CONFIG_PATH)
  }
}
