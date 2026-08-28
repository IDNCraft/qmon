export const LATEST_RELEASE_API_URL = 'https://api.github.com/repos/IDNCraft/qmon/releases/latest'

export async function openUrlInBrowser(url: string): Promise<void> {
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
