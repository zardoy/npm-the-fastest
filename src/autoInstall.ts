import vscode from 'vscode'
import { extensionCtx, getExtensionSetting, registerExtensionCommand } from 'vscode-framework'
// import npmCheck from 'npm-check'
import { packageManagerCommand } from './commands-core/packageManager'
import { confirmAction } from './commands-core/util'
import { supportedPackageManagers } from './core/packageManager'

export const registerPackageJsonWatcher = () => {
    // TODO don't spawn watchers and graceful onDidChangeConfiguration
    for (const [pm, { detectFile }] of Object.entries(supportedPackageManagers)) {
        const watcher = vscode.workspace.createFileSystemWatcher(`**/${detectFile}`, true, false, true)
        watcher.onDidChange(async uri => {
            const action = getExtensionSetting('install.watchPackageLocks')
            if (action === 'disabled') return
            if (action === 'prompt') {
                const result = await confirmAction(`${detectFile} has changed`, 'Run install')
                if (!result) return
            }
        })
        extensionCtx.subscriptions.push(watcher)
    }
}

export const workspaceOpened = async (uri: vscode.Uri) => {
    if (getExtensionSetting('install.runOnOpen') === 'disable') return
    if (getExtensionSetting('install.runOnOpen') === 'always') await packageManagerCommand({ cwd: uri, command: 'install' })
    // const state = await npmCheck({
    //     skipUnused: true,
    // })
    // const notInstalledPackages = state
    //     .all()
    //     .packages.filter(({ isInstalled }) => !isInstalled)
    //     .map(({ moduleName }) => moduleName)
    // if (getExtensionSetting('install.runOnOpen') === 'askIfNeeded') {
    //     const response = await vscode.window.showInformationMessage(
    //         `Install missing packages ${notInstalledPackages.length > 5 ? notInstalledPackages.length : notInstalledPackages.join(', ')} ?`,
    //         'YES',
    //     )
    //     if (response !== 'YES') return
    // }

    // await packageManagerCommand({ cwd: uri, command: 'install' })
}
