import vscode from 'vscode'

export const registerCompletionProviders = () => {
    vscode.languages.registerCompletionItemProvider(
        {
            pattern: 'package.json',
            language: 'json',
        },
        {
            provideCompletionItems(document, position) {},
        },
    )
}
