import * as fs from 'node:fs'
import * as os from 'node:os'
import path from 'node:path'
import * as readline from 'node:readline'

import { loadConfig, saveConfig } from '@/config'
import { openUrlInBrowser } from '@/openUrl'
import { startSidecar } from '@/sidecar'

interface AuthData {
  accounts?: string[]
  code?: string
  j_token?: string
  status?: string
  url?: string
}

interface ApiResponse {
  code?: string
  data?: AuthData
  error?: string
  message?: string
  status?: string
  url?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseAuthData(value: unknown): AuthData | undefined {
  if (!isRecord(value)) return undefined
  const accounts = value.accounts
  return {
    accounts:
      Array.isArray(accounts) &&
        accounts.every((account: unknown): account is string => typeof account === 'string')
        ? accounts
        : undefined,
    code: typeof value.code === 'string' ? value.code : undefined,
    j_token: typeof value.j_token === 'string' ? value.j_token : undefined,
    status: typeof value.status === 'string' ? value.status : undefined,
    url: typeof value.url === 'string' ? value.url : undefined,
  }
}

function parseApiResponse(value: unknown): ApiResponse {
  if (!isRecord(value)) return {}
  return {
    code: typeof value.code === 'string' ? value.code : undefined,
    data: parseAuthData(value.data),
    error: typeof value.error === 'string' ? value.error : undefined,
    message: typeof value.message === 'string' ? value.message : undefined,
    status: typeof value.status === 'string' ? value.status : undefined,
    url: typeof value.url === 'string' ? value.url : undefined,
  }
}

async function readApiResponse(response: Response): Promise<ApiResponse> {
  try {
    return parseApiResponse(await response.json())
  } catch {
    return {}
  }
}

function getApiErrorMessage(response: ApiResponse, fallback: string): string {
  return response.message ?? response.error ?? fallback
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const SUPPORTED_PROVIDERS = ['antigravity', 'claude', 'codex', 'copilot', 'opencode']

export async function listProviderAccounts(provider: string): Promise<string[]> {
  const res = await fetch(
    `${getBaseUrl()}/api/v1/providers/credentials/${provider.toLowerCase()}/accounts`,
    { headers: getHeaders() }
  )
  if (res.status === 401) {
    throw new Error('Not logged in')
  }
  if (!res.ok) {
    const data = await readApiResponse(res)
    throw new Error(getApiErrorMessage(data, res.statusText))
  }
  const data = await readApiResponse(res)
  return data.data?.accounts ?? []
}

export async function selectProviderInteractively(): Promise<string> {
  console.log(`\n\u001B[1mProviders:\u001B[0m\n`)
  for (const [idx, provider] of SUPPORTED_PROVIDERS.entries()) {
    console.log(`  \u001B[32m${idx + 1}.\u001B[0m ${provider}`)
  }
  console.log('')
  while (true) {
    const choice = await askQuestion(
      `\u001B[1m\u001B[32m>\u001B[0m Select provider (1-${SUPPORTED_PROVIDERS.length}): `
    )
    const sel = Number.parseInt(choice.trim())
    if (!Number.isNaN(sel) && sel >= 1 && sel <= SUPPORTED_PROVIDERS.length) {
      return SUPPORTED_PROVIDERS[sel - 1] ?? SUPPORTED_PROVIDERS[0] ?? 'antigravity'
    }
    console.log(`\u001B[31mInvalid selection, try again.\u001B[0m`)
  }
}

export async function runResetLoginFlow(): Promise<void> {
  const url = 'http://localhost:8080'
  console.log(`\n\u001B[1mQmon Account Recovery\u001B[0m\n`)
  console.log(`Resets the local Qmon login (default admin) via form — no DB access needed.\n`)

  await startSidecar(url).catch(() => { })

  const newEmail = await askQuestion('\u001B[1m\u001B[32m>\u001B[0m New email: ')
  if (!newEmail.trim()) {
    console.log('\u001B[31mCancelled.\u001B[0m\n')
    return
  }
  const newPassword = await askQuestion(
    '\u001B[1m\u001B[32m>\u001B[0m New password (min 6 chars): ',
    true
  )
  if (newPassword.length < 6) {
    console.log('\u001B[31mPassword too short (min 6 chars). Cancelled.\u001B[0m\n')
    return
  }

  console.log(`\n\u001B[33mResetting credentials...\u001B[0m`)
  const res = await fetch(`${url.replace(/\/+$/, '')}/api/v1/auth/reset-default`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_email: newEmail.trim(), new_password: newPassword }),
  })
  const data = await readApiResponse(res)
  if (!res.ok) {
    const msg = getApiErrorMessage(data, 'Reset failed')
    if (res.status === 403) {
      console.log(
        `\n\u001B[33m${msg}\u001B[0m\nThis recovery only works while the default admin is still active.\nIf credentials were already changed and forgotten, restore from DB backup or re-seed the admin account.\n`
      )
      return
    }
    throw new Error(msg)
  }
  console.log(
    `\n\u001B[32m${data.message ?? 'Credentials updated. Please login with your new email and password.'}\u001B[0m\n`
  )
}

/** Start a local HTTP server to catch the OAuth callback automatically */
async function startOAuthCallbackServer(authUrl: string): Promise<string> {
  const urlObj = new URL(authUrl)
  const redirectUriParam = urlObj.searchParams.get('redirect_uri')
  if (!redirectUriParam) throw new Error('No redirect_uri in OAuth URL')

  const cbUrl = new URL(redirectUriParam)
  const port = Number.parseInt(cbUrl.port) || (cbUrl.protocol === 'https:' ? 443 : 80)
  const pathname = cbUrl.pathname

  let callbackResolve: (url: string) => void
  const callbackPromise = new Promise<string>((resolve) => {
    callbackResolve = resolve
  })

  const successHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Authorized v</title><style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1a2e;color:#fff;text-align:center}div{padding:2rem}h1{color:#4ade80;font-size:2rem;margin-bottom:.5rem}p{color:#94a3b8;font-size:1.1rem}.check{font-size:4rem;margin-bottom:1rem}</style></head><body><div><div class="check"></div><h1>Authorized!</h1><p>You can close this window and return to the terminal.</p></div></body></html>`

  const server = Bun.serve({
    port,
    fetch(req) {
      const reqUrl = new URL(req.url)
      if (reqUrl.pathname === pathname && reqUrl.searchParams.has('code')) {
        callbackResolve(req.url)
        return new Response(successHtml, { headers: { 'Content-Type': 'text/html' } })
      }
      return new Response('Not found', { status: 404 })
    },
  })

  try {
    await openUrlInBrowser(authUrl)

    const timeoutMs = 5 * 60 * 1000
    return await Promise.race([
      callbackPromise,
      new Promise<string>((_resolve, reject) =>
        setTimeout(() => {
          reject(new Error('Authorization timed out after 5 minutes.'))
        }, timeoutMs)
      ),
    ])
  } finally {
    server.stop()
  }
}

function askQuestion(query: string, maskInput = false): Promise<string> {
  return new Promise((resolve) => {
    if (!maskInput) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })
      rl.question(query, (ans) => {
        rl.close()
        resolve(ans)
      })
      return
    }
    // Masked input without readline echo: raw mode + manual buffer.
    // Backspace stays masked too: erase one star, never reveal chars.
    const out = process.stdout
    const stdin = process.stdin
    let buf = ''
    out.write(query)
    const wasRaw = stdin.isRaw
    if (stdin.isTTY) stdin.setRawMode(true)
    stdin.resume()
    const cleanup = () => {
      stdin.off('data', onData)
      stdin.pause()
      if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false)
    }
    const onData = (chunk: Buffer) => {
      const s = chunk.toString('utf8')
      const code = s.length > 0 ? s.charCodeAt(0) : -1
      // Enter (CR/LF), Ctrl+D (EOT), Ctrl+C (ETX) submit; never leak chars.
      if (code === 13 || code === 10 || code === 4 || code === 3) {
        cleanup()
        out.write('\n')
        resolve(buf)
        return
      }
      // Backspace/DEL: erase one star from our own buffer only.
      if (code === 127 || code === 8) {
        if (buf.length > 0) {
          buf = buf.slice(0, -1)
          out.write('\b \b')
        }
        return
      }
      // Printable chars (incl. multi-char paste): buffer + stars.
      if (s >= ' ' && code !== 27) {
        buf += s
        out.write('*'.repeat(s.length))
      }
    }
    stdin.on('data', onData)
  })
}

function getBaseUrl() {
  const config = loadConfig()
  if (!config)
    throw new Error('Not logged in. Please run the CLI normally to configure your Qmon API token.')
  return config.baseUrl.replace(/\/+$/, '')
}

function getHeaders() {
  const config = loadConfig()
  return {
    'Authorization': `Bearer ${config?.token}`,
    'Content-Type': 'application/json',
  }
}

export async function loginWithPrompt(): Promise<void> {
  console.log(`\n\u001B[1mQmon CLI Setup\u001B[0m\n`)

  const url = 'http://localhost:8080'

  // Boot sidecar in the background while user is typing credentials
  startSidecar(url).catch(() => { })

  let email = ''
  while (true) {
    email = (await askQuestion('\u001B[1m\u001B[32m>\u001B[0m Email: ')).trim()
    if (!email) {
      console.log('\u001B[31mEmail is required.\u001B[0m\n')
      continue
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      console.log('\u001B[31mInvalid email format.\u001B[0m\n')
      continue
    }
    break
  }

  let password = ''
  while (true) {
    password = await askQuestion('\u001B[1m\u001B[32m>\u001B[0m Password: ', true)
    if (!password) {
      console.log('\u001B[31mPassword is required.\u001B[0m\n')
      continue
    }
    break
  }

  console.log(`\n\u001B[33mLogging in...\u001B[0m`)
  // Ensure background boot is complete before fetching
  await startSidecar(url)

  const res = await fetch(`${url.replace(/\/+$/, '')}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  const data = await readApiResponse(res)
  if (!res.ok) throw new Error(getApiErrorMessage(data, 'Login failed'))

  const token = data.data?.j_token
  if (!token) throw new Error('Login response did not include a token')

  saveConfig({ baseUrl: url, token })
  console.log(`\n\u001B[32mLogged in as \u001B[1m${email}\u001B[0m\u001B[32m!\u001B[0m\n`)
}

export async function runLogoutFlow(provider: string, accountName: string = '') {
  provider = provider.toLowerCase()

  // If no accountName provided, fetch accounts and ask interactively
  if (!accountName) {
    const accRes = await fetch(
      `${getBaseUrl()}/api/v1/providers/credentials/${provider}/accounts`,
      {
        headers: getHeaders(),
      }
    )

    if (accRes.ok) {
      const data = await readApiResponse(accRes)
      const accounts = data.data?.accounts ?? []

      if (accounts.length === 0) {
        console.log(`\n\u001B[33mNo active accounts found for ${provider}.\u001B[0m\n`)
        return
      }

      console.log(
        `\n\u001B[1m\u001B[36m╭───────────────────────────────────────────────────╮\u001B[0m`
      )
      console.log(
        `\u001B[1m\u001B[36m│\u001B[0m  \u001B[1mManage Accounts\u001B[0m  \u001B[1m\u001B[36m│\u001B[0m`
      )
      console.log(
        `\u001B[1m\u001B[36m╰───────────────────────────────────────────────────╯\u001B[0m\n`
      )

      console.log(`Accounts for \u001B[33m${provider}\u001B[0m:`)
      for (const [idx, account] of accounts.entries()) {
        console.log(`  \u001B[32m${idx + 1}.\u001B[0m ${account}`)
      }
      console.log(`  \u001B[32m${accounts.length + 1}.\u001B[0m Logout from ALL accounts\n`)

      let valid = false
      while (!valid) {
        const choice = await askQuestion(
          `\u001B[1m\u001B[32m>\u001B[0m Select an option (1-${accounts.length + 1}) [${accounts.length + 1}]: `
        )
        const sel = choice.trim() ? Number.parseInt(choice.trim()) : accounts.length + 1

        if (Number.isNaN(sel) || sel < 1 || sel > accounts.length + 1) {
          console.log(`\u001B[31mInvalid selection, try again.\u001B[0m`)
        } else {
          valid = true
          if (sel <= accounts.length) {
            accountName = accounts[sel - 1] ?? ''
          }
        }
      }
    }
  }

  let label = accountName ? `${provider} (${accountName})` : `ALL ${provider} accounts`
  console.log(`\n\u001B[33mLogging out of ${label}...\u001B[0m`)

  const query = accountName ? `?account_name=${encodeURIComponent(accountName)}` : ''
  const res = await fetch(`${getBaseUrl()}/api/v1/providers/credentials/${provider}${query}`, {
    method: 'DELETE',
    headers: getHeaders(),
  })

  if (!res.ok) {
    let errMsg = res.statusText
    try {
      const errJson = await readApiResponse(res)
      errMsg = getApiErrorMessage(errJson, errMsg)
    } catch { }
    throw new Error(`Failed to logout: ${errMsg}`)
  }

  console.log(`\u001B[32mSuccessfully logged out!\u001B[0m\n`)
}

export async function runAuthFlow(provider: string) {
  provider = provider.toLowerCase()

  console.log(
    `\n\u001B[36m[Qmon CLI]\u001B[0m Starting auth flow for \u001B[33m${provider}\u001B[0m...`
  )

  let initData: ApiResponse = {}
  let resData: AuthData = {}

  if (provider === 'codex') {
    // Check if it's already running first
    const statusRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/codex/status`, {
      headers: getHeaders(),
    })
    if (statusRes.ok) {
      const statusData = await readApiResponse(statusRes)
      if (statusData.data?.status === 'waiting') {
        console.log(
          `\u001B[33m(A Codex login process is already running in the background. Resuming...)\u001B[0m`
        )
        initData = statusData
        resData = statusData.data ?? {}
      }
    }
  }

  // If not resumed, we initiate
  let finalAccountName = 'Default'
  if (!resData.url && !resData.code) {
    console.log(
      `\n\u001B[1m\u001B[36m╭───────────────────────────────────────────────────╮\u001B[0m`
    )
    console.log(
      `\u001B[1m\u001B[36m│\u001B[0m  \u001B[1mInitializing Auth Flow\u001B[0m  \u001B[1m\u001B[36m│\u001B[0m`
    )
    console.log(
      `\u001B[1m\u001B[36m╰───────────────────────────────────────────────────╯\u001B[0m\n`
    )

    // Check existing accounts so user can pick instead of re-typing
    let existingAccounts: string[] = []
    try {
      const accRes = await fetch(
        `${getBaseUrl()}/api/v1/providers/credentials/${provider}/accounts`,
        {
          headers: getHeaders(),
        }
      )
      if (accRes.ok) {
        const accData = await readApiResponse(accRes)
        existingAccounts = accData.data?.accounts ?? []
      }
    } catch { }

    if (existingAccounts.length > 0) {
      console.log(`\u001B[1mExisting accounts for \u001B[33m${provider}\u001B[0m:\n`)
      for (const [idx, acc] of existingAccounts.entries()) {
        console.log(`  \u001B[32m${idx + 1}.\u001B[0m ${acc}`)
      }
      console.log(`  \u001B[32m${existingAccounts.length + 1}.\u001B[0m New account\n`)

      let valid = false
      while (!valid) {
        const choice = await askQuestion(
          `\u001B[1m\u001B[32m>\u001B[0m Select account [${existingAccounts.length + 1}]: `
        )
        const sel = choice.trim() ? Number.parseInt(choice.trim()) : existingAccounts.length + 1
        if (Number.isNaN(sel) || sel < 1 || sel > existingAccounts.length + 1) {
          console.log(`\u001B[31mInvalid selection, try again.\u001B[0m`)
        } else {
          valid = true
          if (sel <= existingAccounts.length) {
            finalAccountName = existingAccounts[sel - 1] ?? 'Default'
          } else {
            const newName = await askQuestion(
              '\u001B[1m\u001B[32m>\u001B[0m New profile name [Default]: '
            )
            finalAccountName = newName.trim() || 'Default'
          }
        }
      }
    } else {
      const accountName = await askQuestion(
        '\u001B[1m\u001B[32m>\u001B[0m Profile Name (e.g., Default, Work, Personal) [Default]: '
      )
      finalAccountName = accountName.trim() || 'Default'
    }

    if (provider === 'opencode') {
      let existingKey = ''
      try {
        const authPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json')
        if (fs.existsSync(authPath)) {
          const authData = JSON.parse(fs.readFileSync(authPath, 'utf8')) as unknown
          if (
            isRecord(authData) &&
            isRecord(authData.opencode) &&
            typeof authData.opencode.key === 'string'
          ) {
            existingKey = authData.opencode.key
          } else if (
            isRecord(authData) &&
            isRecord(authData['opencode-go']) &&
            typeof authData['opencode-go'].key === 'string'
          ) {
            existingKey = authData['opencode-go'].key
          }
        }
      } catch { }

      let apiKey = ''
      if (existingKey) {
        const maskedKey =
          existingKey.slice(0, 7) + '...' + existingKey.slice(Math.max(0, existingKey.length - 4))
        apiKey = await askQuestion(
          `\u001B[1m\u001B[32m>\u001B[0m OpenCode API Key [Press Enter to use existing: ${maskedKey}]: `
        )
        if (!apiKey.trim()) {
          apiKey = existingKey
        }
      } else {
        apiKey = await askQuestion('\u001B[1m\u001B[32m>\u001B[0m OpenCode API Key: ')
      }

      if (!apiKey.trim()) {
        console.log('Cancelled.')
        return
      }

      console.log(
        `\n\u001B[33mContacting Qmon API for ${provider} (${finalAccountName})...\u001B[0m`
      )
      const compRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/opencode/complete`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ account_name: finalAccountName, api_key: apiKey.trim() }),
      })

      if (!compRes.ok) {
        let errMsg = compRes.statusText
        try {
          const errJson = await readApiResponse(compRes)
          errMsg = getApiErrorMessage(errJson, errMsg)
        } catch { }
        throw new Error(`Failed to save credential: ${errMsg}`)
      }

      console.log('\n\u001B[1m\u001B[32mSuccessfully authenticated OpenCode Go!\u001B[0m')
      console.log('\u001B[32mYou can now run the Qmon Dashboard normally.\u001B[0m\n')
      return
    }

    console.log(`\n\u001B[33mContacting Qmon API for ${provider} (${finalAccountName})...\u001B[0m`)
    const initRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/${provider}/initiate`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ account_name: finalAccountName }),
    })

    if (!initRes.ok) {
      let errMsg = initRes.statusText
      try {
        const errJson = await readApiResponse(initRes)
        errMsg = getApiErrorMessage(errJson, errMsg)
      } catch { }
      throw new Error(`Failed to initiate auth: ${errMsg}`)
    }

    initData = await readApiResponse(initRes)
    resData = initData.data ?? {}
  }

  // ==========================================
  // CODEX AUTH FLOW
  // ==========================================
  if (provider === 'codex') {
    if (!resData.url || !resData.code) {
      throw new Error(`Invalid response from server: missing URL or Code`)
    }

    console.log(
      `\n\u001B[1m\u001B[36m╭───────────────────────────────────────────────────╮\u001B[0m`
    )
    console.log(
      `\u001B[1m\u001B[36m│\u001B[0m  \u001B[1mStep 1: Login with GitHub / OpenAI\u001B[0m  \u001B[1m\u001B[36m│\u001B[0m`
    )
    console.log(`\u001B[1m\u001B[36m╰───────────────────────────────────────────────────╯\u001B[0m`)
    console.log(`\nPlease open this URL in your browser:\n`)
    console.log(`\u001B[4m\u001B[34m${resData.url}\u001B[0m\n`)

    console.log(`\u001B[1m\u001B[36m╭───────────────────────────────────────────────────╮\u001B[0m`)
    console.log(
      `\u001B[1m\u001B[36m│\u001B[0m  \u001B[1mStep 2: Enter Device Code\u001B[0m  \u001B[1m\u001B[36m│\u001B[0m`
    )
    console.log(`\u001B[1m\u001B[36m╰───────────────────────────────────────────────────╯\u001B[0m`)
    console.log(`\nPlease type this code into the browser window:\n`)
    console.log(`\u001B[1m\u001B[33m  ${resData.code}\u001B[0m\n`)

    console.log(
      `\u001B[33mWaiting for you to authorize in the browser...\u001B[0m (Press Ctrl+C to cancel)\n`
    )

    // Polling loop
    while (true) {
      const statusRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/${provider}/status`, {
        method: 'GET',
        headers: getHeaders(),
      })
      const statusData = await readApiResponse(statusRes)
      const state = statusData.data?.status

      if (state === 'success') {
        console.log('\u001B[1m\u001B[32mSuccessfully authenticated Codex!\u001B[0m')
        console.log('\u001B[32mYou can now run the Qmon Dashboard normally.\u001B[0m\n')
        return
      } else if (state === 'error') {
        throw new Error(`Auth failed: ${statusData.message ?? 'Unknown error'}`)
      }

      // Wait 2 seconds before polling again
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  // ==========================================
  // ANTIGRAVITY AUTH FLOW
  // ==========================================
  if (provider === 'antigravity') {
    const authUrl = resData.url ?? initData.url ?? JSON.stringify(initData)
    let autoMode = false

    try {
      console.log(
        `\n\u001B[1m\u001B[36m╭───────────────────────────────────────────────────╮\u001B[0m`
      )
      console.log(
        `\u001B[1m\u001B[36m│\u001B[0m  \u001B[1mAuthorizing Antigravity\u001B[0m  \u001B[1m\u001B[36m│\u001B[0m`
      )
      console.log(
        `\u001B[1m\u001B[36m╰───────────────────────────────────────────────────╯\u001B[0m`
      )
      console.log(`\n\u001B[36mOpening browser...\u001B[0m\n`)

      const redirectUrl = await startOAuthCallbackServer(authUrl)

      console.log(`\u001B[33mVerifying and saving token...\u001B[0m`)
      const compRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/${provider}/complete`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ redirect_url: redirectUrl, account_name: finalAccountName }),
      })

      if (!compRes.ok) {
        throw new Error(`Failed to complete auth: ${compRes.statusText}`)
      }

      console.log('\n\u001B[1m\u001B[32mSuccessfully authenticated Antigravity!\u001B[0m')
      console.log('\u001B[32mYou can now run the Qmon Dashboard normally.\u001B[0m\n')
      autoMode = true
    } catch (error: unknown) {
      if (!autoMode) {
        console.log(
          `\n\u001B[33mAuto-login unavailable (${getErrorMessage(error)}), using manual mode.\u001B[0m\n`
        )
        console.log(
          `\u001B[1m\u001B[36m╭───────────────────────────────────────────────────╮\u001B[0m`
        )
        console.log(
          `\u001B[1m\u001B[36m│\u001B[0m  \u001B[1mStep 1: Login with Google\u001B[0m  \u001B[1m\u001B[36m│\u001B[0m`
        )
        console.log(
          `\u001B[1m\u001B[36m╰───────────────────────────────────────────────────╯\u001B[0m`
        )
        console.log(`\nPlease open this URL in your browser:\n`)
        console.log(`\u001B[4m\u001B[34m${authUrl}\u001B[0m\n`)

        console.log(
          `\u001B[1m\u001B[36m╭───────────────────────────────────────────────────╮\u001B[0m`
        )
        console.log(
          `\u001B[1m\u001B[36m│\u001B[0m  \u001B[1mStep 2: Paste Redirect URL\u001B[0m  \u001B[1m\u001B[36m│\u001B[0m`
        )
        console.log(
          `\u001B[1m\u001B[36m╰───────────────────────────────────────────────────╯\u001B[0m`
        )
        console.log(
          `\nAfter you authorize, Google will redirect you to an error page (\u001B[31mhttp://127.0.0.1:...\u001B[0m).`
        )
        console.log(
          `Don't worry, this is normal! Just copy that entire error URL from your browser's address bar.\n`
        )

        const redirectUrl = await askQuestion(
          '\u001B[1m\u001B[32m>\u001B[0m Paste the redirect URL here: '
        )
        if (!redirectUrl.trim()) {
          console.log('Cancelled.')
          return
        }

        console.log('\n\u001B[33mVerifying and saving token...\u001B[0m')
        const compRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/${provider}/complete`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            redirect_url: redirectUrl.trim(),
            account_name: finalAccountName,
          }),
        })

        if (!compRes.ok) {
          throw new Error(`Failed to complete auth: ${compRes.statusText}`)
        }

        console.log('\n\u001B[1m\u001B[32mSuccessfully authenticated Antigravity!\u001B[0m')
        console.log('\u001B[32mYou can now run the Qmon Dashboard normally.\u001B[0m\n')
      }
    }
    return
  }

  // Handle other providers (Claude, Copilot, Codex)
  // Currently they might not be fully implemented in the Qmon API to use the same manual flow,
  // but if they are, they would print instructions.
  // ==========================================
  // CLAUDE AUTH FLOW
  // ==========================================
  if (provider === 'claude') {
    if (!resData.url) {
      throw new Error(`Invalid response from server: missing URL`)
    }

    let autoMode = false
    try {
      console.log(
        `\n\u001B[1m\u001B[36m╭───────────────────────────────────────────────────╮\u001B[0m`
      )
      console.log(
        `\u001B[1m\u001B[36m│\u001B[0m  \u001B[1mAuthorizing Claude\u001B[0m  \u001B[1m\u001B[36m│\u001B[0m`
      )
      console.log(
        `\u001B[1m\u001B[36m╰───────────────────────────────────────────────────╯\u001B[0m`
      )
      console.log(`\n\u001B[36mOpening browser...\u001B[0m\n`)

      const redirectUrl = await startOAuthCallbackServer(resData.url)
      const code = new URL(redirectUrl).searchParams.get('code') ?? ''

      console.log(`\u001B[33mVerifying and saving token...\u001B[0m`)
      const compRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/${provider}/complete`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ code, account_name: finalAccountName }),
      })

      if (!compRes.ok) {
        throw new Error(`Failed to complete auth: ${compRes.statusText}`)
      }

      console.log('\n\u001B[1m\u001B[32mSuccessfully authenticated Claude!\u001B[0m')
      console.log('\u001B[32mYou can now run the Qmon Dashboard normally.\u001B[0m\n')
      autoMode = true
    } catch (error: unknown) {
      if (!autoMode) {
        console.log(
          `\n\u001B[33mAuto-login unavailable (${getErrorMessage(error)}), using manual mode.\u001B[0m\n`
        )
        console.log(
          `\u001B[1m\u001B[36m╭───────────────────────────────────────────────────╮\u001B[0m`
        )
        console.log(
          `\u001B[1m\u001B[36m│\u001B[0m  \u001B[1mStep 1: Login with Anthropic\u001B[0m  \u001B[1m\u001B[36m│\u001B[0m`
        )
        console.log(
          `\u001B[1m\u001B[36m╰───────────────────────────────────────────────────╯\u001B[0m`
        )
        console.log(`\nPlease open this URL in your browser:\n`)
        console.log(`\u001B[4m\u001B[34m${resData.url}\u001B[0m\n`)

        console.log(
          `\u001B[1m\u001B[36m╭───────────────────────────────────────────────────╮\u001B[0m`
        )
        console.log(
          `\u001B[1m\u001B[36m│\u001B[0m  \u001B[1mStep 2: Paste Redirect URL\u001B[0m  \u001B[1m\u001B[36m│\u001B[0m`
        )
        console.log(
          `\u001B[1m\u001B[36m╰───────────────────────────────────────────────────╯\u001B[0m`
        )
        console.log(`\nAfter you authorize, you will be redirected to a callback page.`)
        console.log(
          `Please copy the ENTIRE URL from your browser's address bar (it should contain ?code=...)\n`
        )

        const redirectUrl = await askQuestion(
          '\u001B[1m\u001B[32m>\u001B[0m Paste the redirect URL or code here: '
        )
        if (!redirectUrl.trim()) {
          console.log('Cancelled.')
          return
        }

        // Extract code if it's a URL
        let codeStr = redirectUrl.trim()
        try {
          const urlObj = new URL(codeStr)
          if (urlObj.searchParams.has('code')) {
            codeStr = urlObj.searchParams.get('code') ?? codeStr
          }
        } catch {
          // not a valid URL, assume it's the raw code
        }

        console.log('\n\u001B[33mVerifying and saving Claude token...\u001B[0m')
        const compRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/${provider}/complete`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ code: codeStr, account_name: finalAccountName }),
        })

        if (!compRes.ok) {
          throw new Error(`Failed to complete auth: ${compRes.statusText}`)
        }

        console.log('\n\u001B[1m\u001B[32mSuccessfully authenticated Claude!\u001B[0m')
        console.log('\u001B[32mYou can now run the Qmon Dashboard normally.\u001B[0m\n')
      }
    }
    return
  }

  // ==========================================
  // COPILOT AUTH FLOW
  // ==========================================
  if (provider === 'copilot') {
    if (!resData.url || !resData.code) {
      throw new Error(`Invalid response from server: missing URL or Code`)
    }

    console.log(
      `\n\u001B[1m\u001B[36m╭───────────────────────────────────────────────────╮\u001B[0m`
    )
    console.log(
      `\u001B[1m\u001B[36m│\u001B[0m  \u001B[1mLogin with GitHub (Copilot)\u001B[0m  \u001B[1m\u001B[36m│\u001B[0m`
    )
    console.log(`\u001B[1m\u001B[36m╰───────────────────────────────────────────────────╯\u001B[0m`)
    console.log(`\nPlease open this URL in your browser:\n`)
    console.log(`\u001B[4m\u001B[34m${resData.url}\u001B[0m\n`)

    console.log(`\u001B[1m\u001B[36m╭───────────────────────────────────────────────────╮\u001B[0m`)
    console.log(
      `\u001B[1m\u001B[36m│\u001B[0m  \u001B[1mEnter Device Code\u001B[0m  \u001B[1m\u001B[36m│\u001B[0m`
    )
    console.log(`\u001B[1m\u001B[36m╰───────────────────────────────────────────────────╯\u001B[0m`)
    console.log(`\nPlease type this code into the browser window:\n`)
    console.log(`\u001B[1m\u001B[33m  ${resData.code}\u001B[0m\n`)

    console.log(
      `\u001B[33mWaiting for you to authorize in the browser...\u001B[0m (Press Ctrl+C to cancel)\n`
    )

    // Polling loop
    while (true) {
      const statusRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/${provider}/status`, {
        method: 'GET',
        headers: getHeaders(),
      })
      const statusData = await readApiResponse(statusRes)
      const state = statusData.data?.status

      if (state === 'success') {
        console.log('\u001B[1m\u001B[32mSuccessfully authenticated Copilot!\u001B[0m')
        console.log('\u001B[32mYou can now run the Qmon Dashboard normally.\u001B[0m\n')
        return
      } else if (state === 'error') {
        throw new Error(`Auth failed: ${statusData.message ?? 'Unknown error'}`)
      }

      // Wait 2 seconds before polling again
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  // Handle other providers (currently not supported)
  console.log(`\n\u001B[33mNote: CLI auth is not yet supported for '${provider}'.\u001B[0m`)
  console.log(`\u001B[33mSupported providers: antigravity, claude, codex, copilot\u001B[0m\n`)
}
