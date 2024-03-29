/* eslint-disable no-async-promise-executor */
import * as vscode from 'vscode'
import execa from 'execa'
import { getExtensionId, getExtensionSetting, GracefulCommandError } from 'vscode-framework'
import { firstExists } from '@zardoy/vscode-utils/build/fs'
import { equals } from 'rambda'
import { getPmEnv, pnpmCommand, supportedPackageManagers, SupportedPackageManagersName } from '../core/packageManager'

export const getPrefferedPackageManager = async (cwd: vscode.Uri): Promise<SupportedPackageManagersName> => {
    let preffereddFromNpm = vscode.workspace.getConfiguration('npm').get<string>('packageManager')
    if (preffereddFromNpm === 'auto') preffereddFromNpm = undefined
    // TODO move it to bottom and always use workspace client
    if (preffereddFromNpm) return preffereddFromNpm as any
    const name = await firstExists(
        Object.entries(supportedPackageManagers).map(([name, { detectFile }]) => ({
            name,
            uri: vscode.Uri.joinPath(cwd, detectFile),
        })),
    )
    const leadingPackageManager = getExtensionSetting('leadingPackageManager')
    if (name) return name as any
    if (leadingPackageManager !== null) return leadingPackageManager
    let pm: SupportedPackageManagersName = 'npm' // will be used last
    // TODO check also version

    for (const pmToCheck of ['pnpm', 'yarn'] as SupportedPackageManagersName[])
        if (await getPmVersion(pmToCheck)) {
            pm = pmToCheck
            break
        }

    return pm
}

export const getPmVersion = async (pm: SupportedPackageManagersName) => {
    try {
        const cmd = await execa(pm, ['--version'])
        return cmd.stdout
    } catch {
        return undefined
    }
}

export const pmIsInstalledOrThrow = async (pm: SupportedPackageManagersName) => {
    const version = await getPmVersion(pm)
    if (!version) {
        if (pm === 'npm')
            throw new GracefulCommandError('npm is not installed, you can install it with Node.js', {
                actions: [
                    {
                        label: 'Download Node.js',
                        action() {
                            void vscode.env.openExternal(vscode.Uri.parse('https://nodejs.org/en/download/'))
                        },
                    },
                ],
            })
        const command = `npm i -g ${pm}`
        // we can implement action here easily whenever we can get more access to the terminal with API
        throw new GracefulCommandError(`${pm} is not installed. You can install it with \`${command}\``)
    }
}

class CancelError extends Error {
    override name = 'CancelError'

    constructor() {
        super('')
    }
}

export const packageManagerCommand = async (_inputArg: {
    cwd: vscode.Uri
    command: 'install' | 'add' | 'remove' | 'link'
    // displayCwd?: boolean
    // realPackagesCount?: number
    flags?: string[] | string
    // TODO combine them
    // cancellationToken?: vscode.CancellationToken
    packages?: string[]
    forcePm?: SupportedPackageManagersName
    // flags?: {
    //     global: boolean
    //     dev: boolean
    // }
}) => {
    let {
        cwd,
        command: subcommand,
        packages = [],
        flags = [],
        // flags,
        // TODO!
        // displayCwd = false,
        // realPackagesCount = packages?.length,
        forcePm,
    } = _inputArg
    const pm = forcePm ?? (await getPrefferedPackageManager(cwd))
    const commandName = pm
    const taskShortTitle = `${commandName} ${subcommand}`

    const getMessage = (): string => {
        let msg = `[${pm}] `
        if (subcommand === 'install') {
            msg += 'Installing workspace dependencies'
            return msg
        }

        // eslint-disable-next-line default-case
        switch (subcommand) {
            case 'add':
                msg += 'Installing'
                break
            case 'remove':
                msg += 'Removing'
                break
            case 'link':
                msg += 'Linking'
                break
        }

        msg += packages.length > 4 ? ` ${packages.length} packages` : `: ${packages.join(', ')}`
        if (flags.includes('-D')) msg += ' as dev'
        return msg
    }

    if (typeof flags === 'string') flags = flags.split(' ')
    let execSubcommand = subcommand
    if (subcommand === 'install') {
        execSubcommand = supportedPackageManagers[pm].installCommand as any
    } else if (packages.length === 0 && subcommand !== 'link') {
        void vscode.window.showWarningMessage(`No packages to ${subcommand} provided`)
        return
    }

    // const getFullCommand = () => [execCmd, ...(packages.map(p => `"${p}"`) ?? []), ...flags].join(' ')

    const commandArgs = [execSubcommand, ...(packages ?? []), ...flags]
    try {
        await handleRunningTask(commandName, commandArgs, taskShortTitle)
    } catch (err) {
        if (err instanceof CancelError) return
        throw err
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: getMessage(),
            cancellable: true,
        },
        async ({ report: reportProgress }, cancellationToken) => {
            if (getExtensionSetting('useIntegratedTerminal')) {
                const exitCode = await executeCommandInTerminal(commandName, commandArgs, cwd, {
                    setTaskExec(taskExec) {
                        cancellationToken.onCancellationRequested(() => taskExec.terminate())
                    },
                })
                if (getExtensionSetting('onPackageManagerCommandFail') === 'showNotification' && exitCode !== 0)
                    void vscode.window.showErrorMessage(`${taskShortTitle} failed`, 'Show terminal', 'Retry').then(selectedAction => {
                        if (selectedAction === 'Show terminal') showPackageManagerTerminal()
                        else if (selectedAction === 'Retry') void packageManagerCommand(_inputArg)
                    })
            } else {
                switch (pm) {
                    case 'npm':
                    case 'yarn':
                        // TODO yarn --json
                        await execa(commandName, commandArgs, {
                            cwd: cwd.fsPath,
                            extendEnv: false,
                            env: getPmEnv(pm) as any,
                        })
                        break
                    case 'pnpm':
                        await pnpmCommand({
                            cwd: cwd.fsPath,
                            command: execSubcommand,
                            cancellationToken,
                            packages,
                            reportProgress,
                            flags: flags as string[],
                        })
                        break

                    default:
                        break
                }
            }
        },
    )
}

interface ReportData {
    setTaskExec(taskExec: vscode.TaskExecution): void
    // setMessageOverride
}

const handleRunningTask = (command: string, args: string[], shortTitle: string) => {
    const ourTaskExec = vscode.tasks.taskExecutions.find(({ task }) => task.source === getExtensionId())
    if (ourTaskExec) {
        const exec = ourTaskExec.task.execution as vscode.ShellExecution
        const absolutelyTheSameTask = exec.command === command && equals(exec.args, args)
        if (absolutelyTheSameTask) throw new Error('Absolutely the same task is already running in terminal')
        else
            return vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `${shortTitle}: waiting for previous task to end`, cancellable: true },
                async (_, token) => {
                    token.onCancellationRequested(() => {
                        throw new CancelError()
                    })
                    return new Promise<void>(resolve => {
                        vscode.tasks.onDidEndTask(({ execution }) => {
                            if (execution === ourTaskExec) resolve()
                        })
                    })
                },
            )
    }

    return undefined
}

const executeTaskShared = async (
    data:
        | 'reveal'
        | 'close'
        | {
              command: string
              args: string[]
              cwd: vscode.Uri
              reportData: ReportData
          },
) => {
    /** non execute action */
    const isSpecialAction = typeof data === 'string' && data
    // console.log(isSpecialAction)
    const title = 'npm the fastest'
    const task = new vscode.Task(
        {
            type: 'shell',
        },
        vscode.TaskScope.Workspace,
        title,
        getExtensionId(),
        isSpecialAction
            ? new vscode.ShellExecution('echo', ['See output above!'])
            : new vscode.ShellExecution(data.command, data.args, { cwd: data.cwd.fsPath }),
    )

    const taskExecRevealKind =
        getExtensionSetting('onPackageManagerCommandFail') === 'showTerminal' ? vscode.TaskRevealKind.Silent : vscode.TaskRevealKind.Never
    task.presentationOptions.reveal = isSpecialAction === 'reveal' ? vscode.TaskRevealKind.Always : taskExecRevealKind
    task.presentationOptions.panel = vscode.TaskPanelKind.Shared
    if (isSpecialAction) {
        task.presentationOptions.showReuseMessage = false
        task.presentationOptions.echo = false
        // //@ts-expect-error Undocumented?
        // if (isSpecialAction === 'close') task.presentationOptions.close = true
    } else {
        task.presentationOptions.echo = true
        task.presentationOptions.clear = true
    }

    if (isSpecialAction) void vscode.tasks.executeTask(task)
    else
        return new Promise(async resolve => {
            vscode.tasks.onDidEndTaskProcess(({ execution, exitCode }) => {
                // eslint-disable-next-line curly
                if (execution.task === task) {
                    // if (exitCode === 0) sexecuteTaskShared('close')
                    resolve(exitCode)
                }
            })
            const taskExec = await vscode.tasks.executeTask(task)

            data.reportData.setTaskExec(taskExec)
        })
}

export const executeCommandInTerminal = async (command: string, args: string[], cwd: vscode.Uri, reportData: ReportData) =>
    executeTaskShared({
        command,
        args,
        cwd,
        reportData,
    })

export const showPackageManagerTerminal = () => {
    void executeTaskShared('reveal')
}
