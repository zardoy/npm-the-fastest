import execa from 'execa'
import { PackageJson } from 'type-fest'
import vscode, { workspace } from 'vscode'
import { showQuickPick, VscodeFramework } from 'vscode-framework'
// import { NodeDependenciesProvider } from './nodeDependencies'
import { getInstalledDepsItems, readPackageJsonWithMetadata } from './packageJson'

type PromiseType<T> = T extends Promise<infer U> ? U : never

export const activate = ctx => {
    const framework = new VscodeFramework(ctx).registerAllCommands({
        'install-packages': () => {},
        'remove-packages': async () => {
            const selectedDeps = await getInstalledDepsItems('Remove packages')
            if (selectedDeps === undefined) {
                return
            }
            // vscode.window.withProgress(
            //     {
            //         location: vscode.ProgressLocation.Notification,
            //         title: `Removing ${selectedDeps.length}`,
            //     },
            //     () => {},
            // )
        },
        'pnpm-offline-install'() {},
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
                    Object.entries(packageJson.scripts!).map(([scriptName, contents]) => {
                        return { label: scriptName, value: scriptName, detail: contents, description: '' }
                    }),
                )
                if (npmScript === undefined) {
                    return
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

    const launchedTasks: { [workspacePath: string]: { [npmScript: string]: vscode.TaskExecution } } = {}
    /**
     * - relaunches task if already launched
     * @throws if no `scripts` property exists
     * @returns false, if action needs to be stopped
     */
    const launchNpmTask = async (getNpmScript: (params: PromiseType<ReturnType<typeof readPackageJsonWithMetadata>>) => Promise<string | undefined>) => {
        const { packageJson, workspaceFolder, dir: workspacePath } = await readPackageJsonWithMetadata({ type: 'workspacesFirst' })
        if (!packageJson.scripts) {
            // TODO command title
            const name = await vscode.window.showErrorMessage('No `scripts` defined in package.json', 'Open package.json')
            return false
        }
        const packageManager = 'pnpm'
        const npmScript = await getNpmScript({ packageJson, workspaceFolder, dir: workspacePath })
        const task = new vscode.Task(
            {
                type: 'npm',
                script: npmScript,
                presentation: {
                    focus: false,
                } as vscode.TaskPresentationOptions,
            },
            workspaceFolder!,
            npmScript,
            'npm',
            new vscode.ShellExecution(packageManager, ['run', npmScript], { cwd: workspacePath }),
        )
        launchedTasks[workspacePath]?.[npmScript]?.terminate()
        const taskExecution = await vscode.tasks.executeTask(task)
        if (!launchedTasks[workspacePath]) launchedTasks[workspacePath] = {}
        launchedTasks[workspacePath]![npmScript] = taskExecution
    }
    // enforce: select pm, package.json location, check preinstall - if stats with -override.
}

const scriptIcons = {}

const getPrefferedScriptOrThrow = (packageJson: PackageJson, scripts: string[]) => {
    if (packageJson.scripts) {
        const availableScripts = Object.keys(packageJson.scripts)
        for (const script of scripts) {
            if (availableScripts.includes(script)) return script
        }
    }
    // TODO suggest to add one
    throw new Error(`Start script (${scripts.join(', ')}) not found`)
}
