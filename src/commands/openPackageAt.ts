import * as vscode from 'vscode'
import defaultBranch from 'default-branch'
import { fromUrl } from 'hosted-git-info'
import { getExtensionCommandId, getExtensionSetting, registerExtensionCommand } from 'vscode-framework'
import { findUpNodeModules, pickInstalledDeps, readDirPackageJson } from '../commands-core/packageJson'

/** get module dir URI from closest node_modules */
const getClosestModulePath = async (module: string, path = '') => {
    const currentDirUri = vscode.Uri.joinPath(vscode.window.activeTextEditor!.document.uri, '..')
    const nodeModulesPath = await findUpNodeModules(currentDirUri)
    return vscode.Uri.joinPath(nodeModulesPath, 'node_modules', module, path)
}

export const registerOpenPackageAtCommands = () => {
    registerExtensionCommand('openOnNpm', async ({ command }, module?: string) => {
        if (!module) module = await pickInstalledDeps({ commandTitle: `Select package for ${command}`, multiple: false })
        if (module === undefined) return
        await vscode.env.openExternal(`https://npmjs.com/package/${module}` as any)
    })
    registerExtensionCommand('openAtPaka', async ({ command }, module?: string) => {
        if (!module) module = await pickInstalledDeps({ commandTitle: `Select package for ${command}`, multiple: false })
        if (module === undefined) return
        await vscode.env.openExternal(`https://paka.dev/npm/${module}` as any)
    })
    registerExtensionCommand('openPackageReadmePreview', async ({ command }, module?: string) => {
        if (!module) module = await pickInstalledDeps({ commandTitle: `Select package for ${command}`, multiple: false })
        if (module === undefined) return
        const readmeUri = await getClosestModulePath(module, 'README.MD')
        await vscode.commands.executeCommand('markdown.showPreviewToSide', readmeUri)
    })
    registerExtensionCommand('openPackageRepository', async ({ command }, module?: string) => {
        if (!module) module = await pickInstalledDeps({ commandTitle: `Select package for ${command}`, multiple: false })
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
}
