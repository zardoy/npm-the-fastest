import { existsSync } from 'fs'
import { join } from 'path'
import vscode from 'vscode'
import { extensionCtx, getExtensionSetting } from 'vscode-framework'
// import npmCheck from 'npm-check'
import { getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'
import { notificationConfirmAction } from '@zardoy/vscode-utils/build/ui'
import { getPrefferedPackageManager, packageManagerCommand } from './commands-core/packageManager'
import { supportedPackageManagers } from './core/packageManager'

export const registerPackageJsonWatcher = () => {
    // TODO don't spawn watchers and graceful onDidChangeConfiguration
    for (const [pm, { detectFile }] of Object.entries(supportedPackageManagers)) {
        const watcher = vscode.workspace.createFileSystemWatcher(`**/${detectFile}`, true, false, true)
        watcher.onDidChange(async uri => {
            const action = getExtensionSetting('install.watchPackageLocks')
            if (action === 'disabled') return
            if (action === 'prompt') {
                const result = await notificationConfirmAction(`${detectFile} has changed`, 'Run install')
                // if (!result) return
            }
        })
        extensionCtx.subscriptions.push(watcher)
    }
}

export const workspaceOpened = async (uri: vscode.Uri) => {
    const runOnOpen = getExtensionSetting('install.runOnOpen')
    if (runOnOpen === 'disable') return
    if (runOnOpen === 'always') await packageManagerCommand({ cwd: uri, command: 'install' })
    // Check if needed
    const workspaceUri = getCurrentWorkspaceRoot().uri
    const workspacePath = workspaceUri.fsPath
    if (existsSync(join(workspacePath, 'node_modules')) || !Object.values(supportedPackageManagers).some(({ detectFile }) => existsSync(detectFile))) return

    // const state = await npmCheck({
    //     skipUnused: true,
    // })
    // const notInstalledPackages = state
    //     .all()
    //     .packages.filter(({ isInstalled }) => !isInstalled)
    //     .map(({ moduleName }) => moduleName)
    // if (runOnOpen === 'askIfNeeded') {
    //     const response = await vscode.window.showInformationMessage(
    //         `Install missing packages ${notInstalledPackages.length > 5 ? notInstalledPackages.length : notInstalledPackages.join(', ')} ?`,
    //         'YES',
    //     )
    //     if (response !== 'YES') return
    // }
    if (runOnOpen === 'askIfNeeded') {
        const pm = await getPrefferedPackageManager(workspaceUri)
        const response = await vscode.window.showInformationMessage(
            'No node_modules and lockfile is present',
            `Run ${pm} ${supportedPackageManagers[pm].installCommand}`.trim(),
        )
        if (response !== 'YES') return
    }

    await packageManagerCommand({ cwd: uri, command: 'install' })
}
