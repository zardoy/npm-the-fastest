import vscode from 'vscode'
import { pnpmCommand } from '../core/packageManager'

export const performInstallAction = async (cwd: string, packages: string[], flags?: string[] | string) => {
    let title = `Installing: ${packages.join(', ')}`
    if (flags?.includes('-D')) title += ' as dev'
    if (packages.length === 0) {
        void vscode.window.showWarningMessage('No packages to install provided')
        return
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title,
            cancellable: true,
        },
        async (progress, token) => {
            await pnpmCommand({
                command: 'add',
                packages,
                reportProgress: progress.report,
                cancellationToken: token,
                cwd,
                flags: typeof flags === 'string' ? flags.split(' ') : flags,
            })
        },
    )
}
