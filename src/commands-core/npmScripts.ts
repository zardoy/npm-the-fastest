import vscode from 'vscode'
import { readPackageJsonWithMetadata } from './packageJson'

type PromiseType<T> = T extends Promise<infer U> ? U : never

// export const launchedTasks: { [workspacePath: string]: { [npmScript: string]: vscode.TaskExecution } } = {}

const detectAndAssignProblemMatcher = (task: vscode.Task, scriptContent: string) => {
    // TODO! simple cmd parser &&
    if (scriptContent.includes('tsc')) task.problemMatchers = ['$tsc']
    if (scriptContent.includes('esbuild')) task.problemMatchers = scriptContent.includes('--watch') ? ['$esbuild-watch'] : ['$esbuild']
}

/**
 * - relaunches task if already launched
 * @throws if no `scripts` property exists
 * @returns false, if action needs to be stopped
 */
export const launchNpmTask = async (getNpmScript: (params: PromiseType<ReturnType<typeof readPackageJsonWithMetadata>>) => Promise<string | undefined>) => {
    const { packageJson, workspaceFolder, dir: workspacePath } = await readPackageJsonWithMetadata({ type: 'workspacesFirst' })
    if (!packageJson.scripts) {
        // TODO command title
        // TODO change to define `start` script
        const action = await vscode.window.showErrorMessage('No `scripts` defined in package.json', 'Open package.json')
        // if (action) vscode.workspace.openTextDocument(vscode.Uri.file(join(workspacePath, 'package.json')))

        return
    }

    const packageManager = 'pnpm'
    const npmScript = await getNpmScript({ packageJson, workspaceFolder, dir: workspacePath })
    if (npmScript === undefined) return

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
        new vscode.ShellExecution(packageManager, ['run', npmScript], { cwd: workspacePath.fsPath }),
    )
    detectAndAssignProblemMatcher(task, packageJson.scripts[npmScript]!)

    // launchedTasks[workspacePath]?.[npmScript]?.terminate()
    const runningNpmTasks = vscode.tasks.taskExecutions.filter(({ task }) => task.source === 'npm')
    runningNpmTasks.find(({ task }) => task.name === npmScript)?.terminate()
    await vscode.tasks.executeTask(task)
    // if (!launchedTasks[workspacePath]) launchedTasks[workspacePath] = {}
    // launchedTasks[workspacePath]![npmScript] = taskExecution
}
