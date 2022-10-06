import { existsSync } from 'fs'
import { join } from 'path'
import * as vsc from 'vscode'
import { extensionCtx, getExtensionSetting, getExtensionSettingId } from 'vscode-framework'
// import npmCheck from 'npm-check'
import { getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'
import { Utils } from 'vscode-uri'
import { getPrefferedPackageManager, packageManagerCommand } from './commands-core/packageManager'
import { packageManagerInstallUiCommand, supportedPackageManagers, SupportedPackageManagersName } from './core/packageManager'

const allLockfiles = Object.values(supportedPackageManagers).map(({ detectFile }) => detectFile)

export const registerLockfilesWatcher = () => {
    let watcher: vsc.FileSystemWatcher | undefined
    const spawnWatcher = () => {
        watcher = vsc.workspace.createFileSystemWatcher(`**/{${allLockfiles.join(',')}}`, false, false, true)
        const lockfileChangeHandler = (action: 'created' | 'changed') => async (uri: vsc.Uri) => {
            const lockfileName = Utils.basename(uri)
            const packageManager = Object.entries(supportedPackageManagers).find(([, { detectFile }]) => detectFile === lockfileName)?.[0] as
                | SupportedPackageManagersName
                | undefined
            if (!packageManager) return
            const response =
                // eslint-disable-next-line sonarjs/no-duplicate-string
                getExtensionSetting('install.watchLockfiles') === 'installWithoutPrompt'
                    ? true
                    : await vsc.window.showInformationMessage(`${lockfileName} ${action}`, `Run ${packageManagerInstallUiCommand(packageManager)}`)
            if (!response) return
            await packageManagerCommand({ cwd: vsc.Uri.joinPath(uri, '..'), command: 'install', forcePm: packageManager })
        }

        watcher.onDidChange(lockfileChangeHandler('changed'))
        watcher.onDidCreate(lockfileChangeHandler('created'))
        extensionCtx.subscriptions.push(watcher)
    }

    const updateWatcher = () => {
        if (getExtensionSetting('install.watchLockfiles') === 'disabled') watcher?.dispose()
        else if (!watcher) spawnWatcher()
    }

    vsc.workspace.onDidChangeConfiguration(({ affectsConfiguration }) => {
        if (affectsConfiguration(getExtensionSettingId('install.watchLockfiles'))) updateWatcher()
    })
    updateWatcher()
}

export const workspaceOpened = async (uri: vsc.Uri) => {
    const runOnOpen = getExtensionSetting('install.runOnOpen')
    if (runOnOpen === 'disable') return
    if (runOnOpen === 'always') await packageManagerCommand({ cwd: uri, command: 'install' })
    // Check if needed
    const workspaceUri = getCurrentWorkspaceRoot().uri
    const workspacePath = workspaceUri.fsPath
    if (existsSync(join(workspacePath, 'node_modules'))) return
    const presentLockfile = allLockfiles.find(lockfile => existsSync(join(workspacePath, lockfile)))
    if (!presentLockfile) return

    // const state = await npmCheck({
    //     skipUnused: true,
    // })
    // const notInstalledPackages = state
    //     .all()
    //     .packages.filter(({ isInstalled }) => !isInstalled)
    //     .map(({ moduleName }) => moduleName)
    // if (runOnOpen === 'askIfNeeded') {
    //     const response = await vscode.window.showInformationMessage(
    //         `Install missing packages ${notInstalledPackages.length > 5 ? notInstalledPackages.length : notInstalledPackages.join(', ')} ?`,
    //         'YES',
    //     )
    //     if (response !== 'YES') return
    // }
    if (runOnOpen === 'askIfNeeded') {
        const pm = await getPrefferedPackageManager(workspaceUri)
        const response = await vsc.window.showInformationMessage(
            `No node_modules and ${presentLockfile} is present`,
            `Run ${packageManagerInstallUiCommand(pm)}`,
        )
        if (!response) return
    }

    // ifNeeded
    await packageManagerCommand({ cwd: uri, command: 'install' })
}
