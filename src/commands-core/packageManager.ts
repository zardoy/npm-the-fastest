import vscode from 'vscode'
import execa from 'execa'
import { getExtensionSetting, GracefulCommandError } from 'vscode-framework'
import { firstExists } from '@zardoy/vscode-utils/build/fs'
import { getPmEnv, pnpmCommand, supportedPackageManagers, SupportedPackageManagersName } from '../core/packageManager'

export const getPrefferedPackageManager = async (cwd: vscode.Uri): Promise<SupportedPackageManagersName> => {
    let preffereddFromNpm = vscode.workspace.getConfiguration('npm').get<string>('packageManager')
    if (preffereddFromNpm === 'auto') preffereddFromNpm = undefined
    // TODO move it to bottom and always use workspace client
    if (preffereddFromNpm) return preffereddFromNpm as any
    const name = await firstExists(
        Object.entries(supportedPackageManagers).map(([name, { detectFile }]) => ({
            name,
            uri: vscode.Uri.joinPath(cwd, detectFile),
        })),
    )
    const leadingPackageManager = getExtensionSetting('leadingPackageManager')
    if (name) return name
    if (leadingPackageManager !== null) return leadingPackageManager
    let pm: SupportedPackageManagersName = 'npm' // will be used last
    // TODO check also version

    for (const pmToCheck of ['pnpm', 'yarn'] as SupportedPackageManagersName[])
        if (await getPmVersion(pmToCheck)) {
            pm = pmToCheck
            break
        }

    return pm
}

export const getPmVersion = async (pm: SupportedPackageManagersName) => {
    try {
        const cmd = await execa(pm, ['--version'])
        return cmd.stdout
    } catch {
        return undefined
    }
}

export const pmIsInstalledOrThrow = async (pm: SupportedPackageManagersName) => {
    const version = await getPmVersion(pm)
    if (!version) {
        if (pm === 'npm')
            throw new GracefulCommandError('npm is not installed, you can install it with Node.js', {
                actions: [
                    {
                        label: 'Download Node.js',
                        action() {
                            void vscode.env.openExternal(vscode.Uri.parse('https://nodejs.org/en/download/'))
                        },
                    },
                ],
            })
        const command = `npm i -g ${pm}`
        // we can implement action here easily whenever we can get more access to the terminal with API
        throw new GracefulCommandError(`${pm} is not installed. You can install it with \`${command}\``)
    }
}

export const packageManagerCommand = async ({
    cwd,
    command,
    packages = [],
    flags = [],
    // flags,
    // TODO!
    // displayCwd = false,
    // realPackagesCount = packages?.length,
    forcePm,
}: {
    cwd: vscode.Uri
    command: 'install' | 'add' | 'remove'
    // displayCwd?: boolean
    // realPackagesCount?: number
    flags?: string[] | string
    // TODO combine them
    // cancellationToken?: vscode.CancellationToken
    packages?: string[]
    forcePm?: SupportedPackageManagersName
    // flags?: {
    //     global: boolean
    //     dev: boolean
    // }
}) => {
    const pm = forcePm ?? (await getPrefferedPackageManager(cwd))
    // const getMessage = () => {
    //     let msg = ''
    //     msg += command === 'remove' ? 'Removing' : 'Installing'
    //     if (realPackagesCount) msg += ` ${realPackagesCount}`
    //     msg += ' packages'
    //     msg += ` with ${pm}`
    //     return msg
    // }
    const getMessage = (): string => {
        let msg = `[${pm}] `
        if (command === 'install') {
            msg += 'Installing workspace dependencies'
            return msg
        }

        msg += command === 'add' ? 'Installing' : 'Removing'
        msg += packages.length > 4 ? ` ${packages.length} packages` : `: ${packages.join(', ')}`
        if (flags.includes('-D')) msg += ' as dev'
        return msg
    }

    if (typeof flags === 'string') flags = flags.split(' ')
    let execCmd = command
    if (command === 'install') {
        execCmd = supportedPackageManagers[pm].installCommand as any
    } else if (packages.length === 0) {
        void vscode.window.showWarningMessage(`No packages to ${command} provided`)
        return
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: getMessage(),
            cancellable: true,
        },
        async ({ report: reportProgress }, cancellationToken) => {
            switch (pm) {
                case 'npm':
                case 'yarn':
                    // TODO yarn --json
                    await execa(pm, [execCmd, ...(packages ?? []), ...flags], {
                        cwd: cwd.fsPath,
                        extendEnv: false,
                        env: getPmEnv(pm) as any,
                    })
                    break
                case 'pnpm':
                    await pnpmCommand({
                        cwd: cwd.fsPath,
                        command: execCmd,
                        cancellationToken,
                        packages,
                        reportProgress,
                        flags: flags as string[],
                    })
                    break

                default:
                    break
            }
        },
    )
}
