import { existsSync } from 'fs'
import { join } from 'path'
import vscode from 'vscode'
import { Utils } from 'vscode-uri'
import { findUpPackageJson } from '../commands-core/packageJson'

export const openClosestPackageJson = async () => {
    const uri = vscode.window.activeTextEditor?.document.uri
    if (uri === undefined || uri.scheme === 'untitled') {
        const firstWorkspace = vscode.workspace.workspaceFolders?.[0]
        if (!firstWorkspace || !existsSync(join(firstWorkspace.uri.fsPath, 'package.json'))) return
        const uriToOpen = Utils.joinPath(firstWorkspace.uri, 'package.json')
        await vscode.window.showTextDocument(uriToOpen)
        return
    }

    const closestPackageJson = await findUpPackageJson(uri)
    if (closestPackageJson === undefined) {
        await vscode.window.showWarningMessage('No closest package.json found')
        return
    }

    const uriToOpen = Utils.joinPath(closestPackageJson, 'package.json')
    await vscode.window.showTextDocument(uriToOpen)
    return undefined
}
