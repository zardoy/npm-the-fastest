import vscode from 'vscode'
import { pickInstalledDeps } from '../commands-core/packageJson'
import { pnpmCommand } from '../core/packageManager'

export const removePackages = async () => {
    const selectedDeps = await pickInstalledDeps({ commandTitle: 'Remove packages' })
    if (selectedDeps === undefined) return

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Removing ${selectedDeps.realDepsCount} packages`,
            cancellable: true,
        },
        async (progress, token) => {
            pnpmCommand('remove', selectedDeps, progress.report, token)
        },
    )
}
