import { posix } from 'path'
import vscode from 'vscode'
import yamlJs from 'yamljs'
import { SupportedPackageManagersName } from '../core/packageManager'
import { readDirPackageJson } from './packageJson'
import { fsExists } from './util'
import { getPrefferedPackageManager } from './packageManager'

/** workspaces that have package.json in the root */
export const getPmFolders = async () => {
    const { fs, workspaceFolders = [] } = vscode.workspace
    // ultra-runner also has good implementation at this
    const pmWorkspaces = (await Promise.all(workspaceFolders.map(async ({ uri }) => fsExists(vscode.Uri.joinPath(uri, 'package.json')))))
        .map((keep, index) => ({ keep, workspace: workspaceFolders[index]! }))
        .filter(({ keep }) => keep)
    // TODO investigate recursive and single pattersn
    const getYarnWorkspaces = async (cwd: vscode.Uri) => {
        const packageJson = await readDirPackageJson(cwd)
        if (!packageJson.workspaces) return
        if (Array.isArray(packageJson.workspaces)) return { patterns: packageJson.workspaces }
        if (Array.isArray(packageJson.workspaces.packages)) return { patterns: packageJson.workspaces.packages }
        return undefined
    }

    const monorepoProviders: Record<SupportedPackageManagersName, (cwd: vscode.Uri) => Promise<{ patterns: string[] } | void>> = {
        npm: getYarnWorkspaces,
        yarn: getYarnWorkspaces,
        async pnpm(cwd) {
            const pnpmWorkspaceFile = vscode.Uri.joinPath(cwd, 'pnpm-workspace.yaml')
            if (await fsExists(pnpmWorkspaceFile)) return
            const y = yamlJs.parse(String(fs.readFile(pnpmWorkspaceFile)))
            if (y.packages) return { patterns: y.packages }
            return undefined
        },
    }
    /** encoded URIs */
    const moduleFolders = new Set<string>()
    for (const { workspace } of pmWorkspaces) {
        // add root as it have package.json
        moduleFolders.add(workspace.uri.toString())

        const pm = await getPrefferedPackageManager(workspace.uri)
        const result = await monorepoProviders[pm](workspace.uri)
        if (!result) continue
        // TODO try to unify pattersn
        for (const pattern of result.patterns) {
            const foundPackageJson = await vscode.workspace.findFiles(posix.join(pattern, 'package.json'))
            for (const path of foundPackageJson) moduleFolders.add(vscode.Uri.joinPath(path, '..').toString())
        }
    }

    console.debug('moduleFolders', moduleFolders)

    return moduleFolders
}
