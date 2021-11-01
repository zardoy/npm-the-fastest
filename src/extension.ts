import vscode from 'vscode'
import { registerActiveDevelopmentCommand, registerAllExtensionCommands } from 'vscode-framework'
import { registerCodeActions } from './codeActions'
import { getPmFolders } from './commands-core/getPmFolders'
import { performInstallAction } from './commands-core/installPackages'
import { getCurrentWorkspaceRoot } from './commands-core/util'
import { installPackages } from './commands/addPackages'
import { openClosestPackageJson } from './commands/openClosestPackageJson'
import { pnpmOfflineInstall } from './commands/pnpmOfflineInstall'
import { removePackages } from './commands/removePackages'
import { runBinCommand } from './commands/runBinCommand'
import { startMainNpmScript } from './commands/startMainNpmScript'
import { startNpmScript } from './commands/startNpmScript'
import { registerCompletions } from './tsSnippets'

// TODO command for package diff

export const activate = () => {
    // @ts-expect-error
    registerAllExtensionCommands({
        runBinCommand,
        openClosestPackageJson,
        async addPackages(_, { packages }: { packages?: string[] } = {}) {
            if (packages) return performInstallAction(getCurrentWorkspaceRoot().uri.fsPath, packages)
            // no args are passed when executed normally (e.g. from command pallete)
            await installPackages('workspace')
        },
        async removePackages() {
            const moduleFolders = await getPmFolders()
            // const activeEditorFolder = vscode.workspace.getWorkspaceFolder()
            // await removePackages(cwd)
        },
        pnpmOfflineInstall,
        runNpmScript: startNpmScript,
        runMainNpmScript: startMainNpmScript,
    })

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

    registerCodeActions()
    registerCompletions()
    vscode.workspace.onDidChangeWorkspaceFolders(({ added }) => {})

    // enforce: select pm, package.json location, check preinstall - if stats with -override.
}
