import vscode from 'vscode'
import { pnpmCommand } from '../core/packageManager'

export const performInstallAction = async (cwd: string, packages: string[], flags?: string[]) => {
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Installing: ${packages.join(', ')}`,
            cancellable: true,
        },
        async (progress, token) => {
            await pnpmCommand({ command: 'add', packages, reportProgress: progress.report, cancellationToken: token, cwd, flags })
        },
    )
}
