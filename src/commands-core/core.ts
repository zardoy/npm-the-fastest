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
