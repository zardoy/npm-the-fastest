import vscode from 'vscode'

export const joinPackageJson = (uri: vscode.Uri) => vscode.Uri.joinPath(uri, 'package.json')
