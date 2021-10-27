import vscode from 'vscode'
import { getExtensionSetting } from 'vscode-framework'

export const openNodeModulesFileAtGithub = (_, file: vscode.Uri) => {
    const NODE_MODULES = 'node_modules/'
    const nmIndex = file.path.indexOf(NODE_MODULES)
    const pathToNodeModules = file.path.slice(0, nmIndex + NODE_MODULES.length)
}
