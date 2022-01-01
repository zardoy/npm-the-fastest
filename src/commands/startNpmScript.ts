import { getExtensionSetting, showQuickPick, VSCodeQuickPickItem } from 'vscode-framework'
import vscode from 'vscode'
import { launchNpmTask } from '../commands-core/npmScripts'
import { move } from 'rambda'

const lastTouchedScripts = new Set<string>()

export const startNpmScript = async () => {
    // const name = await vscode.window.showErrorMessage('No `scripts` defined in package.json', 'Open package.json')
    await launchNpmTask(async ({ packageJson }) => {
        const scriptNamespaceIcon = {
            test: 'test-view-icon',
            generate: 'code',
            compile: 'file-binary',
            build: 'tools', // debug-configure - gear
        }
        const getIconForScript = (scriptName: string) => {
            for (const [detector, icon] of Object.entries(scriptNamespaceIcon)) if (scriptName.includes(detector)) return ` $(${icon})`

            return ''
        }

        const runningNpmTasks = vscode.tasks.taskExecutions.filter(({ task }) => task.source === 'npm')
        let picks = Object.entries(packageJson.scripts || {}).map(([scriptName, contents]): VSCodeQuickPickItem => {
            let label = `${getIconForScript(scriptName)} ${scriptName}`
            if (runningNpmTasks.some(({ task }) => task.name === scriptName)) label = `$(loading~spin)${label}`
            return {
                label,
                value: scriptName,
                detail: contents,
                description: '',
            }
        })
        for (let lastTouchedScript of lastTouchedScripts.keys()) {
            const pickIndex = picks.findIndex(({ value: script }) => script === lastTouchedScript)
            if (pickIndex === -1) continue
            picks = move(pickIndex, 0, picks)
        }
        const npmScript = await showQuickPick(picks, {
            matchOnDetail: getExtensionSetting('scripts.matchContents'),
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
