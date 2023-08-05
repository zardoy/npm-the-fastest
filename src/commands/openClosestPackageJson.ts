import vscode from 'vscode'
import { fsExists } from '@zardoy/vscode-utils/build/fs'
import { findUpPackageJson, showPackageJson } from '../commands-core/packageJson'
import { joinPackageJson, supportedFileSchemes } from '../commands-core/util'

export const openClosestPackageJson = async () => {
    const uri = vscode.window.activeTextEditor?.document.uri
    // not used atm
    const excludedSchemes = ['untitled', 'vscode', 'vscode-userdata']
    if (uri === undefined || !supportedFileSchemes.includes(uri.scheme)) {
        // console.log()
        const firstWorkspace = vscode.workspace.workspaceFolders?.[0]
        if (!firstWorkspace) return
        const uriToOpen = joinPackageJson(firstWorkspace.uri)
        if (!(await fsExists(uriToOpen, true))) return
        await showPackageJson(uriToOpen, false)
        return
    }

    const closestPackageJsonDir = await findUpPackageJson(uri)
    if (closestPackageJsonDir === undefined) {
        await vscode.window.showWarningMessage('No closest package.json found')
        return
    }

    await showPackageJson(closestPackageJsonDir)
    return undefined
}
