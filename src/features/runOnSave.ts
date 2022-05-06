import * as vscode from 'vscode'
import { dirname } from 'path'
import execa from 'execa'
import minimatch from 'minimatch'
import { satisfies } from 'semver'
import { getExtensionSetting, getExtensionSettingId } from 'vscode-framework'
import { findUpPackageJson, readDirPackageJson } from '../commands-core/packageJson'

export const registerRunOnSave = () => {
    let disposable: vscode.Disposable | undefined
    const register = () => {
        disposable?.dispose()
        const runOnSave = getExtensionSetting('runOnSave')
        if (runOnSave.length === 0) return
        disposable = vscode.workspace.onWillSaveTextDocument(async ({ document, reason }) => {
            if (reason === vscode.TextDocumentSaveReason.AfterDelay) return
            if (!getExtensionSetting('runOnSave.runOnAutoSave') && reason === vscode.TextDocumentSaveReason.FocusOut) return
            const currentWorkspacePath = vscode.workspace.getWorkspaceFolder(document.uri)
            if (!currentWorkspacePath) return
            const packageJsonPath = runOnSave.some(({ deps }) => deps && deps.length > 0) ? await findUpPackageJson(document.uri) : undefined
            const packageJson = packageJsonPath! && (await readDirPackageJson(packageJsonPath))
            for (const rule of runOnSave) {
                // TODO!
                if (!minimatch(document.uri.fsPath, rule.relativePathGlob)) continue

                if (rule.deps && rule.deps.length > 0) {
                    if (!packageJsonPath) continue
                    const allDeps = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })
                    const discontinue = rule.deps.some(dep => {
                        if (typeof dep === 'string') return !allDeps.includes(dep)

                        return !Object.keys(packageJson[dep.type] ?? {}).includes(dep.dep)
                    })
                    if (discontinue) continue
                }

                console.log('running runOnSave command:', rule.command)
                await vscode.window.withProgress(
                    { location: vscode.ProgressLocation.Notification, cancellable: true, title: `Running ${rule.command}` },
                    async (_, token) => {
                        const cwd = (() => {
                            // eslint-disable-next-line default-case
                            switch (rule.cwd ?? 'file') {
                                case 'file':
                                    return dirname(document.uri.fsPath)
                                case 'packageJson':
                                    return packageJsonPath?.fsPath ?? dirname(document.uri.fsPath)
                                case 'workspace':
                                    return currentWorkspacePath.uri.fsPath
                            }
                        })()
                        const [command, ...args] = rule.command.split(' ')
                        const exec = execa(command!, args, { cwd })
                        token.onCancellationRequested(() => exec.cancel())
                        // TODO! also output output
                        await exec.catch(error => {
                            console.error(error.message)
                        })
                    },
                )
            }
        })
    }

    register()
    vscode.workspace.onDidChangeConfiguration(({ affectsConfiguration }) => {
        if (affectsConfiguration(getExtensionSettingId('runOnSave'))) register()
    })
}
