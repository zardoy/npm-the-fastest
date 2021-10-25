import vscode from 'vscode'
import { showQuickPick } from 'vscode-framework'
import { getPnpmOfflinePackages } from '../core/pnpmOffline'

export const pnpmOfflineInstall = async () => {
    const offlinePackages = await getPnpmOfflinePackages()
    const selectedPackages = await showQuickPick(
        Object.entries(offlinePackages).map(([name, versions]) => ({ label: name, value: name, description: `${versions.length}` })),
        {
            canPickMany: true,
            matchOnDescription: true,
        },
    )
}
