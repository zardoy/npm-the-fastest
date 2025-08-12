/* eslint-disable no-constant-condition */
import { posix } from 'path'
import * as vscode from 'vscode'
import { PackageJson } from 'type-fest'
import { getExtensionSetting, showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'
import { noCase } from 'change-case'
import { fsExists, getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'
import { Utils } from 'vscode-uri'
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

export const readDirPackageJson = async (cwd: vscode.Uri) => {
    const file = await vscode.workspace.fs.readFile(joinPackageJson(cwd))
    return JSON.parse(String(file)) as PackageJson
}

export const readDirPackageJsonVersion = async (cwd: vscode.Uri, notInstalledMessage = 'Not installed'): Promise<string> => {
    try {
        const { version } = await readDirPackageJson(cwd)
        return version ?? '?'
    } catch (err) {
        if (err.message?.includes('in JSON')) return 'Invalid JSON'
        // TODO handle only fs error
        return notInstalledMessage
    }
}

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

/**
 * @returns dirs with package.json
 */
export const findUpMultiplePackageJson = async (uri: vscode.Uri) => {
    const { uri: workspaceUri } = getCurrentWorkspaceRoot()
    const packageJsons: vscode.Uri[] = []
    let currentUri = vscode.Uri.joinPath(uri, '..')
    while (true) {
        if (await fsExists(joinPackageJson(currentUri), true)) packageJsons.push(currentUri)
        if (currentUri.path === workspaceUri.path) {
            console.debug('find package.json: reached workspace boundary')
            return packageJsons
        }

        currentUri = vscode.Uri.joinPath(currentUri, '..')
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

export const packageJsonAllDependenciesKeys = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
export const packageJsonInstallDependenciesKeys = ['dependencies', 'devDependencies', 'optionalDependencies']

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
    let packageJsons = packageJson ? [packageJson] : undefined
    let cwd: vscode.Uri | undefined
    if (!packageJsons)
        if (vscode.window.activeTextEditor?.viewColumn === undefined) {
            const workspacePackageJson = await readPackageJsonWithMetadata({ type: 'workspacesFirst' })
            cwd = workspacePackageJson.dir
            packageJsons = [workspacePackageJson.packageJson]
        } else {
            const packageJsonDirs = await findUpMultiplePackageJson(vscode.window.activeTextEditor.document.uri)
            packageJsons = await Promise.all(packageJsonDirs.map(async dir => readDirPackageJson(dir)))
        }

    const depsIconMap = {
        dependencies: 'package',
        devDependencies: 'tools',
        optionalDependencies: 'plug',
    }

    const AT_TYPES = '@types/'
    const hasTypesPackage = (pkg: string, pkgJsonIndex: number) =>
        Object.keys(packageJsons![pkgJsonIndex]!.dependencies ?? {}).includes(pkg.slice(AT_TYPES.length))

    // TODO produce warning dialog when package a in dev/optional deps and @types/a in deps

    const packagesWithTypes = [] as string[]

    const collectedDeps = packageJsons.flatMap((json, jsonIndex) =>
        packageJsonInstallDependenciesKeys.flatMap(depKey => {
            const deps = (json[depKey] as PackageJson['dependencies']) ?? {}
            return Object.entries(deps)
                .map(
                    // ts error below: pkgJson possibly is undefined
                    ([pkg, version]): VSCodeQuickPickItem => {
                        if (flatTypes && pkg.startsWith(AT_TYPES) && depKey === 'devDependencies' && hasTypesPackage(pkg, jsonIndex)) {
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
    )
    try {
        if (cwd) {
            const dir = await vscode.workspace.fs.readDirectory(Utils.joinPath(cwd, 'node_modules'))
            collectedDeps.push(
                ...dir
                    // eslint-disable-next-line no-bitwise
                    .filter(([, type]) => type & vscode.FileType.Directory)
                    .map(([name]) => ({
                        label: name,
                        value: name,
                    })),
            )
        }
    } catch {}

    const pickedDeps = (await showQuickPick(
        collectedDeps,
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

export const showPackageJson = async (uri: vscode.Uri, isDir = true) => {
    if (isDir) uri = joinPackageJson(uri)
    if (uri.scheme === 'file' && getExtensionSetting('useNoJsonDiagnosticsWorkaround')) {
        await vscode.commands.executeCommand('workbench.action.quickOpen', uri.fsPath)
        await new Promise(resolve => {
            setTimeout(resolve, 25)
        })
        await new Promise<void>(resolve => {
            const { dispose } = vscode.window.onDidChangeActiveTextEditor(() => {
                resolve()
                dispose()
            })
            void vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem')
        })
    } else {
        await vscode.window.showTextDocument(uri)
    }
}
