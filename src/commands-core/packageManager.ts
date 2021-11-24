import execa from 'execa'
import vscode from 'vscode'
import { GracefulCommandError } from 'vscode-framework'
import { pnpmCommand, supportedPackageManagers, SupportedPackageManagersNames } from '../core/packageManager'
import { firstExists } from './util'

export const getPrefferedPackageManager = async (cwd: vscode.Uri): Promise<SupportedPackageManagersNames> => {
    let preffereddFromNpm = vscode.workspace.getConfiguration('npm').get<string>('packageManager')
    if (preffereddFromNpm === 'auto') preffereddFromNpm = undefined
    if (preffereddFromNpm) return preffereddFromNpm as any
    const { fs } = vscode.workspace
    const name = await firstExists(
        Object.entries(supportedPackageManagers).map(([name, { detectFile }]) => ({
            name,
            uri: vscode.Uri.joinPath(cwd, detectFile),
        })),
    )
    // TODO why npm
    return name ?? 'npm'
}

export const getPmVersion = async (pm: SupportedPackageManagersNames) => {
    try {
        return (await execa(pm, ['--version'])).stdout
    } catch {
        return undefined
    }
}

export const pmIsInstalledOrThrow = async (pm: SupportedPackageManagersNames) => {
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
    packages,
    realPackagesCount = packages?.length,
    flags,
    // TODO!
    displayCwd = false,
}: {
    cwd: vscode.Uri
    command: 'install' | 'add' | 'remove'
    displayCwd?: boolean
    realPackagesCount?: number
    // TODO combine them
    // cancellationToken?: vscode.CancellationToken
    packages?: string[]
    flags?: {
        global: boolean
        dev: boolean
    }
}) => {
    const pm = await getPrefferedPackageManager(cwd)
    const getMessage = () => {
        let msg = ''
        msg += command === 'remove' ? 'Removing' : 'Installing'
        if (realPackagesCount) msg += ` ${realPackagesCount}`
        msg += ' packages'
        msg += ` with ${pm}`
        return msg
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
                    await execa(pm, [command, ...(packages ?? [])], {
                        cwd: cwd.fsPath,
                    })
                    break
                case 'pnpm':
                    await pnpmCommand({
                        cwd: cwd.fsPath,
                        command,
                        cancellationToken,
                        packages,
                        reportProgress,
                    })
                    break

                default:
                    break
            }
        },
    )
}
