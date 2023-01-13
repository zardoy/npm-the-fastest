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

    /**
     * This variable probably should be refactored, however:
     * When `null` (indicator): means that there are no detected recent changes from watcher and
     * it sets to callback during git checkout detection so it gets called back after potential fs watcher detection
     */
    let recentLockfileChanges: Array<{ action: 'created' | 'changed'; uri: vsc.Uri }> | null | ((cancel?: true) => void) = null

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const handleLockfileChangeUI = async (action: 'created' | 'changed', uri: vsc.Uri) => {
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

    const spawnWatcher = () => {
        // todo-low perf: when watchLockfilesGitCheckouts is true,
        // maybe don't need to spawn watcher until at least one repository is opened

        watcher = vsc.workspace.createFileSystemWatcher(`**/{${allLockfiles.join(',')}}`, false, false, true)

        const lockfileChangeHandler = (action: 'created' | 'changed') => async (uri: vsc.Uri) => {
            if (getExtensionSetting('install.watchLockfilesGitCheckouts')) {
                recentLockfileChanges ??= []
                let finalCallback: (() => void) | undefined
                if (!Array.isArray(recentLockfileChanges)) {
                    finalCallback = recentLockfileChanges
                    recentLockfileChanges = []
                }

                recentLockfileChanges.push({ action, uri })
                // do it in next loop when all (probably) lockfileChangeHandler callback are called
                setTimeout(() => finalCallback?.())
                setTimeout(() => {
                    recentLockfileChanges = null
                    // vscode git is slow
                }, 2600)
                return
            }

            await handleLockfileChangeUI(action, uri)
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

    // init git api
    // it is always inited as don't affect perf
    ;(async () => {
        const gitExtension = vsc.extensions.getExtension('vscode.git')
        if (!gitExtension) return
        const git = (await gitExtension.activate()).getAPI(1)
        if (!git) return
        await new Promise<void>(resolve => {
            const isApiReady = (apiState: string) => {
                if (apiState === 'initialized') resolve()
            }

            isApiReady(git.state)
            git.onDidChangeState(isApiReady)
        })
        const repo = git.repositories[0]
        if (!repo) return
        let { commit } = repo.state.HEAD ?? {}
        repo.state.onDidChange(async () => {
            const newCommit = repo.state.HEAD.commit
            if (commit === newCommit) return
            commit = newCommit

            if (recentLockfileChanges && !Array.isArray(recentLockfileChanges)) {
                // on some random checkouts on windows, repo.state.onDidChange gets called twice,
                // so we cancel old and bind new
                recentLockfileChanges(true)
                recentLockfileChanges = null
            }

            // eslint-disable-next-line curly
            if (recentLockfileChanges === null) {
                await new Promise<void>((resolve, reject) => {
                    recentLockfileChanges = cancel => {
                        if (cancel) reject()
                        else resolve()
                    }

                    setTimeout(() => {
                        recentLockfileChanges ??= []
                        resolve()
                        // small timeout if fs watcher didn't catch any changes
                    }, 500)
                }).catch(() => null)
            }

            for (const { action, uri } of recentLockfileChanges as any[]) void handleLockfileChangeUI(action, uri)
        })
    })()
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
