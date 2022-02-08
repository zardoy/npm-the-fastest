import * as vscode from 'vscode'
import { parseTree, findNodeAtLocation } from 'jsonc-parser'
import { getExtensionSetting, showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'
import { move } from 'rambda'
import { launchNpmTask } from '../commands-core/npmScripts'

const lastTouchedScripts = new Set<string>()

export const startNpmScript = async () => {
    // const name = await vscode.window.showErrorMessage('No `scripts` defined in package.json', 'Open package.json')
    await launchNpmTask(async ({ packageJson, dir }) => {
        const scriptNamespaceIcon = {
            test: 'test-view-icon',
            generate: 'code',
            compile: 'file-binary',
            build: 'tools', // debug-configure - gear
            start: 'play-circle',
        }
        const getIconForScript = (scriptName: string) => {
            for (const [detector, icon] of Object.entries(scriptNamespaceIcon)) if (scriptName.includes(detector)) return `$(${icon})`

            return ''
        }

        const runningNpmTasks = vscode.tasks.taskExecutions.filter(({ task }) => task.source === 'npm')
        const quickPick = vscode.window.createQuickPick<VSCodeQuickPickItem>()
        type ItemButtons = Array<
            vscode.QuickInputButton & {
                click(item)
            }
        >
        let picks = Object.entries(packageJson.scripts || {}).map(([scriptName, contents]): VSCodeQuickPickItem => {
            let label = `${getIconForScript(scriptName)} ${scriptName}`
            if (runningNpmTasks.some(({ task }) => task.name === scriptName)) label = `$(loading~spin)${label}`

            const itemButtons: ItemButtons = [
                {
                    iconPath: new vscode.ThemeIcon('go-to-file'),
                    tooltip: 'Reveal script in package.json',
                    async click() {
                        const packageJsonUri = vscode.Uri.joinPath(dir, 'package.json')
                        const editor = await vscode.window.showTextDocument(packageJsonUri)
                        const { document } = editor
                        const { offset, length } = findNodeAtLocation(parseTree(document.getText())!, ['scripts', scriptName])!
                        editor.selection = new vscode.Selection(document.positionAt(offset + 1), document.positionAt(offset + 1 + length - 2))
                        editor.revealRange(editor.selection)
                    },
                },
            ]
            return {
                label,
                value: scriptName,
                detail: contents,
                description: '',
                buttons: itemButtons,
            }
        })
        for (const lastTouchedScript of lastTouchedScripts.keys()) {
            const pickIndex = picks.findIndex(({ value: script }) => script === lastTouchedScript)
            if (pickIndex === -1) continue
            picks = move(pickIndex, 0, picks)
        }

        quickPick.items = picks
        quickPick.matchOnDetail = getExtensionSetting('scripts.matchContents')
        quickPick.onDidTriggerItemButton(({ item, button: itemButton }) => {
            for (const button of item.buttons! as ItemButtons) {
                if (button !== itemButton) return
                button.click(item)
            }
        })
        // copied from vscode-extra
        const npmScript = await new Promise<string | undefined>(resolve => {
            quickPick.onDidHide(() => {
                resolve(undefined)
                quickPick.dispose()
            })
            quickPick.onDidAccept(() => {
                // align with default showQuickPick behavior
                if (quickPick.items.length === 0) return
                const { selectedItems } = quickPick
                resolve(selectedItems[0]?.value)
                quickPick.hide()
            })
            quickPick.show()
        })
        if (npmScript === undefined) return
        lastTouchedScripts.add(npmScript)
        let runningNpmScript: vscode.TaskExecution | undefined
        if ((runningNpmScript = runningNpmTasks.find(({ task }) => task.name === npmScript))) {
            // TODO multistep
            const action = await showQuickPick(
                [
                    { label: '$(debug-console) Focus Terminal', value: 'focus' },
                    { label: '$(terminal-kill) Kill the Process', value: 'kill' },
                    { label: '$(debug-restart) Restart the Process', value: 'restart' },
                ],
                {
                    title: `There is already running NPM script ${npmScript}`,
                },
            )
            if (action === undefined) return
            if (action === 'focus') {
                vscode.window.terminals.find(({ name }) => name === npmScript)!.show()
                return
            }

            if (action === 'kill') {
                // TODO hide panel
                runningNpmScript.terminate()
                return
            }

            if (action === 'restart') {
                runningNpmScript.terminate()
                return npmScript
            }
        }

        return npmScript
    })
}
