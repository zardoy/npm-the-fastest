import jsonfile from 'jsonfile'
import { join } from 'path'
import { PackageJson } from 'type-fest'
import { showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'
import vscode from 'vscode'
import pkgDir from 'pkg-dir'

// TODO remove workspacesFirst
type PackageJsonLocation = 'workspacesFirst' | 'closest'

// TODO rename method
export const readPackageJsonWithMetadata = async (location: string | { type: PackageJsonLocation }) => {
    let workspaceFolder: undefined | vscode.WorkspaceFolder
    // TODO-low refactor?
    const cwd = await (async () => {
        if (typeof location === 'object') {
            if (location.type === 'workspacesFirst') {
                const { workspaceFolders } = vscode.workspace
                if (workspaceFolders?.length !== 1) throw new Error('Open exactly one workspace')
                const workspace = workspaceFolders[0]!
                workspaceFolder = workspace
                return workspace.uri.fsPath
            } else {
                const documentPath = vscode.window.activeTextEditor?.document.uri.fsPath // + pkdDir to find closest compared to opened editor
                if (!documentPath) throw new Error('Open file first')
                return await pkgDir.packageDirectory({ cwd: documentPath })
            }
        }
        return location
    })()
    return { packageJson: (await jsonfile.readFile(join(cwd, 'package.json'))) as PackageJson, dir: cwd, workspaceFolder }
}

export const getInstalledDepsItems = async (commandTitle: string, packageJson?: PackageJson) => {
    if (!packageJson) packageJson = (await readPackageJsonWithMetadata({ type: 'closest' })).packageJson
    const depsPick: (keyof PackageJson)[] = ['dependencies', 'devDependencies', 'optionalDependencies']
    return await showQuickPick(
        depsPick.flatMap(depKey => {
            const deps = packageJson![depKey] as PackageJson['dependencies']
            return Object.keys(deps!).map(
                (dep): VSCodeQuickPickItem<string> => ({
                    label: dep,
                    value: dep,
                    description: `${depKey.slice(0, -3)}y`,
                }),
            )
        }),
        { canPickMany: true, title: commandTitle },
    )
}
