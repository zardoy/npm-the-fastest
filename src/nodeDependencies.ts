import vscode from 'vscode'

export class NodeDependenciesProvider implements vscode.TreeDataProvider<Dependency> {
    constructor(private workspaceRoot: string) {}

    getTreeItem(elem) {
        return elem
    }

    // elems

    async getChildren(elem?: Dependency) {
        if (!this.workspaceRoot) {
            void vscode.window.showInformationMessage('No dependency in empty workspace')
            return Promise.resolve([])
        }

        if (elem) {
            console.log(elem.label)
        } else {
            return [new Dependency('Dependency', '1.0.0', vscode.TreeItemCollapsibleState.Collapsed)] as Dependency[]
        }
    }
}

class Dependency extends vscode.TreeItem {
    constructor(public override readonly label: string, private version: string, public override readonly collapsibleState: vscode.TreeItemCollapsibleState) {
        super(label, collapsibleState)
        this.tooltip = `${this.label}-${this.version}`
        this.description = this.version
    }
}
