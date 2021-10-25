import vscode from 'vscode'
import { Utils } from 'vscode-uri'
import { findUpPackageJson } from '../commands-core/packageJson'

export const openClosestPackageJson = async () => {
    const uri = vscode.window.activeTextEditor?.document.uri
    if (uri === undefined) return
    const closestPackageJson = await findUpPackageJson(uri)
    if (closestPackageJson === undefined) {
        await vscode.window.showWarningMessage('No closest package.json found')
        return
    }

    const uriToOpen = Utils.joinPath(closestPackageJson, 'package.json')
    console.log(uriToOpen)
    // TODO doesn't work!
    await vscode.workspace.openTextDocument(uriToOpen)
}
