import vscode from 'vscode'
import whichPm from 'which-pm'
import execa from 'execa'
import filesize from 'filesize'
import fkill from 'fkill'

type PackageManagerConfig = {
    /** In codebase: lockfile */
    detectFile: string
    installCommand: string
    // minVersion?: string
    // fileWatchChanges?: boolean
}

const makeSupportedPackageManagers = <T extends string>(i: Record<T, PackageManagerConfig>) => i

/** Should be enhanced with package manager - min version map */
export const supportedPackageManagers = makeSupportedPackageManagers({
    npm: {
        detectFile: 'package-lock.json',
        installCommand: 'install',
    },
    pnpm: {
        detectFile: 'pnpm-lock.yaml',
        installCommand: 'install',
    },
    // yarn v1
    yarn: {
        detectFile: 'yarn.lock',
        installCommand: '',
    },
})
export type SupportedPackageManagersName = keyof typeof supportedPackageManagers

/** (if node_modules exists) Get package manager that was used to install deps and create node_modules */
const getUsedPackageManager = async (cwd: string) => {
    const { name } = await whichPm(cwd)
    if (!Object.keys(supportedPackageManagers).includes(name as any)) throw new TypeError(`Unsupported package manager ${name}`)
    return name as keyof typeof supportedPackageManagers
}

export const pnpmCommand = async ({
    command,
    packages,
    reportProgress,
    cwd,
    cancellationToken,
    flags = [],
}: {
    command: 'remove' | 'add' | 'install'
    packages?: string[]
    flags?: string[]
    cwd: string
    reportProgress: (_: { message: string }) => void
    cancellationToken: vscode.CancellationToken
}) => {
    const pnpm = execa('pnpm', [command, ...flags, ...(packages ?? []) /* , '--reporter', 'ndjson' */], { cwd })

    // TODO! pipe stderr to the output pane

    pnpm.stderr?.on?.('data', err => {
        console.error('[pnpm]', err)
    })

    cancellationToken.onCancellationRequested(async () => {
        console.log(`cancel received for pid ${pnpm.pid!}`)
        if (!pnpm.pid) return
        await fkill(pnpm.pid)
    })

    const pnpmStageMap = {
        resolution_started: 'Resolving packages',
        importing_started: 'Processing packages',
        importing_done: 'Processing packages done',
    }

    interface Lifecycle {
        name: 'pnpm:lifecycle'
        stage: string
        depPath: string // /d/v
        exitCode?: number
    }

    pnpm.stdout?.on('data', chunk => {
        const str = String(chunk).trim()
        if (!str) return
        console.log('[pnpm]', str)
    })

    // pnpm.stdout!.on('data', chunk => {
    //     const str = String(chunk)
    //     try {
    //         const newSteps = str
    //             .split('\n')
    //             .filter(s => s !== '')
    //             .map(s => JSON.parse(s))
    //             .map((d: Record<string, any>) => {
    //                 switch (d.name) {
    //                     case 'pnpm:fetching-progress': {
    //                         const m = d.packageId.match(/\/(.+)\/(.+)/)
    //                         return `Downloading ${m[1]}@${m[2]} (${filesize(d.size)})`
    //                     }

    //                     case 'pnpm:stage': {
    //                         const stage = pnpmStageMap[d.stage]
    //                         if (typeof stage === 'function') return stage(d)
    //                         return stage
    //                     }

    //                     case 'pnpm:lifecycle': {
    //                         return `Running ${d.stage} of ${d.depPath.match(/\/(.+)\//)[1]}`
    //                     }
    //                     // No default
    //                 }

    //                 return undefined
    //             })
    //             .filter(Boolean)
    //         // .map(d => d.stage)
    //         if (newSteps.length > 0)
    //             reportProgress({
    //                 message: newSteps.slice(-1)[0],
    //             })
    //     } catch (error) {
    //         console.error(error)
    //         console.error('Last string', str)
    //         throw error
    //     }
    // })

    await pnpm
}
