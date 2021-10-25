import { registerAllExtensionCommands } from 'vscode-framework'
import { installPackages } from './commands/installPackages'
import { openClosestPackageJson } from './commands/openClosestPackageJson'
import { pnpmOfflineInstall } from './commands/pnpmOfflineInstall'
import { removePackages } from './commands/removePackages'
import { runBinCommand } from './commands/runBinCommand'
import { startMainNpmScript } from './commands/startMainNpmScript'
import { startNpmScript } from './commands/startNpmScript'
import { registerCompletions } from './tsSnippets'

export const activate = () => {
    registerAllExtensionCommands({
        runBinCommand,
        openClosestPackageJson,
        installPackages() {
            return installPackages('workspace')
        },
        removePackages: removePackages,
        pnpmOfflineInstall,
        runNpmScript: startNpmScript,
        runMainNpmScript: startMainNpmScript,
    })

    // if (vscode.env.appHost !== 'web') {
    //     const watcher = vscode.workspace.createFileSystemWatcher('**/package.json', true, false, true)
    //     watcher.onDidChange(uri => {
    //         // PNPM only detect shameful hoist
    //     })
    // }

    // const treeProvider = new NodeDependenciesProvider(vscode.workspace.workspaceFolders![0]!.uri.fsPath)
    // const treeView = vscode.window.createTreeView('nodeDependencies', {
    //     treeDataProvider: treeProvider,
    // })

    // treeView.onDidChangeVisibility(({ visible }) => {
    //     treeProvider.hidden = !visible
    //     if (visible === false) return
    //     treeView.message = 'Scanning dependencies'
    //     treeProvider.hidden = false
    //     treeProvider.refresh()
    //     treeProvider.onLoad = (setMessage = '') => (treeView.message = setMessage)
    // })

    registerCompletions()

    // enforce: select pm, package.json location, check preinstall - if stats with -override.
}
