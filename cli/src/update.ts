import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

import { LATEST_RELEASE_API_URL } from './openUrl'
import { stopSidecar } from './sidecar'

const REPOSITORY_URL = process.env.QMON_REPO_URL ?? 'https://github.com/IDNCraft/qmon.git'
const TOTAL_UPDATE_STEPS = 3

export interface UpdateProgress {
    step: number
    total: number
    label: string
}

export interface ReleaseInfo {
    version: string
    name: string
    notes: string
}

type UpdateProgressCallback = (progress: UpdateProgress) => void

function getInstallDir(): string {
    const configuredDir = process.env.QMON_INSTALL_DIR
    if (configuredDir) return configuredDir

    const executableName = path.basename(process.execPath)
    if (executableName === 'qmon' || executableName === 'qmon.exe') {
        return path.dirname(process.execPath)
    }
    return path.join(homedir(), '.local', 'bin')
}

function isDigits(value: string): boolean {
    return value.length > 0 && [...value].every((character) => character >= '0' && character <= '9')
}

function isReleaseIdentifier(value: string): boolean {
    return (
        value.length > 0 &&
        [...value].every(
            (character) =>
                (character >= '0' && character <= '9') ||
                (character >= 'A' && character <= 'Z') ||
                (character >= 'a' && character <= 'z') ||
                character === '.' ||
                character === '-'
        )
    )
}

function normalizeReleaseRef(releaseRef: string | undefined): string | undefined {
    if (!releaseRef?.trim()) return undefined
    const normalized = releaseRef.startsWith('v') ? releaseRef : `v${releaseRef}`
    const version = normalized.slice(1)
    const metadataParts = version.split('+', 2)
    const versionWithoutMetadata = metadataParts[0] ?? ''
    const metadata = metadataParts.length > 1 ? metadataParts[1] : undefined
    const prereleaseParts = versionWithoutMetadata.split('-')
    const core = prereleaseParts[0] ?? ''
    const prerelease = prereleaseParts.length > 1 ? prereleaseParts.slice(1).join('-') : undefined
    const coreParts = core.split('.')
    const validCore = coreParts.length === 3 && coreParts.every((part) => isDigits(part))
    const validPrerelease = prerelease === undefined || isReleaseIdentifier(prerelease)
    const validMetadata = metadata === undefined || isReleaseIdentifier(metadata)
    if (!validCore || !validPrerelease || !validMetadata) {
        throw new TypeError(`Invalid release ref '${releaseRef}'. Expected a tag like v1.5.0.`)
    }
    return normalized
}

async function resolveReleaseRef(
    releaseRef: string | undefined,
    onProgress?: UpdateProgressCallback
): Promise<string> {
    const normalized = normalizeReleaseRef(releaseRef)
    if (normalized) return normalized

    onProgress?.({ step: 0, total: TOTAL_UPDATE_STEPS, label: 'Checking latest release...' })
    const response = await fetch(LATEST_RELEASE_API_URL, {
        signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
        throw new Error(`Unable to resolve latest release: ${response.statusText}`)
    }

    const data = (await response.json()) as { tag_name?: unknown }
    if (typeof data.tag_name !== 'string') {
        throw new TypeError('Latest release did not include a valid tag')
    }
    return normalizeReleaseRef(data.tag_name) ?? ''
}

async function runCommand(command: string[], cwd: string): Promise<void> {
    const commandLabel = command.join(' ')
    let child
    try {
        child = Bun.spawn(command, {
            cwd,
            stdout: 'ignore',
            stderr: 'ignore',
        })
    } catch (error) {
        throw new Error(
            `${command[0]} unavailable: ${error instanceof Error ? error.message : String(error)}`
        )
    }

    const exitCode = await child.exited
    if (exitCode !== 0) {
        throw new Error(`${commandLabel} failed with exit code ${exitCode}`)
    }
}

export async function runUpdate(
    releaseRef?: string,
    onProgress?: UpdateProgressCallback
): Promise<void> {
    const resolvedRef = await resolveReleaseRef(releaseRef, onProgress)
    const installDir = getInstallDir()
    const tempRoot = await mkdtemp(path.join(tmpdir(), 'qmon-update-'))
    const sourceRoot = path.join(tempRoot, 'qmon')

    try {
        onProgress?.({
            step: 1,
            total: TOTAL_UPDATE_STEPS,
            label: `Downloading Qmon ${resolvedRef}...`,
        })
        await runCommand(
            [
                'git',
                'clone',
                '--depth',
                '1',
                '--branch',
                resolvedRef,
                '--single-branch',
                REPOSITORY_URL,
                sourceRoot,
            ],
            tempRoot
        )

        onProgress?.({
            step: 2,
            total: TOTAL_UPDATE_STEPS,
            label: 'Installing CLI dependencies...',
        })
        await runCommand(['bun', 'install', '--frozen-lockfile'], path.join(sourceRoot, 'cli'))

        onProgress?.({
            step: 3,
            total: TOTAL_UPDATE_STEPS,
            label: 'Building and installing Qmon...',
        })
        await runCommand(['make', '-C', sourceRoot, 'install', `BIN_DIR=${installDir}`], sourceRoot)
    } finally {
        await rm(tempRoot, { recursive: true, force: true })
    }
}

let rendererDestroy: (() => void) | null = null

export function setRendererDestroy(destroy: () => void): void {
    rendererDestroy = destroy
}

export function restartQmon(): void {
    rendererDestroy?.()
    stopSidecar()
    // Release the parent from tty ownership: destroy() above restored the terminal,
    // and the child below becomes the sole reader of stdin in the same process group.
    // No-op handlers keep the parent alive when the child receives Ctrl+C.
    process.removeAllListeners('SIGINT')
    process.removeAllListeners('SIGTERM')
    process.on('SIGINT', () => { })
    process.on('SIGTERM', () => { })
    const restartedProcess = Bun.spawn([process.execPath, ...process.argv.slice(1)], {
        stdin: 'inherit',
        stdout: 'inherit',
        stderr: 'inherit',
    })
    void restartedProcess.exited.then((exitCode) => {
        process.exit(exitCode)
    })
}
