import * as vscode from 'vscode'
import defaultBranch from 'default-branch'
import { fromUrl } from 'hosted-git-info'
import { getExtensionCommandId, getExtensionSetting, registerExtensionCommand } from 'vscode-framework'
import { getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'
import { findUpNodeModules, pickInstalledDeps, readDirPackageJson } from '../commands-core/packageJson'
import { joinPackageJson, supportedFileSchemes } from '../commands-core/util'

/** get module dir URI from closest node_modules */
const getClosestModulePath = async (module: string, path = '') => {
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
        let { repository } = await readDirPackageJson(cwd)
        if (!repository) {
            // TODO try to resolve url automatically
            const action = await vscode.window.showWarningMessage(`${module} doesn't have repository field`, 'Open on NPM')
            if (action === 'Open on NPM') await vscode.commands.executeCommand(getExtensionCommandId('openOnNpm'), module)
            return
        }

        // TODO use lib from vsce
        // TODO support just url
        let repoDir: string | undefined
        if (typeof repository === 'object') {
            repoDir = repository.directory
            repository = repository.url
        }

        const repo = fromUrl(repository)!
        let urlPath = ''
        if (repo.domain === 'github.com' && repoDir) {
            let branchName: string
            if (getExtensionSetting('codeAction.resolveBranchName')) {
                console.time('get branch')
                branchName = await defaultBranch(`${repo.user}/${repo.project}`)
                console.timeEnd('get branch')
            } else {
                branchName = 'master'
            }

            urlPath = `/tree/${branchName}/${repoDir}`
        }

        await vscode.env.openExternal((repo.browse() + urlPath) as any)
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
        const packageJsonUri = joinPackageJson(await getClosestModulePath(module))
        await vscode.window.showTextDocument(packageJsonUri)
    })
}
