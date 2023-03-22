import * as vscode from 'vscode'
import { getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'
import { registerExtensionCommand } from 'vscode-framework'
import { Utils } from 'vscode-uri'
import { showQuickPick } from '@zardoy/vscode-utils/build/quickPick'
import { packageJsonInstallDependenciesKeys, readDirPackageJson, readDirPackageJsonVersion } from '../commands-core/packageJson'
import { getPrefferedPackageManager, packageManagerCommand } from '../commands-core/packageManager'

export const registerLinkPackage = () => {
    registerExtensionCommand('linkPackage', async () => {
        const { uri: workspaceUri } = getCurrentWorkspaceRoot()
        const pm = await getPrefferedPackageManager(workspaceUri)
        const selected = await showQuickPick<[name: string, dirPath: string, dirUri: vscode.Uri]>([], {
            title: `Link package using ${pm}`,
            async onDidShow() {
                this.busy = true
                const root = Utils.joinPath(workspaceUri, '..')
                // eslint-disable-next-line no-bitwise
                const dirs = await vscode.workspace.fs.readDirectory(root).then(dirs => dirs.filter(([, type]) => type & vscode.FileType.Directory))
                const rootPkg = await readDirPackageJson(workspaceUri)
                const allDeps = [] as string[]
                for (const pkgKey of packageJsonInstallDependenciesKeys) allDeps.push(...Object.keys(rootPkg[pkgKey] ?? {}))

                const packages = await Promise.allSettled(
                    dirs.map(async ([dir]) => {
                        const uri = Utils.joinPath(root, dir)
                        const pkg = await readDirPackageJson(uri)
                        return [pkg, uri] as const
                    }),
                )
                this.items = await Promise.all(
                    packages
                        .filter(v => v.status === 'fulfilled' && allDeps.includes(v.value[0].name!))
                        .map(async v => {
                            if (v.status === 'rejected') return undefined!
                            const [pkg, uri] = v.value
                            const dirPath = `../${Utils.basename(uri)}`
                            const name = pkg.name!
                            const dirUri = Utils.joinPath(workspaceUri, dirPath)
                            const installedVersion = await readDirPackageJsonVersion(dirUri, 'N/A')
                            return {
                                label: name,
                                value: [name, dirPath, dirUri], // TODO pass cleanly
                                description: `${installedVersion} -> ${pkg.version!} <- ${dirPath}`,
                                buttons: [
                                    {
                                        iconPath: new vscode.ThemeIcon('folder'),
                                    },
                                ],
                            }
                        }),
                )
                this.busy = false
            },
            async onDidTriggerItemButton(button) {
                await vscode.commands.executeCommand('vscode.openFolder', button.item.value[2], { forceNewWindow: true })
            },
        })
        if (!selected) return
        const [selectedPkgName, selectedPath, dirUri] = selected
        if (pm === 'pnpm') {
            await packageManagerCommand({
                command: 'link',
                cwd: workspaceUri,
                packages: [selectedPath],
                forcePm: pm,
            })
        } else {
            await packageManagerCommand({
                command: 'link',
                cwd: dirUri,
                packages: [],
                forcePm: pm,
            })
            await packageManagerCommand({
                command: 'link',
                cwd: workspaceUri,
                packages: [selectedPkgName],
                forcePm: pm,
            })
        }
    })
}
