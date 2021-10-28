import vscode from 'vscode'
import { getExtensionSetting, registerExtensionCommand } from 'vscode-framework'

export const workspaceOpened = (workspaceUri: vscode.Uri) => {
    registerExtensionCommand('addPackages', () => {})
    getExtensionSetting('openWorkspaceAutoInstall')
}
