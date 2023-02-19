import * as vscode from 'vscode'
import { parseTree, findNodeAtLocation } from 'jsonc-parser'
import { getExtensionSetting, VSCodeQuickPickItem } from 'vscode-framework'
import { move } from 'rambda'
import { showQuickPick } from '@zardoy/vscode-utils/build/quickPick'
import delay from 'delay'
import { launchNpmTask } from '../commands-core/npmScripts'
import { joinPackageJson } from '../commands-core/util'

const recentlyTouchedScripts: string[] = []

export const startNpmScript = async (_, scriptArgs?: string /*  | [scriptName: string, action?: boolean | 'focus' | 'kill', forceAction?: boolean] */) => {
    // const name = await vscode.window.showErrorMessage('No `scripts` defined in package.json', 'Open package.json')
    const [argScriptName, scriptAction, forceAction] = typeof scriptArgs === 'string' ? [scriptArgs] : scriptArgs ?? []
    await launchNpmTask(async ({ packageJson, dir }) => {
        if (argScriptName) return argScriptName
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

        const quickPick = vscode.window.createQuickPick<VSCodeQuickPickItem>()
        type ItemButtons = Array<
            vscode.QuickInputButton & {
                click(item)
            }
        >

        let runningNpmTasks!: vscode.TaskExecution[]
        const isRunningPick = (item: VSCodeQuickPickItem | string) =>
            runningNpmTasks.some(({ task }) => task.name === (typeof item === 'string' ? item : item.value))
        const getPicks = () => {
            runningNpmTasks = vscode.tasks.taskExecutions.filter(({ task }) => task.source === 'npm')
            const picks = Object.entries(packageJson.scripts || {}).map(([scriptName, contents]): VSCodeQuickPickItem => {
                let label = `${getIconForScript(scriptName)} ${scriptName}`
                if (isRunningPick(scriptName)) label = `$(loading~spin)${label}`

                const itemButtons: ItemButtons = [
                    {
                        iconPath: new vscode.ThemeIcon('go-to-file'),
                        tooltip: 'Reveal script in package.json',
                        async click() {
                            const packageJsonUri = joinPackageJson(dir)
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
            const getPickScore = (pick: VSCodeQuickPickItem): number => {
                const pickIndex = recentlyTouchedScripts.indexOf(pick.value)
                if (pickIndex === -1) return 0
                return recentlyTouchedScripts.length - pickIndex
            }

            picks.sort((a, b) => getPickScore(a) - getPickScore(b)).reverse()

            if (getExtensionSetting('runNpmScript.showRunningOnTop')) {
                const getPickScore = (pick: VSCodeQuickPickItem) => (isRunningPick(pick) ? 1 : 0)
                picks.sort((a, b) => getPickScore(a) - getPickScore(b)).reverse()
            }

            return picks
        }

        const picks = getPicks()

        quickPick.items = picks
        quickPick.matchOnDetail = getExtensionSetting('scripts.matchContents')
        quickPick.keepScrollPosition = true
        quickPick.onDidTriggerItemButton(({ item, button: itemButton }) => {
            for (const button of item.buttons! as ItemButtons) {
                if (button !== itemButton) return
                button.click(item)
            }
        })
        const updatePicks = () => {
            quickPick.items = getPicks()
        }

        const disposables: vscode.Disposable[] = []
        vscode.tasks.onDidEndTask(updatePicks, undefined, disposables)
        vscode.tasks.onDidStartTask(updatePicks, undefined, disposables)
        // copied from vscode-extra
        const npmScript = await new Promise<string | undefined>(resolve => {
            quickPick.onDidHide(() => {
                resolve(undefined)
                quickPick.dispose()
                for (const d of disposables) d.dispose()
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

        if (recentlyTouchedScripts.includes(npmScript)) recentlyTouchedScripts.splice(recentlyTouchedScripts.indexOf(npmScript), 1)
        recentlyTouchedScripts.unshift(npmScript)
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
                    typeNumberSelect: true,
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
                const restartDelayConfig = getExtensionSetting('scripts.restartDelay')
                const delayMs = restartDelayConfig[npmScript] ?? restartDelayConfig['*']
                if (delayMs) await delay(delayMs)
                return npmScript
            }
        }

        return npmScript
    })
}
