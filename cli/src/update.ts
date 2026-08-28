import path from 'node:path'

const LOCAL_UPDATE_SCRIPT_PATH = path.join(import.meta.dir, '../../scripts/update.sh')
const UPDATE_SCRIPT_URL = 'https://raw.githubusercontent.com/IDNCraft/qmon/main/scripts/update.sh'

export async function runUpdate(releaseRef?: string): Promise<void> {
    const normalizedReleaseRef =
        releaseRef && !releaseRef.startsWith('v') ? `v${releaseRef}` : releaseRef
    const localUpdater = Bun.file(LOCAL_UPDATE_SCRIPT_PATH)
    const updaterScript = (await localUpdater.exists())
        ? await localUpdater.text()
        : await fetch(UPDATE_SCRIPT_URL).then(async (response) => {
            if (!response.ok) {
                throw new Error(`Unable to download updater: ${response.statusText}`)
            }
            return response.text()
        })

    if (!updaterScript.trim()) {
        throw new Error('Updater script is empty')
    }

    const updater = Bun.spawn(
        ['bash', '-s', '--', ...(normalizedReleaseRef ? [normalizedReleaseRef] : [])],
        {
            stdin: new Response(updaterScript),
            stdout: 'inherit',
            stderr: 'inherit',
        }
    )
    const exitCode = await updater.exited
    if (exitCode !== 0) {
        throw new Error(`Updater exited with code ${exitCode}`)
    }
}
