import vscode from 'vscode'
import { extensionCtx, getExtensionSetting, registerExtensionCommand } from 'vscode-framework'
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
    if (getExtensionSetting('install.runOnOpen')) await packageManagerCommand({ cwd: uri, command: 'install' })
}
