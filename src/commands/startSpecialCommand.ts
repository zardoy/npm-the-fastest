import * as vscode from 'vscode'
import minimatch from 'minimatch'
import { getExtensionId, getExtensionSetting, showQuickPick } from 'vscode-framework'
import { getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'

export const startSpecialCommand = async () => {
    const currentWorkspaceRoot = getCurrentWorkspaceRoot()
    const specialScripts = getExtensionSetting('scripts.specialCommands')
    const allAvailableScripts = Object.entries(specialScripts).filter(([globPath]) => minimatch(currentWorkspaceRoot.uri.fsPath, globPath))
    // TODO button for opening settings.json and running edited script
    const commandToRun = await showQuickPick(
        allAvailableScripts.flatMap(([globPath, commands]) =>
            commands.map(command => ({ value: command, label: command.label || command.command, description: globPath })),
        ),
    )
    if (commandToRun === undefined) return
    const [commandMain, ...commandArgs] = commandToRun.command.split(' ')
    const task = new vscode.Task(
        {
            type: 'shell',
            command: commandToRun.command,
            presentation: {
                focus: false,
            } as vscode.TaskPresentationOptions,
        },
        vscode.TaskScope.Workspace,
        commandToRun.label || commandToRun.command,
        `${getExtensionId()}-custom`,
        new vscode.ShellExecution(commandMain!, commandArgs, {}),
    )
    await vscode.tasks.executeTask(task)
}
