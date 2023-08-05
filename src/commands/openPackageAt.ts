import * as vscode from 'vscode'
import defaultBranch from 'default-branch'
import { getExtensionCommandId, getExtensionSetting, registerExtensionCommand, RegularCommands, showQuickPick } from 'vscode-framework'
import { getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'
import { noCase } from 'change-case'
import { findUpNodeModules, pickInstalledDeps, readDirPackageJson, showPackageJson } from '../commands-core/packageJson'
import { supportedFileSchemes } from '../commands-core/util'
import { getPackageRepositoryUrl } from './npmOpenRepository'

/** get module dir URI from closest node_modules */
export const getClosestModulePath = async (module: string, path = '') => {
    // TODO reuse readPackageJsonWithMetadata resolution logic
    const nodeModulesUri = await (async () => {
        const editor = vscode.window.activeTextEditor
        if (editor && supportedFileSchemes.includes(editor.document.uri.scheme)) {
            const currentDirUri = vscode.Uri.joinPath(vscode.window.activeTextEditor!.document.uri, '..')
            return findUpNodeModules(currentDirUri)
        }

        return getCurrentWorkspaceRoot().uri
    })()
    return vscode.Uri.joinPath(nodeModulesUri, 'node_modules', module, path)
}

export const registerOpenPackageAtCommands = () => {
    registerExtensionCommand('openOnNpm', async ({ command: commandId }, module?: string) => {
        if (!module) module = await pickInstalledDeps({ commandId, multiple: false, flatTypes: false })
        if (module === undefined) return
        await vscode.env.openExternal(`https://npmjs.com/package/${module}` as any)
    })

    registerExtensionCommand('openAtPaka', async ({ command: commandId }, module?: string) => {
        if (!module) module = await pickInstalledDeps({ commandId, multiple: false })
        if (module === undefined) return
        await vscode.env.openExternal(`https://paka.dev/npm/${module}` as any)
    })

    registerExtensionCommand('openPackageReadmePreview', async ({ command: commandId }, module?: string) => {
        if (!module) module = await pickInstalledDeps({ commandId, multiple: false })
        if (module === undefined) return
        const readmeUri = await getClosestModulePath(module, 'README.MD')
        await vscode.commands.executeCommand('markdown.showPreviewToSide', readmeUri)
    })

    registerExtensionCommand('openAtJsdelivr', async ({ command: commandId }, module?: string, file = '') => {
        if (!module) module = await pickInstalledDeps({ commandId, multiple: false, flatTypes: false })
        if (module === undefined) return
        const url = `https://cdn.jsdelivr.net/npm/${module}/${file}`
        await vscode.env.openExternal(url as any)
    })

    registerExtensionCommand('openPackageRepository', async ({ command: commandId }, module?: string) => {
        if (!module) module = await pickInstalledDeps({ commandId, multiple: false, flatTypes: false })
        if (module === undefined) return
        const cwd = await getClosestModulePath(module)
        const manifest = await readDirPackageJson(cwd)
        const { repository } = manifest
        if (!repository) {
            // TODO try to resolve url automatically
            const action = await vscode.window.showWarningMessage(`${module} doesn't have repository field`, 'Open on NPM')
            if (action === 'Open on NPM') await vscode.commands.executeCommand(getExtensionCommandId('openOnNpm'), module)
            return
        }

        const handlePathManually = typeof repository === 'object' && repository.url.startsWith('https://github.com/') && repository.directory
        let openPath = ''
        if (handlePathManually) {
            let branchName = 'master'
            if (getExtensionSetting('codeAction.resolveBranchName')) {
                console.time('get repo github branch')
                branchName = await defaultBranch(repository.url)
                console.timeEnd('get repo github branch')
            }

            openPath = `/tree/${branchName}/${repository.directory!.replace(/^\//, '')}`
        }

        try {
            const url: string = getPackageRepositoryUrl(module, { repository }, !handlePathManually)
            await vscode.commands.executeCommand('vscode.open', url.replace(/\/$/, '') + openPath)
        } catch (err) {
            await vscode.window.showWarningMessage(err.message ?? err.stack)
        }
    })

    registerExtensionCommand('revealInExplorer', async ({ command: commandId }, module?: string) => {
        if (!module) module = await pickInstalledDeps({ commandId, multiple: false, flatTypes: false })
        if (module === undefined) return
        const moduleUri = await getClosestModulePath(module)
        await vscode.commands.executeCommand('revealInExplorer', moduleUri)
    })

    registerExtensionCommand('openPackagePackageJson', async ({ command: commandId }, module?: string) => {
        if (!module) module = await pickInstalledDeps({ commandId, multiple: false, flatTypes: false })
        if (module === undefined) return
        const packageJsonUriDir = await getClosestModulePath(module)
        await showPackageJson(packageJsonUriDir)
    })

    registerExtensionCommand('openPackageAt', async ({ command: commandId }, module?: string) => {
        if (!module) module = await pickInstalledDeps({ commandId, multiple: false, flatTypes: false })
        if (module === undefined) return
        const actionCommand = await showQuickPick(
            openAtActions.map(action => ({ label: noCase(action), value: action })),
            { title: `Select action for ${module} package` },
        )
        if (!actionCommand) return
        await vscode.commands.executeCommand(getExtensionCommandId(actionCommand), module)
    })
}

export const openAtActions: Array<keyof RegularCommands> = [
    'openOnNpm',
    'openPackageRepository',
    'revealInExplorer',
    'openPackagePackageJson',
    'openPackageReadmePreview',
    'openAtJsdelivr',
    'openAtPaka',
]
