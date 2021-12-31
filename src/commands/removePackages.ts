import vscode from 'vscode'
import { pickInstalledDeps } from '../commands-core/packageJson'
import { packageManagerCommand } from '../commands-core/packageManager'

export const removePackages = async (cwd: vscode.Uri, packages?: string[]) => {
    const selectedDeps = packages ?? (await pickInstalledDeps({ commandTitle: 'Remove packages' }))
    if (selectedDeps === undefined) return

    await packageManagerCommand({ cwd, command: 'remove', packages: selectedDeps })
}
