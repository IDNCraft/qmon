import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as readline from 'readline'

import { loadConfig, saveConfig } from './config'
import { startSidecar } from './sidecar'

/** Open a URL in the default system browser */
async function openUrlInBrowser(url: string): Promise<void> {
  try {
    if (process.platform === 'darwin') {
      await Bun.$`open "${url}"`.quiet()
    } else if (process.platform === 'linux') {
      await Bun.$`xdg-open "${url}"`.quiet()
    } else {
      await Bun.$`start "" "${url}"`.quiet()
    }
  } catch {
    // Browser open failure is non-fatal
  }
}

/** Start a local HTTP server to catch the OAuth callback automatically */
async function startOAuthCallbackServer(authUrl: string): Promise<string> {
  const urlObj = new URL(authUrl)
  const redirectUriParam = urlObj.searchParams.get('redirect_uri')
  if (!redirectUriParam) throw new Error('No redirect_uri in OAuth URL')

  const cbUrl = new URL(redirectUriParam)
  const port = parseInt(cbUrl.port) || (cbUrl.protocol === 'https:' ? 443 : 80)
  const pathname = cbUrl.pathname

  let callbackResolve: (url: string) => void
  const callbackPromise = new Promise<string>((resolve) => {
    callbackResolve = resolve
  })

  const successHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Authorized ✓</title><style>body{display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#1a1a2e;color:#fff;text-align:center}div{padding:2rem}h1{color:#4ade80;font-size:2rem;margin-bottom:.5rem}p{color:#94a3b8;font-size:1.1rem}.check{font-size:4rem;margin-bottom:1rem}</style></head><body><div><div class="check">✅</div><h1>Authorized!</h1><p>You can close this window and return to the terminal.</p></div></body></html>`

  const server = Bun.serve({
    port,
    async fetch(req) {
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
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Authorization timed out after 5 minutes.')), timeoutMs)
      ),
    ])
  } finally {
    server.stop()
  }
}

export function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close()
      resolve(ans)
    })
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
  console.log(`\n\x1b[1m🔐 Qmon CLI Setup\x1b[0m\n`)

  const url = 'http://localhost:8080'

  // Boot sidecar in the background while user is typing credentials
  startSidecar(url).catch(() => {})

  const email = await askQuestion('\x1b[1m\x1b[32m➜\x1b[0m Email: ')
  if (!email.trim()) {
    console.log('\x1b[31mCancelled.\x1b[0m\n')
    return
  }

  const password = await askQuestion('\x1b[1m\x1b[32m➜\x1b[0m Password: ')
  if (!password.trim()) {
    console.log('\x1b[31mCancelled.\x1b[0m\n')
    return
  }

  console.log(`\n\x1b[33m⏳ Logging in...\x1b[0m`)
  // Ensure background boot is complete before fetching
  await startSidecar(url)

  const res = await fetch(`${url.replace(/\/+$/, '')}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  const data = (await res.json()) as any
  if (!res.ok) throw new Error(data.message || 'Login failed')

  saveConfig({ baseUrl: url, token: data.data.j_token })
  console.log(`\n\x1b[32m✅ Logged in as \x1b[1m${email}\x1b[0m\x1b[32m!\x1b[0m\n`)
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
      const data = (await accRes.json()) as any
      const accounts = data.data?.accounts || []

      if (accounts.length === 0) {
        console.log(`\n\x1b[33mNo active accounts found for ${provider}.\x1b[0m\n`)
        return
      }

      console.log(`\n\x1b[1m\x1b[36m╭───────────────────────────────────────────────────╮\x1b[0m`)
      console.log(
        `\x1b[1m\x1b[36m│\x1b[0m  \x1b[1m⚙️ Manage Accounts\x1b[0m                               \x1b[1m\x1b[36m│\x1b[0m`
      )
      console.log(`\x1b[1m\x1b[36m╰───────────────────────────────────────────────────╯\x1b[0m\n`)

      console.log(`Accounts for \x1b[33m${provider}\x1b[0m:`)
      accounts.forEach((acc: string, idx: number) => {
        console.log(`  \x1b[32m${idx + 1}.\x1b[0m ${acc}`)
      })
      console.log(`  \x1b[32m${accounts.length + 1}.\x1b[0m Logout from ALL accounts\n`)

      let valid = false
      while (!valid) {
        const choice = await askQuestion(
          `\x1b[1m\x1b[32m➜\x1b[0m Select an option (1-${accounts.length + 1}) [${accounts.length + 1}]: `
        )
        const sel = choice.trim() ? parseInt(choice.trim()) : accounts.length + 1

        if (isNaN(sel) || sel < 1 || sel > accounts.length + 1) {
          console.log(`\x1b[31mInvalid selection, try again.\x1b[0m`)
        } else {
          valid = true
          if (sel <= accounts.length) {
            accountName = accounts[sel - 1]
          }
        }
      }
    }
  }

  let label = accountName ? `${provider} (${accountName})` : `ALL ${provider} accounts`
  console.log(`\n\x1b[33m⏳ Logging out of ${label}...\x1b[0m`)

  const query = accountName ? `?account_name=${encodeURIComponent(accountName)}` : ''
  const res = await fetch(`${getBaseUrl()}/api/v1/providers/credentials/${provider}${query}`, {
    method: 'DELETE',
    headers: getHeaders(),
  })

  if (!res.ok) {
    let errMsg = res.statusText
    try {
      const errJson = (await res.json()) as any
      errMsg = errJson.message || errJson.error || errMsg
    } catch (e) {}
    throw new Error(`Failed to logout: ${errMsg}`)
  }

  console.log(`\x1b[32m✅ Successfully logged out!\x1b[0m\n`)
}

export async function runAuthFlow(provider: string) {
  provider = provider.toLowerCase()

  console.log(`\n\x1b[36m[Qmon CLI]\x1b[0m Starting auth flow for \x1b[33m${provider}\x1b[0m...`)

  let initData: any = {}
  let resData: any = {}

  if (provider === 'codex') {
    // Check if it's already running first
    const statusRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/codex/status`, {
      headers: getHeaders(),
    })
    if (statusRes.ok) {
      const statusData = (await statusRes.json()) as any
      if (statusData.data?.status === 'waiting') {
        console.log(
          `\x1b[33m(A Codex login process is already running in the background. Resuming...)\x1b[0m`
        )
        initData = statusData
        resData = statusData.data
      }
    }
  }

  // If not resumed, we initiate
  let finalAccountName = 'Default'
  if (!resData.url && !resData.code) {
    console.log(`\n\x1b[1m\x1b[36m╭───────────────────────────────────────────────────╮\x1b[0m`)
    console.log(
      `\x1b[1m\x1b[36m│\x1b[0m  \x1b[1m🚀 Initializing Auth Flow\x1b[0m                        \x1b[1m\x1b[36m│\x1b[0m`
    )
    console.log(`\x1b[1m\x1b[36m╰───────────────────────────────────────────────────╯\x1b[0m\n`)

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
        const accData = (await accRes.json()) as any
        existingAccounts = accData.data?.accounts || []
      }
    } catch (_e) {}

    if (existingAccounts.length > 0) {
      console.log(`\x1b[1mExisting accounts for \x1b[33m${provider}\x1b[0m:\n`)
      existingAccounts.forEach((acc, idx) => {
        console.log(`  \x1b[32m${idx + 1}.\x1b[0m ${acc}`)
      })
      console.log(`  \x1b[32m${existingAccounts.length + 1}.\x1b[0m New account\n`)

      let valid = false
      while (!valid) {
        const choice = await askQuestion(
          `\x1b[1m\x1b[32m➜\x1b[0m Select account [${existingAccounts.length + 1}]: `
        )
        const sel = choice.trim() ? parseInt(choice.trim()) : existingAccounts.length + 1
        if (isNaN(sel) || sel < 1 || sel > existingAccounts.length + 1) {
          console.log(`\x1b[31mInvalid selection, try again.\x1b[0m`)
        } else {
          valid = true
          if (sel <= existingAccounts.length) {
            finalAccountName = existingAccounts[sel - 1] || 'Default'
          } else {
            const newName = await askQuestion(
              '\x1b[1m\x1b[32m➜\x1b[0m New profile name [Default]: '
            )
            finalAccountName = newName.trim() || 'Default'
          }
        }
      }
    } else {
      const accountName = await askQuestion(
        '\x1b[1m\x1b[32m➜\x1b[0m Profile Name (e.g., Default, Work, Personal) [Default]: '
      )
      finalAccountName = accountName.trim() || 'Default'
    }

    if (provider === 'opencode') {
      let existingKey = ''
      try {
        const authPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json')
        if (fs.existsSync(authPath)) {
          const authData = JSON.parse(fs.readFileSync(authPath, 'utf8'))
          if (authData?.opencode?.key) {
            existingKey = authData.opencode.key
          } else if (authData?.['opencode-go']?.key) {
            existingKey = authData['opencode-go'].key
          }
        }
      } catch (e) {}

      let apiKey = ''
      if (existingKey) {
        const maskedKey =
          existingKey.substring(0, 7) + '...' + existingKey.substring(existingKey.length - 4)
        apiKey = await askQuestion(
          `\x1b[1m\x1b[32m➜\x1b[0m OpenCode API Key [Press Enter to use existing: ${maskedKey}]: `
        )
        if (!apiKey.trim()) {
          apiKey = existingKey
        }
      } else {
        apiKey = await askQuestion('\x1b[1m\x1b[32m➜\x1b[0m OpenCode API Key: ')
      }

      if (!apiKey.trim()) {
        console.log('Cancelled.')
        return
      }

      console.log(
        `\n\x1b[33m⏳ Contacting Qmon API for ${provider} (${finalAccountName})...\x1b[0m`
      )
      const compRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/opencode/complete`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ account_name: finalAccountName, api_key: apiKey.trim() }),
      })

      if (!compRes.ok) {
        let errMsg = compRes.statusText
        try {
          const errJson = (await compRes.json()) as any
          errMsg = errJson.message || errJson.error || errMsg
        } catch (e) {}
        throw new Error(`Failed to save credential: ${errMsg}`)
      }

      console.log('\n\x1b[1m\x1b[32m✅ Successfully authenticated OpenCode Go!\x1b[0m')
      console.log('\x1b[32mYou can now run the Qmon Dashboard normally.\x1b[0m\n')
      return
    }

    console.log(`\n\x1b[33m⏳ Contacting Qmon API for ${provider} (${finalAccountName})...\x1b[0m`)
    const initRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/${provider}/initiate`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ account_name: finalAccountName }),
    })

    if (!initRes.ok) {
      let errMsg = initRes.statusText
      try {
        const errJson = (await initRes.json()) as any
        errMsg = errJson.message || errJson.error || errMsg
      } catch (e) {}
      throw new Error(`Failed to initiate auth: ${errMsg}`)
    }

    initData = (await initRes.json()) as any
    resData = initData.data || {}
  }

  // ==========================================
  // CODEX AUTH FLOW
  // ==========================================
  if (provider === 'codex') {
    if (!resData.url || !resData.code) {
      throw new Error(`Invalid response from server: missing URL or Code`)
    }

    console.log(`\n\x1b[1m\x1b[36m╭───────────────────────────────────────────────────╮\x1b[0m`)
    console.log(
      `\x1b[1m\x1b[36m│\x1b[0m  \x1b[1m🌐 Step 1: Login with GitHub / OpenAI\x1b[0m            \x1b[1m\x1b[36m│\x1b[0m`
    )
    console.log(`\x1b[1m\x1b[36m╰───────────────────────────────────────────────────╯\x1b[0m`)
    console.log(`\nPlease open this URL in your browser:\n`)
    console.log(`\x1b[4m\x1b[34m${resData.url}\x1b[0m\n`)

    console.log(`\x1b[1m\x1b[36m╭───────────────────────────────────────────────────╮\x1b[0m`)
    console.log(
      `\x1b[1m\x1b[36m│\x1b[0m  \x1b[1m🔑 Step 2: Enter Device Code\x1b[0m                     \x1b[1m\x1b[36m│\x1b[0m`
    )
    console.log(`\x1b[1m\x1b[36m╰───────────────────────────────────────────────────╯\x1b[0m`)
    console.log(`\nPlease type this code into the browser window:\n`)
    console.log(`\x1b[1m\x1b[33m   ${resData.code}\x1b[0m\n`)

    console.log(
      `\x1b[33mWaiting for you to authorize in the browser...\x1b[0m (Press Ctrl+C to cancel)\n`
    )

    // Polling loop
    while (true) {
      const statusRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/${provider}/status`, {
        method: 'GET',
        headers: getHeaders(),
      })
      const statusData = (await statusRes.json()) as any
      const state = statusData.data?.status

      if (state === 'success') {
        console.log('\x1b[1m\x1b[32m✅ Successfully authenticated Codex!\x1b[0m')
        console.log('\x1b[32mYou can now run the Qmon Dashboard normally.\x1b[0m\n')
        return
      } else if (state === 'error') {
        throw new Error(`Auth failed: ${statusData.message}`)
      }

      // Wait 2 seconds before polling again
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  // ==========================================
  // ANTIGRAVITY AUTH FLOW
  // ==========================================
  if (provider === 'antigravity') {
    const authUrl = resData.url || initData.url || JSON.stringify(initData)
    let autoMode = false

    try {
      console.log(`\n\x1b[1m\x1b[36m╭───────────────────────────────────────────────────╮\x1b[0m`)
      console.log(
        `\x1b[1m\x1b[36m│\x1b[0m  \x1b[1m🌐 Authorizing Antigravity\x1b[0m                      \x1b[1m\x1b[36m│\x1b[0m`
      )
      console.log(`\x1b[1m\x1b[36m╰───────────────────────────────────────────────────╯\x1b[0m`)
      console.log(`\n\x1b[36m🔗 Opening browser...\x1b[0m\n`)

      const redirectUrl = await startOAuthCallbackServer(authUrl)

      console.log(`\x1b[33m⏳ Verifying and saving token...\x1b[0m`)
      const compRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/${provider}/complete`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ redirect_url: redirectUrl, account_name: finalAccountName }),
      })

      if (!compRes.ok) {
        throw new Error(`Failed to complete auth: ${compRes.statusText}`)
      }

      console.log('\n\x1b[1m\x1b[32m✅ Successfully authenticated Antigravity!\x1b[0m')
      console.log('\x1b[32mYou can now run the Qmon Dashboard normally.\x1b[0m\n')
      autoMode = true
    } catch (e: any) {
      if (!autoMode) {
        console.log(
          `\n\x1b[33m⚠️  Auto-login unavailable (${e.message}), using manual mode.\x1b[0m\n`
        )
        console.log(`\x1b[1m\x1b[36m╭───────────────────────────────────────────────────╮\x1b[0m`)
        console.log(
          `\x1b[1m\x1b[36m│\x1b[0m  \x1b[1m🌐 Step 1: Login with Google\x1b[0m                     \x1b[1m\x1b[36m│\x1b[0m`
        )
        console.log(`\x1b[1m\x1b[36m╰───────────────────────────────────────────────────╯\x1b[0m`)
        console.log(`\nPlease open this URL in your browser:\n`)
        console.log(`\x1b[4m\x1b[34m${authUrl}\x1b[0m\n`)

        console.log(`\x1b[1m\x1b[36m╭───────────────────────────────────────────────────╮\x1b[0m`)
        console.log(
          `\x1b[1m\x1b[36m│\x1b[0m  \x1b[1m🔗 Step 2: Paste Redirect URL\x1b[0m                    \x1b[1m\x1b[36m│\x1b[0m`
        )
        console.log(`\x1b[1m\x1b[36m╰───────────────────────────────────────────────────╯\x1b[0m`)
        console.log(
          `\nAfter you authorize, Google will redirect you to an error page (\x1b[31mhttp://127.0.0.1:...\x1b[0m).`
        )
        console.log(
          `Don't worry, this is normal! Just copy that entire error URL from your browser's address bar.\n`
        )

        const redirectUrl = await askQuestion(
          '\x1b[1m\x1b[32m➜\x1b[0m Paste the redirect URL here: '
        )
        if (!redirectUrl.trim()) {
          console.log('Cancelled.')
          return
        }

        console.log('\n\x1b[33m⏳ Verifying and saving token...\x1b[0m')
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

        console.log('\n\x1b[1m\x1b[32m✅ Successfully authenticated Antigravity!\x1b[0m')
        console.log('\x1b[32mYou can now run the Qmon Dashboard normally.\x1b[0m\n')
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
      console.log(`\n\x1b[1m\x1b[36m╭───────────────────────────────────────────────────╮\x1b[0m`)
      console.log(
        `\x1b[1m\x1b[36m│\x1b[0m  \x1b[1m🌐 Authorizing Claude\x1b[0m                           \x1b[1m\x1b[36m│\x1b[0m`
      )
      console.log(`\x1b[1m\x1b[36m╰───────────────────────────────────────────────────╯\x1b[0m`)
      console.log(`\n\x1b[36m🔗 Opening browser...\x1b[0m\n`)

      const redirectUrl = await startOAuthCallbackServer(resData.url)
      const code = new URL(redirectUrl).searchParams.get('code') || ''

      console.log(`\x1b[33m⏳ Verifying and saving token...\x1b[0m`)
      const compRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/${provider}/complete`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ code, account_name: finalAccountName }),
      })

      if (!compRes.ok) {
        throw new Error(`Failed to complete auth: ${compRes.statusText}`)
      }

      console.log('\n\x1b[1m\x1b[32m✅ Successfully authenticated Claude!\x1b[0m')
      console.log('\x1b[32mYou can now run the Qmon Dashboard normally.\x1b[0m\n')
      autoMode = true
    } catch (e: any) {
      if (!autoMode) {
        console.log(
          `\n\x1b[33m⚠️  Auto-login unavailable (${e.message}), using manual mode.\x1b[0m\n`
        )
        console.log(`\x1b[1m\x1b[36m╭───────────────────────────────────────────────────╮\x1b[0m`)
        console.log(
          `\x1b[1m\x1b[36m│\x1b[0m  \x1b[1m🌐 Step 1: Login with Anthropic\x1b[0m                  \x1b[1m\x1b[36m│\x1b[0m`
        )
        console.log(`\x1b[1m\x1b[36m╰───────────────────────────────────────────────────╯\x1b[0m`)
        console.log(`\nPlease open this URL in your browser:\n`)
        console.log(`\x1b[4m\x1b[34m${resData.url}\x1b[0m\n`)

        console.log(`\x1b[1m\x1b[36m╭───────────────────────────────────────────────────╮\x1b[0m`)
        console.log(
          `\x1b[1m\x1b[36m│\x1b[0m  \x1b[1m🔗 Step 2: Paste Redirect URL\x1b[0m                    \x1b[1m\x1b[36m│\x1b[0m`
        )
        console.log(`\x1b[1m\x1b[36m╰───────────────────────────────────────────────────╯\x1b[0m`)
        console.log(`\nAfter you authorize, you will be redirected to a callback page.`)
        console.log(
          `Please copy the ENTIRE URL from your browser's address bar (it should contain ?code=...)\n`
        )

        const redirectUrl = await askQuestion(
          '\x1b[1m\x1b[32m➜\x1b[0m Paste the redirect URL or code here: '
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
            codeStr = urlObj.searchParams.get('code') || codeStr
          }
        } catch (e) {
          // not a valid URL, assume it's the raw code
        }

        console.log('\n\x1b[33m⏳ Verifying and saving Claude token...\x1b[0m')
        const compRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/${provider}/complete`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({ code: codeStr, account_name: finalAccountName }),
        })

        if (!compRes.ok) {
          throw new Error(`Failed to complete auth: ${compRes.statusText}`)
        }

        console.log('\n\x1b[1m\x1b[32m✅ Successfully authenticated Claude!\x1b[0m')
        console.log('\x1b[32mYou can now run the Qmon Dashboard normally.\x1b[0m\n')
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

    console.log(`\n\x1b[1m\x1b[36m╭───────────────────────────────────────────────────╮\x1b[0m`)
    console.log(
      `\x1b[1m\x1b[36m│\x1b[0m  \x1b[1m🌐 Login with GitHub (Copilot)\x1b[0m                  \x1b[1m\x1b[36m│\x1b[0m`
    )
    console.log(`\x1b[1m\x1b[36m╰───────────────────────────────────────────────────╯\x1b[0m`)
    console.log(`\nPlease open this URL in your browser:\n`)
    console.log(`\x1b[4m\x1b[34m${resData.url}\x1b[0m\n`)

    console.log(`\x1b[1m\x1b[36m╭───────────────────────────────────────────────────╮\x1b[0m`)
    console.log(
      `\x1b[1m\x1b[36m│\x1b[0m  \x1b[1m🔑 Enter Device Code\x1b[0m                              \x1b[1m\x1b[36m│\x1b[0m`
    )
    console.log(`\x1b[1m\x1b[36m╰───────────────────────────────────────────────────╯\x1b[0m`)
    console.log(`\nPlease type this code into the browser window:\n`)
    console.log(`\x1b[1m\x1b[33m   ${resData.code}\x1b[0m\n`)

    console.log(
      `\x1b[33mWaiting for you to authorize in the browser...\x1b[0m (Press Ctrl+C to cancel)\n`
    )

    // Polling loop
    while (true) {
      const statusRes = await fetch(`${getBaseUrl()}/api/v1/providers/auth/${provider}/status`, {
        method: 'GET',
        headers: getHeaders(),
      })
      const statusData = (await statusRes.json()) as any
      const state = statusData.data?.status

      if (state === 'success') {
        console.log('\x1b[1m\x1b[32m✅ Successfully authenticated Copilot!\x1b[0m')
        console.log('\x1b[32mYou can now run the Qmon Dashboard normally.\x1b[0m\n')
        return
      } else if (state === 'error') {
        throw new Error(`Auth failed: ${statusData.message}`)
      }

      // Wait 2 seconds before polling again
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
  }

  // Handle other providers (currently not supported)
  console.log(`\n\x1b[33mNote: CLI auth is not yet supported for '${provider}'.\x1b[0m`)
  console.log(`\x1b[33mSupported providers: antigravity, claude, codex, copilot\x1b[0m\n`)
}
