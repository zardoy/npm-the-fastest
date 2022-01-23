import { showQuickPick } from 'vscode-framework'
import { sort } from 'semver'
import { packageManagerCommand, pmIsInstalledOrThrow } from '../commands-core/packageManager'
import { getPnpmOfflinePackages } from '../core/pnpmOffline'
import { getCurrentWorkspaceRoot } from '../commands-core/util'

export const pnpmOfflineInstall = async () => {
    await pmIsInstalledOrThrow('pnpm')
    const offlinePackages = await getPnpmOfflinePackages()
    const selectedPackages = await showQuickPick(
        Object.entries(offlinePackages).map(([name, versions]) => ({
            label: name,
            value: name,
            description: sort(versions, { includePrerelease: false }).slice(-1)[0],
        })),
        {
            canPickMany: true,
            matchOnDescription: true,
        },
    )
    if (selectedPackages === undefined) return
    const currentWorkspaceRoot = getCurrentWorkspaceRoot()
    await packageManagerCommand({
        command: 'add',
        packages: selectedPackages,
        cwd: currentWorkspaceRoot.uri,
        forcePm: 'pnpm',
        flags: ['--offline'],
    })
}
