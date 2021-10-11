import { findUp } from 'find-up'
import { PackageJson } from 'type-fest'
import vscode from 'vscode'
import { showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'
import { readDirPackageJson } from '../core/packageJson'

// TODO remove workspacesFirst
type PackageJsonLocation = 'workspacesFirst' | 'closest'

export const readPackageJsonWithMetadata = async ({ type, fallback }: { type: PackageJsonLocation; fallback?: boolean }) => {
    let workspaceFolder: undefined | vscode.WorkspaceFolder
    // TODO-low refactor?
    let cwd = await (async () => {
        const { workspaceFolders } = vscode.workspace
        if (workspaceFolders?.length !== 1) throw new Error('Open exactly one workspace')
        const workspace = workspaceFolders[0]!
        workspaceFolder = workspace
        const { fsPath: workspacePath } = workspace.uri
        if (type === 'workspacesFirst') return workspacePath

        const documentPath = vscode.window.activeTextEditor?.document.uri.fsPath // + pkdDir to find closest compared to opened editor
        if (!documentPath && fallback) return workspacePath
        if (!documentPath) throw new Error('Open file first')
        // TODO
        const packageDir = await findUp('package.json', {
            cwd: documentPath,
        })
        if (packageDir === undefined) throw new Error('There is no package.json from this file within this workspace')

        return packageDir
    })()
    // TODO remove
    if (cwd.endsWith('package.json')) cwd = cwd.slice(0, -'package.json'.length)
    return { packageJson: await readDirPackageJson(cwd), dir: cwd, workspaceFolder }
}

type PickedDeps = string[] & {
    realDepsCount: number
}

// for: remove
export const pickInstalledDeps = async ({
    commandTitle,
    packageJson,
}: {
    commandTitle: string
    packageJson?: PackageJson
}): Promise<PickedDeps | undefined> => {
    if (!packageJson) packageJson = (await readPackageJsonWithMetadata({ type: 'closest', fallback: true })).packageJson
    const depsPick: Array<keyof PackageJson> = ['dependencies', 'devDependencies', 'optionalDependencies']
    const depsIconMap = {
        dependencies: 'package',
        devDependencies: 'tools',
        optionalDependencies: 'plug',
    }

    const AT_TYPES = '@types/'
    const hasTypesPackage = (pkg: string) => Object.keys(packageJson!.dependencies ?? {}).includes(pkg.slice(AT_TYPES.length))

    // TODO produce warning dialog when package a in dev/optional deps and @types/a in deps

    const packagesWithTypes = [] as string[]

    const pickedDeps = (await showQuickPick(
        depsPick.flatMap(depKey => {
            const deps = (packageJson![depKey] as PackageJson['dependencies']) ?? {}
            return Object.entries(deps)
                .map(
                    // ts error below: pkgJson possibly is undefined
                    ([pkg, version]): VSCodeQuickPickItem<string> => {
                        if (pkg.startsWith(AT_TYPES) && depKey === 'devDependencies' && hasTypesPackage(pkg)) {
                            packagesWithTypes.push(pkg.slice(AT_TYPES.length))
                            return undefined!
                        }

                        return {
                            label: `$(${depsIconMap[depKey]}) ${pkg}`,
                            value: pkg,
                            description: version,
                        }
                    },
                )
                .filter(Boolean)
        }),
        { canPickMany: true, title: commandTitle, ignoreFocusOut: true },
    )) as PickedDeps
    if (pickedDeps === undefined) return
    pickedDeps.realDepsCount = pickedDeps.length

    for (const pkg of packagesWithTypes) if (pickedDeps.includes(pkg)) pickedDeps.push(AT_TYPES + pkg)
    return pickedDeps
}
