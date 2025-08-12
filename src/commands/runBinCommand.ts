import fs from 'fs'
import { posix } from 'path'
import vscode from 'vscode'
import { findUp, findUpMultiple } from 'find-up'
import { getExtensionSetting, showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'
import { getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'

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

    const items = await getBinCommands()

    const binToRun = await showQuickPick(items)
    if (binToRun === undefined) return

    const prepend = 'pnpm'

    terminal.sendText(`${prepend} ${binToRun} `, false)
    terminal.show(false)
}

export const getBinCommands = async () => {
    const _docUri = vscode.window.activeTextEditor?.document.uri
    const folderUri = _docUri ? vscode.Uri.joinPath(_docUri, '..') : getCurrentWorkspaceRoot()
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]!.uri
    const isFileInWorkspace = !workspaceUri || folderUri.toString().startsWith(workspaceUri.toString())

    const nodeModulesPaths = await (async () => {
        const findUpArgs = [
            'node_modules',
            {
                cwd: folderUri.fsPath,
                stopAt: isFileInWorkspace ? workspaceUri!.fsPath : undefined,
                type: 'directory',
            },
        ] as const
        if (getExtensionSetting('runBinCommand.searchLocation') === 'nearest') {
            const path = await findUp(...findUpArgs)
            return path !== undefined && [path]
        }

        return findUpMultiple(...findUpArgs)
    })()
    if (!nodeModulesPaths || nodeModulesPaths.length === 0) throw new Error('no node_modules in current workspace')

    const showDescription = nodeModulesPaths.length > 0

    const result = await Promise.all(
        nodeModulesPaths.map(async dirPath =>
            (async (): Promise<VSCodeQuickPickItem[]> => {
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
    return result.flat()
}
