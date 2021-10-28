import vscode from 'vscode'
import { extensionCtx, registerExtensionCommand } from 'vscode-framework'

export const registerPackageJsonWatcher = () => {
    const watcher = vscode.workspace.createFileSystemWatcher('**/package.json', false, false, false)
    watcher.onDidChange(uri => {
        console.log('change', uri.path)
    })
    extensionCtx.subscriptions.push(watcher)
}
