import vscode from 'vscode'
import { findUpPackageJson } from '../commands-core/packageJson'
import { fsExists, joinPackageJson } from '../commands-core/util'

export const openClosestPackageJson = async () => {
    const uri = vscode.window.activeTextEditor?.document.uri
    // not used atm
    const excludedSchemes = ['untitled', 'vscode', 'vscode-userdata']
    const includedSchemes = ['file', 'vscode-vfs']
    if (uri === undefined || !includedSchemes.includes(uri.scheme)) {
        // console.log()
        const firstWorkspace = vscode.workspace.workspaceFolders?.[0]
        if (!firstWorkspace) return
        const uriToOpen = joinPackageJson(firstWorkspace.uri)
        if (!(await fsExists(uriToOpen, true))) return
        await vscode.window.showTextDocument(uriToOpen)
        return
    }

    const closestPackageJson = await findUpPackageJson(uri)
    if (closestPackageJson === undefined) {
        await vscode.window.showWarningMessage('No closest package.json found')
        return
    }

    await vscode.window.showTextDocument(joinPackageJson(closestPackageJson))
    return undefined
}
