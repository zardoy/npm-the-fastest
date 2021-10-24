import vscode from 'vscode'
import { registerAllExtensionCommands, registerNoop, showQuickPick } from 'vscode-framework'
import { Utils } from 'vscode-uri'
import { launchNpmTask } from './commands-core/npmScripts'
import { findUpPackageJson, pickInstalledDeps } from './commands-core/packageJson'
import { runBinCommand } from './commands/runBinCommand'
// import { NodeDependenciesProvider } from './nodeDependencies'
import { getPrefferedScriptOrThrow } from './core/packageJson'
import { pnpmCommand } from './core/packageManager'
import { getPnpmOfflinePackages } from './core/pnpmOffline'
import { registerCompletions } from './tsSnippets'

// TODO implement settings

export const activate = () => {
    registerNoop('Open closest package.json', async () => {
        const uri = vscode.window.activeTextEditor?.document.uri
        if (uri === undefined) return
        const closestPackageJson = await findUpPackageJson(uri)
        if (closestPackageJson === undefined) {
            await vscode.window.showWarningMessage('No closest package.json found')
            return
        }

        const uriToOpen = Utils.joinPath(closestPackageJson, 'package.json')
        console.log(uriToOpen)
        // TODO doesn't work!
        await vscode.workspace.openTextDocument(uriToOpen)
    })

    registerAllExtensionCommands({
        async 'run-bin-command'() {
            await runBinCommand()
        },
        'install-packages': () => {
            // TODO just need to implement some kind of routing
            const { fs } = vscode.workspace
        },
        'remove-packages': async () => {
            const selectedDeps = await pickInstalledDeps({ commandTitle: 'Remove packages' })
            if (selectedDeps === undefined) return

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: `Removing ${selectedDeps.realDepsCount} packages`,
                    cancellable: true,
                },
                async (progress, token) => {
                    pnpmCommand('remove', selectedDeps, progress.report, token)
                },
            )
        },
        async 'pnpm-offline-install'() {
            const offlinePackages = await getPnpmOfflinePackages()
            const quickPick = vscode.window.createQuickPick()
            quickPick.items = Object.entries(offlinePackages).map(([name, versions]) => ({ label: name, description: `${versions.length}` }))
            quickPick.onDidHide(quickPick.dispose)
            quickPick.show()
        },
        'run-depcheck'() {
            const { workspaceFolders } = vscode.workspace
            if (workspaceFolders?.length !== 1) throw new Error('Open exactly one workspace')
            const workspace = workspaceFolders[0]!
            const cwd = workspace.uri.fsPath
            // depcheck()
        },
        async 'start-npm-script'() {
            // const name = await vscode.window.showErrorMessage('No `scripts` defined in package.json', 'Open package.json')
            // console.log(name)
            await launchNpmTask(async ({ packageJson }) => {
                const scriptNamespaceIcon = {
                    test: 'test-view-icon',
                    generate: 'code',
                    compile: 'file-binary',
                    build: 'tools', // debug-configure - gear
                }
                const getIconForScript = (scriptName: string) => {
                    for (const [detector, icon] of Object.entries(scriptNamespaceIcon)) if (scriptName.includes(detector)) return ` $(${icon})`

                    return ''
                }

                const runningNpmTasks = vscode.tasks.taskExecutions.filter(({ task }) => task.source === 'npm')
                const npmScript = await showQuickPick(
                    Object.entries(packageJson.scripts!).map(([scriptName, contents]) => ({
                        label: runningNpmTasks.some(({ task }) => task.name === scriptName)
                            ? `$(loading~spin)${getIconForScript(scriptName)} ${scriptName}`
                            : scriptName,
                        value: scriptName,
                        detail: contents,
                        description: '',
                    })),
                )
                if (npmScript === undefined) return
                let runningNpmScript: vscode.TaskExecution | undefined
                if ((runningNpmScript = runningNpmTasks.find(({ task }) => task.name === npmScript))) {
                    // TODO multistep
                    const action = await showQuickPick(
                        [
                            { label: '$(debug-console) Focus Terminal', value: 'focus' },
                            { label: '$(terminal-kill) Kill the Process', value: 'kill' },
                            { label: '$(debug-restart) Restart the Process', value: 'restart' },
                        ],
                        {
                            title: `There is already running NPM script ${npmScript}`,
                        },
                    )
                    if (action === undefined) return
                    if (action === 'focus') {
                        vscode.window.terminals.find(({ name }) => name === npmScript)!.show()
                        return
                    }

                    if (action === 'kill') {
                        // TODO hide panel
                        runningNpmScript.terminate()
                        return
                    }

                    if (action === 'restart') {
                        runningNpmScript.terminate()
                        return npmScript
                    }
                }

                return npmScript
            })
        },
        async 'start-main-npm-script'() {
            await launchNpmTask(async ({ packageJson }) => {
                const npmScript = getPrefferedScriptOrThrow(packageJson, ['dev', 'start', 'watch'])
                return npmScript
            })
        },
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
