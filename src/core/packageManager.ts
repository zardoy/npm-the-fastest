import whichPm from 'which-pm'
import execa from 'execa'
import filesize from 'filesize'
import vscode from 'vscode'

type PackageManagerConfig = {
    detectFile: string
    // minVersion?: string
    // fileWatchChanges?: boolean
}

const makeSupportedPackageManagers = <T extends string>(i: Record<T, PackageManagerConfig>) => i

/** Should be enhanced with package manager - min version map */
export const supportedPackageManagers = makeSupportedPackageManagers({
    npm: {
        detectFile: 'package-lock.json',
    },
    pnpm: {
        detectFile: 'pnpm-lock.yaml',
    },
    // yarn v1
    yarn: {
        detectFile: 'yarn.lock',
    },
})
export type SupportedPackageManagersNames = keyof typeof supportedPackageManagers

/** Get package manager that was used to install deps and create node_modules */
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
}: {
    command: 'remove' | 'add' | 'install'
    packages?: string[]
    cwd: string
    reportProgress: (_: { message: string }) => void
    cancellationToken: vscode.CancellationToken
}) => {
    const pnpm = execa('pnpm', [command, ...(packages ?? []), '--reporter', 'ndjson'], { cwd })

    // TODO! pipe stderr to the output pane

    pnpm.stderr?.on?.('data', err => {
        console.log(err)
    })

    cancellationToken.onCancellationRequested(() => pnpm.kill())

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

    pnpm.stdout!.on('data', chunk => {
        const str = String(chunk)
        try {
            const newSteps = str
                .split('\n')
                .filter(s => s !== '')
                .map(s => JSON.parse(s))
                .map((d: Record<string, any>) => {
                    switch (d.name) {
                        case 'pnpm:fetching-progress': {
                            const m = d.packageId.match(/\/(.+)\/(.+)/)
                            return `Downloading ${m[1]}@${m[2]} (${filesize(d.size)})`
                        }

                        case 'pnpm:stage': {
                            const stage = pnpmStageMap[d.stage]
                            if (typeof stage === 'function') return stage(d)
                            return stage
                        }

                        case 'pnpm:lifecycle': {
                            return `Running ${d.stage} of ${d.depPath.match(/\/(.+)\//)[1]}`
                        }
                        // No default
                    }

                    return undefined
                })
                .filter(Boolean)
            // .map(d => d.stage)
            if (newSteps.length > 0)
                reportProgress({
                    message: newSteps.slice(-1)[0],
                })
        } catch (error) {
            console.error(str)
            throw error
        }
    })

    await pnpm
}
