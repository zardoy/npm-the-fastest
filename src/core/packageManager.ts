/* eslint-disable @typescript-eslint/naming-convention */
import vscode from 'vscode'
import whichPm from 'which-pm'
import execa from 'execa'
import filesize from 'filesize'
import fkill from 'fkill'
import { getExtensionSetting } from 'vscode-framework'
import { pickObj } from '@zardoy/utils'

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
    pnpm: {
        detectFile: 'pnpm-lock.yaml',
        installCommand: 'install',
    },
    // yarn v1
    yarn: {
        detectFile: 'yarn.lock',
        installCommand: '',
    },
    npm: {
        detectFile: 'package-lock.json',
        installCommand: 'install',
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
    const pnpmArgs = [command, ...flags, ...(packages ?? []) /* , '--reporter', 'ndjson' */]
    console.log('Running:', 'pnpm', pnpmArgs.map(str => `"${str}"`).join(' '))
    const pnpm = execa('pnpm', pnpmArgs, {
        cwd,
        extendEnv: false,
        env: getPmEnv('pnpm') as any,
    })

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
        const firstLine = str.split('\n')[0]!
        if (firstLine === 'Already up-to-date') reportProgress({ message: firstLine })
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

export const packageManagerInstallUiCommand = (pm: string) => `${pm} ${supportedPackageManagers[pm].installCommand}`.trim()

export const getPmEnv = (pm: SupportedPackageManagersName) => {
    const packageManagerAllowedEnv = getExtensionSetting('packageManagerAllowedEnv')
    if (packageManagerAllowedEnv === 'disable') return process.env
    if (packageManagerAllowedEnv === 'include') return pickSystemEnv()

    return getCleanedEnv()
}

const pickSystemEnv = () => {
    const pickEnv = pickEnvPerPlatform[process.platform] || false
    // fallback to 'exclude'
    if (pickEnv === false) return getCleanedEnv()

    return pickObj(process.env, ...(pickEnv as [any]))
}

const getCleanedEnv = () => {
    const additionalExclude = new Set(['INIT_CWD', 'HOME', 'NODE', 'NODE_PATH'])
    const newEnv = { ...process.env }
    for (const envKey of Object.keys(newEnv))
        if (
            envKey.startsWith('npm_') ||
            envKey.startsWith('PNPM_') ||
            envKey.startsWith('VSCODE_') ||
            envKey.startsWith('ELECTRON_') ||
            additionalExclude.has(envKey)
        )
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete newEnv[envKey]
    return newEnv
}

const pickEnvPerPlatform = {
    win32: [
        'APPDATA',
        'HOMEDRIVE',
        'ALLUSERSPROFILE',
        'CommonProgramFiles',
        'CommonProgramFiles(x86)',
        'COMPUTERNAME',
        'HOMEDRIVE',
        'HOMEPATH',
        'OS',
        'NUMBER_OF_PROCESSORS',
        'PATHEXT',
        'ProgramData',
        'ProgramFiles(x86)',
        'ProgramW6432',
        'PUBLIC',
        'SystemDrive',
        'SystemRoot',
        'TEMP',
        'TMP',
        'USERDOMAIN',
        'USERNAME',
        'USERPROFILE',
        'winddir',
    ],
    darwin: ['Path'],
}
