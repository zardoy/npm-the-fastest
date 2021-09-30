import vscode from 'vscode'
import depcheck, { Results } from 'depcheck'
import { PackageJson } from 'type-fest'
import { readPackageJson } from './packageJson'

export class NodeDependenciesProvider implements vscode.TreeDataProvider<TreeItem> {
    constructor(private workspaceRoot: string) {}

    private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>()
    readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event

    onLoad: ((setMessage?: string) => void) | undefined
    hidden = true

    getTreeItem(elem) {
        return elem
    }

    refresh() {
        this._onDidChangeTreeData.fire()
    }

    // updated together
    usingDeps: Results['using'] | undefined
    packageJson: PackageJson | undefined

    async getChildren(elem?) {
        try {
            if (this.hidden) return []
            if (!this.workspaceRoot) {
                // TODO allow package.json
                this.onLoad?.('No workspace opened. Open workspace with package.json first.')
                return []
            }
            const cwd = this.workspaceRoot

            if (elem) {
                console.log(elem.label)
            } else {
                // TODO find a list with runtime-only deps
                if (!this.usingDeps) this.usingDeps = (await depcheck(cwd, { skipMissing: true })).using
                if (!this.usingDeps) return []
                if (!this.packageJson) this.packageJson = await readPackageJson(cwd)
                const pickDeps: (keyof PackageJson)[] = ['dependencies', 'devDependencies', 'optionalDependencies']
                return Object.entries(this.usingDeps!).map(([dep, files], i) => {
                    const fileUrls = files.map(fsPath => vscode.Uri.file(fsPath))
                    if (i === 0) console.log(fileUrls)
                    const { type, declaredVersion } = pickDeps
                        .map(type => {
                            const deps = (this.packageJson![type] as PackageJson['dependencies']) || {}
                            const declaredVersion = Object.entries(deps).find(([depInner]) => {
                                return depInner === dep
                            })?.[1]
                            // TODO Handle install version in other way

                            return (
                                declaredVersion === undefined
                                    ? undefined
                                    : {
                                          type: type as string,
                                          declaredVersion,
                                      }
                            )!
                        })
                        .filter(Boolean)[0]!
                    return new TreeItem({ label: dep, description: `${type} ● ${declaredVersion}` })
                })
            }
        } finally {
            this.onLoad?.()
        }
    }
}

class TreeItem extends vscode.TreeItem {
    constructor({ label, description, tooltip, filesUrl }: { label: string; description: string; tooltip?: string; filesUrl?: string[] }) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed)
        if (tooltip) this.tooltip = tooltip
        this.description = description
    }
}
