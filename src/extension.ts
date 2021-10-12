import vscode from 'vscode'
import { showQuickPick, VSCodeFramework } from 'vscode-framework'
import got from 'got'
import { launchNpmTask } from './commands-core/npmScripts'
import { pickInstalledDeps } from './commands-core/packageJson'
// import { NodeDependenciesProvider } from './nodeDependencies'
import { getPrefferedScriptOrThrow } from './core/packageJson'
import { pnpmCommand } from './core/packageManager'
import { getPnpmOfflinePackages } from './core/pnpmOffline'

// remove unused
export const activate = ctx => {
    //@ts-ignore
    new VSCodeFramework(ctx).registerAllCommands({
        'install-packages': () => {
            // TODO just need to implement some kind of routing
            console.log(vscode.window.visibleTextEditors[0]?.document.uri)
            // const quickPick = vscode.window.createQuickPick()
            // quickPick.title = 'Install packages: foo, bar'
            // quickPick.placeholder = 'Hit Enter to install 2 packages'
            // quickPick.items = ['foo', 'bar'].map(s => ({ label: s }))
            // quickPick.onDidHide(quickPick.dispose)
            // quickPick.show()
            // got(`https://api.npms.io/v2/search?q=${}&size=20`)
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
            const name = await vscode.window.showErrorMessage('No `scripts` defined in package.json', 'Open package.json')
            console.log(name)
            await launchNpmTask(async ({ packageJson }) => {
                const npmScript = await showQuickPick(
                    Object.entries(packageJson.scripts!).map(([scriptName, contents]) => ({
                        label: scriptName,
                        value: scriptName,
                        detail: contents,
                        description: '',
                    })),
                )
                if (npmScript === undefined) return

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

    // enforce: select pm, package.json location, check preinstall - if stats with -override.
}
