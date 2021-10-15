import fs from 'fs'
import { posix } from 'path'
import { findUpMultiple } from 'find-up'
import vscode from 'vscode'
import { showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'
const { join } = posix

export const runBinCommand = async () => {
    const terminal = vscode.window.activeTerminal
    if (!terminal) {
        console.warn('No active terminal')
        return
    }

    // TODO read both from cwd
    // TODO create own terminal
    // TODO pnpm in workspace

    const documentPath = vscode.window.activeTextEditor?.document.uri.fsPath
    const workspacePath = vscode.workspace.workspaceFolders?.[0]!.uri.fsPath
    if (!workspacePath) throw new Error('available only in workspace')

    const nodeModulesPaths = await (async () => {
        if (documentPath)
            return findUpMultiple('node_modules', {
                cwd: documentPath,
                stopAt: workspacePath,
                type: 'directory',
            })

        const nodeModulesPath = join(workspacePath, 'node_modules')
        if (fs.existsSync(nodeModulesPath)) return [nodeModulesPath]
        return []
    })()
    if (nodeModulesPaths.length === 0) throw new Error('no node_modules in current workspace')

    const showDescription = nodeModulesPaths.length > 0

    const items = await Promise.all(
        nodeModulesPaths.map(async dirPath =>
            (async (): Promise<Array<VSCodeQuickPickItem<string>>> => {
                const binList = await fs.promises.readdir(join(dirPath, '.bin'))
                return binList
                    .filter(name => !/.(CMD|ps1)$/.test(name))
                    .map(name => ({
                        label: name,
                        value: name,
                        // TODO relative
                        description: showDescription ? dirPath : undefined,
                    }))
            })(),
        ),
    )

    const binToRun = await showQuickPick(items.flat())
    if (binToRun === undefined) return

    const prepend = 'pnpm'

    terminal.sendText(`${prepend} ${binToRun} `, false)
    terminal.show(false)
}
