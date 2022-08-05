import vscode from 'vscode'
import { getExtensionId, getExtensionSettingId, registerActiveDevelopmentCommand, registerAllExtensionCommands } from 'vscode-framework'
import { getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'
import { workspaceOpened } from './autoInstall'
import { registerCodeActions } from './codeActions'
import { throwIfNowPackageJson as throwIfNoPackageJson } from './commands-core/packageJson'
import { packageManagerCommand } from './commands-core/packageManager'
import { addPackagesCommand } from './commands/addPackages'
import { openClosestPackageJson } from './commands/openClosestPackageJson'
import { registerOpenPackageAtCommands } from './commands/openPackageAt'
import { pnpmOfflineInstall } from './commands/pnpmOfflineInstall'
import { removePackages } from './commands/removePackages'
import { runBinCommand } from './commands/runBinCommand'
import { startMainNpmScript } from './commands/startMainNpmScript'
import { startNpmScript } from './commands/startNpmScript'
import { registerClipboardDetection } from './core/clipboardDetection'
import { activateStatusbar } from './features/statusbar'
import { registerPackageJsonAutoComplete } from './packageJsonAutoComplete'
import { startSpecialCommand } from './commands/startSpecialCommand'
import { registerRunOnSave } from './features/runOnSave'
import openWorkspacePackageJson from './commands/openWorkspacePackageJson'

// TODO command for package diff

export const activate = () => {
    // @ts-expect-error Not all commands are registered here
    registerAllExtensionCommands({
        runBinCommand,
        openClosestPackageJson,
        addPackages: addPackagesCommand,
        async removePackages(_, packages?: string[]) {
            // const moduleFolders = await getPmFolders()
            const currentWorkspaceRoot = getCurrentWorkspaceRoot()
            await throwIfNoPackageJson(currentWorkspaceRoot.uri, true)
            await removePackages(currentWorkspaceRoot.uri, packages)
        },
        pnpmOfflineInstall,
        async runInstall() {
            await packageManagerCommand({ cwd: getCurrentWorkspaceRoot().uri, command: 'install' })
        },
        startSpecialCommand,
        runNpmScript: startNpmScript,
        runMainNpmScript: startMainNpmScript,
        printEnv: () => {
            console.log(process.env)
        },
    })

    registerOpenPackageAtCommands()
    registerCodeActions()
    registerClipboardDetection()
    registerPackageJsonAutoComplete()
    activateStatusbar()
    registerRunOnSave()
    openWorkspacePackageJson()

    if (vscode.workspace.workspaceFolders?.length === 1) void workspaceOpened(vscode.workspace.workspaceFolders[0]!.uri)

    // enforce: select pm, package.json location, check preinstall - if stats with -override.
}
