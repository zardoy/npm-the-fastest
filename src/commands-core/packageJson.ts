import { posix } from 'path'
import { findUp } from 'find-up'
import { PackageJson } from 'type-fest'
import vscode from 'vscode'
import { showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'

// TODO remove workspacesFirst
type PackageJsonLocation = 'workspacesFirst' | 'closest'

export const readPackageJsonWithMetadata = async ({ type, fallback }: { type: PackageJsonLocation; fallback?: boolean }) => {
    let workspaceFolder: undefined | vscode.WorkspaceFolder
    const cwd = await (async () => {
        const { workspaceFolders } = vscode.workspace
        if (workspaceFolders?.length !== 1) throw new Error('Open exactly one workspace')
        workspaceFolder = workspaceFolders[0]!
        if (type === 'workspacesFirst') return workspaceFolder.uri

        const documentUri = vscode.window.activeTextEditor?.document.uri // + pkdDir to find closest compared to opened editor
        if (!documentUri && fallback) return workspaceFolder.uri
        if (!documentUri) throw new Error('Open file first')
        const packageDir = await findUpPackageJson(documentUri, true)

        return packageDir
    })()
    // TODO remove
    // if (cwd.endsWith('package.json')) cwd = cwd.slice(0, -'package.json'.length)
    return { packageJson: await readDirPackageJson(cwd), dir: cwd, workspaceFolder }
}

export const readDirPackageJson = async (cwd: vscode.Uri) => JSON.parse(String(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(cwd, 'package.json'))))

// TODO-implement find-up for vscode ? or use fs
/**
 * @param uri Initial URI (e.g. of textEditor, but not directory!)
 * @returns Uri with path of closest directory with package.json
 */
export const findUpPackageJson = async <T extends boolean = false>(
    uri: vscode.Uri,
    throws?: T,
): Promise<T extends true ? vscode.Uri : vscode.Uri | undefined> => {
    console.time('find package.json')
    try {
        const currentWorkspacePath = vscode.workspace.getWorkspaceFolder(uri)
        // TODO maybe allow?
        if (!currentWorkspacePath) throw new Error('Opening closest package.json is not supported for files that are not part of opened workspace')
        const { fs } = vscode.workspace

        let currentUri = vscode.Uri.joinPath(uri, '..')
        while (true) {
            // eslint-disable-next-line no-await-in-loop
            const fileList = await fs.readDirectory(currentUri)
            const packageJsonFile = fileList.find(([name, type]) => name === 'package.json' && type === vscode.FileType.File)
            if (packageJsonFile) return currentUri
            if (posix.relative(currentUri.path, currentWorkspacePath.uri.path) === '') {
                console.debug('find package.json: reached workspace boundary')
                if (throws) throw new Error('There is no closest package.json from this file within current workspace')

                return undefined!
            }

            currentUri = vscode.Uri.joinPath(currentUri, '..')
        }
    } finally {
        console.timeEnd('find package.json')
    }
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

export const throwIfNowPackageJson = async (uriDir: vscode.Uri, needsWrite: boolean) => {
    const { fs } = vscode.workspace
    try {
        if (needsWrite && fs.isWritableFileSystem('file') === false)
            throw new Error('This file system is read-only. However write access to package.json is needed')

        await fs.stat(vscode.Uri.joinPath(uriDir, 'package.json'))
    } catch {
        // TODO suggest to init one
        throw new Error('No package.json found. Run `init` first')
    }
}
