import vscode from 'vscode'
import { registerAllExtensionCommands } from 'vscode-framework'
import { workspaceOpened } from './autoInstall'
import { registerCodeActions } from './codeActions'
import { performInstallAction } from './commands-core/addPackages'
import { throwIfNowPackageJson as throwIfNoPackageJson } from './commands-core/packageJson'
import { getCurrentWorkspaceRoot } from './commands-core/util'
import { installPackages } from './commands/addPackages'
import { openClosestPackageJson } from './commands/openClosestPackageJson'
import { pnpmOfflineInstall } from './commands/pnpmOfflineInstall'
import { removePackages } from './commands/removePackages'
import { runBinCommand } from './commands/runBinCommand'
import { startMainNpmScript } from './commands/startMainNpmScript'
import { startNpmScript } from './commands/startNpmScript'
import { registerClipboardDetection } from './core/clipboardDetection'

// TODO command for package diff

export const activate = () => {
    // @ts-expect-error Not all commands done
    registerAllExtensionCommands({
        runBinCommand,
        openClosestPackageJson,
        async addPackages(_, { packages }: { packages?: string[] } = {}) {
            if (packages) return performInstallAction(getCurrentWorkspaceRoot().uri.fsPath, packages)
            // no args are passed when executed normally (e.g. from command pallete)
            await installPackages('workspace')
        },
        async removePackages() {
            // const moduleFolders = await getPmFolders()
            const currentWorkspaceRoot = getCurrentWorkspaceRoot()
            await throwIfNoPackageJson(currentWorkspaceRoot.uri, true)
            await removePackages(currentWorkspaceRoot.uri)
        },
        pnpmOfflineInstall,
        runNpmScript: startNpmScript,
        runMainNpmScript: startMainNpmScript,
    })

    registerCodeActions()
    registerClipboardDetection()

    if (vscode.workspace.workspaceFolders?.length === 1) void workspaceOpened(vscode.workspace.workspaceFolders[0]!.uri)

    // enforce: select pm, package.json location, check preinstall - if stats with -override.
}
