import { showQuickPick, VscodeFramework } from 'vscode-framework'
import vscode from 'vscode'
import jsonfile from 'jsonfile'
import { PackageJson } from 'type-fest'
import { join } from 'path'
import depcheck from 'depcheck'
import { readPackageJson } from './packageJson'
import { NodeDependenciesProvider } from './nodeDependencies'

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

export const activate = ctx => {
    const framework = new VscodeFramework(ctx)

    vscode.window.registerTreeDataProvider('nodeDependencies', new NodeDependenciesProvider(vscode.workspace.workspaceFolders![0]!.uri.fsPath))

    framework.registerCommand('install-packages', async () => {
        const { workspaceFolders } = vscode.workspace
        if (workspaceFolders?.length !== 1) throw new Error('Open exactly one workspace')
        const workspace = workspaceFolders[0]!
        const cwd = workspace.uri.fsPath
        const packageJson = await readPackageJson(cwd)
        const script = getPrefferedScriptOrThrow(packageJson, ['dev', 'start'])
        const packageManager = 'pnpm'
        const task = new vscode.Task({ type: 'npm', script }, workspace, script, 'npm', new vscode.ShellExecution(packageManager, ['run', script], { cwd }))
        task.detail = script + ' t!'
        await vscode.tasks.executeTask(task)
    })

    framework.registerCommand('pnpm-offline-install', async () => {
        await vscode.window.showInformationMessage('yo there!')
    })

    framework.registerCommand('run-depcheck', () => {
        const { workspaceFolders } = vscode.workspace
        if (workspaceFolders?.length !== 1) throw new Error('Open exactly one workspace')
        const workspace = workspaceFolders[0]!
        const cwd = workspace.uri.fsPath
        // depcheck()
    })
}
