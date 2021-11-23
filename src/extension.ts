import vscode from 'vscode'
import { getExtensionSetting } from 'vscode-framework'
import { registerActiveDevelopmentCommand, registerAllExtensionCommands } from 'vscode-framework'
import { registerCodeActions } from './codeActions'
import { getPmFolders } from './commands-core/getPmFolders'
import { performInstallAction } from './commands-core/installPackages'
import { getPrefferedPackageManager, packageManagerCommand } from './commands-core/packageManager'
import { confirmAction, getCurrentWorkspaceRoot } from './commands-core/util'
import { installPackages } from './commands/addPackages'
import { openClosestPackageJson } from './commands/openClosestPackageJson'
import { pnpmOfflineInstall } from './commands/pnpmOfflineInstall'
import { removePackages } from './commands/removePackages'
import { runBinCommand } from './commands/runBinCommand'
import { startMainNpmScript } from './commands/startMainNpmScript'
import { startNpmScript } from './commands/startNpmScript'

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
            const moduleFolders = await getPmFolders()
            // const activeEditorFolder = vscode.workspace.getWorkspaceFolder()
            // await removePackages(cwd)
        },
        pnpmOfflineInstall,
        runNpmScript: startNpmScript,
        runMainNpmScript: startMainNpmScript,
    })

    registerCodeActions()
    vscode.workspace.onDidChangeWorkspaceFolders(({ added }) => {})
    vscode.window.onDidChangeWindowState(async ({ focused }) => {
        if (!focused) return
        console.time('detect')
        if (getExtensionSetting('install.clipboardDetection') === 'disabled') return
        // TODO add regex tests
        // TODO! detect -D
        const regex = /^(npm|yarn|pnpm) (?:i|install|add)((?: (?:@[a-z\d~-][a-z\d._~-]*\/)?[a-z\d~-][a-z\d._~-]*)+)$/
        const clipboardText = await vscode.env.clipboard.readText()
        const result = regex.exec(clipboardText.trim())
        if (!result) return
        const packageManager = result[1]!
        const packages = result[2]!.split(' ')
        console.timeEnd('detect')

        // TODO
        const cwd = getCurrentWorkspaceRoot()
        const prefferedPm = await getPrefferedPackageManager(cwd.uri)
        if (!(await confirmAction(`Detected package to install from clipboard: ${packages.join(', ')}`, `Install using ${prefferedPm}`))) return
        // TODO ensure progress
        await packageManagerCommand({
            cwd: cwd.uri,
            command: 'install',
            packages: packages,
        })
    })

    // enforce: select pm, package.json location, check preinstall - if stats with -override.
}
