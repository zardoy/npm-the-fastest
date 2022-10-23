/* eslint-disable no-constant-condition */
import { posix } from 'path'
import * as vscode from 'vscode'
import { PackageJson } from 'type-fest'
import { showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'
import { noCase } from 'change-case'
import { fsExists, getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'
import { joinPackageJson, supportedFileSchemes } from './util'

// TODO remove workspacesFirst
type PackageJsonLocation = 'workspacesFirst' | 'closest'

export const readPackageJsonWithMetadata = async ({ type, fallback = false }: { type: PackageJsonLocation; fallback?: boolean }) => {
    let workspaceFolder: undefined | vscode.WorkspaceFolder
    const cwd = await (async () => {
        const workspace = getCurrentWorkspaceRoot()
        if (type === 'workspacesFirst') return workspace.uri

        // TODO refactor. hope we don't use closest
        const documentUri = vscode.window.activeTextEditor?.document.uri // + pkdDir to find closest compared to opened editor
        const unsupoortedDocument = !documentUri || !supportedFileSchemes.includes(documentUri.scheme)
        if (unsupoortedDocument && fallback) return workspace.uri
        if (unsupoortedDocument) throw new Error('Open file first')
        const packageDir = await findUpPackageJson(documentUri, true)

        return packageDir
    })()
    // TODO remove
    // if (cwd.endsWith('package.json')) cwd = cwd.slice(0, -'package.json'.length)
    return { packageJson: await readDirPackageJson(cwd), dir: cwd, workspaceFolder }
}

export const readDirPackageJson = async (cwd: vscode.Uri) => JSON.parse(String(await vscode.workspace.fs.readFile(joinPackageJson(cwd)))) as PackageJson

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

        let currentUri = vscode.Uri.joinPath(uri, '..')
        while (true) {
            if (await fsExists(joinPackageJson(currentUri), true)) return currentUri
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

export const findUpNodeModules = async (dirUri: vscode.Uri): Promise<vscode.Uri> => {
    let currentUri = dirUri
    while (true) {
        if (await fsExists(vscode.Uri.joinPath(currentUri, 'node_modules'), false)) return currentUri
        const oldUri = currentUri
        currentUri = vscode.Uri.joinPath(currentUri, '..')
        // Can't go next. Reached the system root
        if (oldUri.path === currentUri.path) throw new Error('There is no closest node_modules from current dir (findUp reached root)')
    }
}

type PickedDeps = string[] & {
    realDepsCount: number
}

export const pickInstalledDeps = async <M extends boolean>({
    commandId,
    multiple,
    packageJson,
    flatTypes = true,
}: {
    commandId: string
    multiple: M
    packageJson?: PackageJson
    flatTypes?
}): Promise<(M extends true ? PickedDeps : string) | undefined> => {
    if (!packageJson) ({ packageJson } = await readPackageJsonWithMetadata({ type: 'closest', fallback: true }))
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
                    ([pkg, version]): VSCodeQuickPickItem => {
                        if (flatTypes && pkg.startsWith(AT_TYPES) && depKey === 'devDependencies' && hasTypesPackage(pkg)) {
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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        { canPickMany: multiple as boolean, title: noCase(commandId), ignoreFocusOut: true },
    )) as PickedDeps | string
    if (pickedDeps === undefined) return
    if (typeof pickedDeps === 'string') return pickedDeps as any
    pickedDeps.realDepsCount = pickedDeps.length

    for (const pkg of packagesWithTypes) if (pickedDeps.includes(pkg)) pickedDeps.push(AT_TYPES + pkg)
    return pickedDeps as any
}

export const throwIfNoPackageJson = async (uriDir: vscode.Uri, needsWrite: boolean) => {
    const { fs } = vscode.workspace
    try {
        if (needsWrite && fs.isWritableFileSystem('file') === false)
            throw new Error('This file system is read-only. However write access to package.json is needed')

        await fs.stat(joinPackageJson(uriDir))
    } catch {
        // TODO suggest to init one
        throw new Error('No package.json found. Run `init` first')
    }
}
