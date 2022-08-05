import * as vscode from 'vscode'
import { getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'
import { registerExtensionCommand } from 'vscode-framework'
import { joinPackageJson } from '../commands-core/util'

export default () => {
    registerExtensionCommand('openWorkspacePackageJson', async () => {
        const currentWorkspace = getCurrentWorkspaceRoot()
        await vscode.window.showTextDocument(joinPackageJson(currentWorkspace.uri))
    })
}
