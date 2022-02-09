import * as vscode from 'vscode'
import { proxy, subscribe } from 'valtio/vanilla'
import { getExtensionCommandId } from 'vscode-framework'

export const activateStatusbar = () => {
    const statusbar = vscode.window.createStatusBarItem('runningScripts', vscode.StatusBarAlignment.Left)
    statusbar.command = getExtensionCommandId('runNpmScript')
    statusbar.tooltip = 'Running NPM scripts'

    const state = proxy({ runningScripts: vscode.tasks.taskExecutions.filter(({ task }) => task.source === 'npm').map(({ task }) => task.name) })
    const updateText = () => {
        statusbar.text = `$(play-circle) ${state.runningScripts.join(', ')}`
    }

    updateText()
    subscribe(state, updateText)
    vscode.tasks.onDidStartTask(({ execution }) => {
        if (execution.task.source !== 'npm') return
        state.runningScripts.push(execution.task.name)
    })
    vscode.tasks.onDidEndTask(({ execution }) => {
        if (execution.task.source !== 'npm') return
        state.runningScripts.splice(state.runningScripts.indexOf(execution.task.name), 1)
    })

    statusbar.show()
}
