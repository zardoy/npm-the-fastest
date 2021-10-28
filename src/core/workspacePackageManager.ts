import vscode from 'vscode'
export const getWorkspacePackageManager = () => {
    let preffereddFromNpm = vscode.workspace.getConfiguration('npm').get<string>('packageManager')
    if (preffereddFromNpm === 'auto') preffereddFromNpm = undefined

}
