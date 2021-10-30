import vscode from 'vscode'

/**
 * Get workspace of current opened editor or **first one** otherwise
 * @throws If no folder opened
 */
export const getCurrentWorkspaceRoot = () => {
    const firstWorkspace = vscode.workspace.workspaceFolders?.[0]
    if (!firstWorkspace) throw new Error('This action is available only in opened workspace (folder)')
    const activeDocumentUri = vscode.window.activeTextEditor?.document.uri
    return activeDocumentUri && activeDocumentUri.scheme !== 'untitled'
        ? vscode.workspace.getWorkspaceFolder(activeDocumentUri) ?? firstWorkspace
        : firstWorkspace
}

export const fsExists = async (uri: vscode.Uri) => {
    const { fs } = vscode.workspace
    try {
        await fs.stat(uri)
        return true
    } catch {
        return false
    }
}

export const firstExists = async <T>(
    paths: Array<{
        name: T
        uri: vscode.Uri
    }>,
) => {
    // not using Promise.race alternatives to ensure the same pm is used if several lockfiles are present
    // eslint-disable-next-line no-await-in-loop
    for (const { uri, name } of paths) if (await fsExists(uri)) return name
    return undefined
}

export const confirmAction = async (message: string, confirmButton: string) => {
    const selectedAction = await vscode.window.showInformationMessage(message, confirmButton)
    return selectedAction === confirmButton
}
