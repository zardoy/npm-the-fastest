import * as vscode from 'vscode'
import { parseTree, getLocation } from 'jsonc-parser'
import { getExtensionSetting } from 'vscode-framework'

export const registerPackageJsonAutoComplete = () => {
    // if (true || !getExtensionSetting('scriptsCompletion')) return
    // vscode.languages.registerCompletionItemProvider('json', {
    //     provideCompletionItems(document, position, token, context) {
    //         if (!document.uri.path.endsWith('package.json')) return []
    //         const offset = document.offsetAt(position)
    //         const node = parseTree(document.getText())
    //         if (!node) return
    //         // getNdoeAtLocation
    //         // console.log(getLocation(document.getText(), offset).matches(['scripts', '*']))
    //     },
    // })
}
