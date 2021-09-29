import { showQuickPick, VscodeFramework } from 'vscode-framework'
import vscode from 'vscode'

export const activate = ctx => {
    const framework = new VscodeFramework(ctx)

    framework.registerCommand('pnpm-offline-install', async () => {
        vscode.window.showInformationMessage('hey there!')
    })
}
