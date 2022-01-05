import * as vscode from 'vscode'
import { registerExtensionCommand } from 'vscode-framework'
import { pickInstalledDeps } from '../commands-core/packageJson'

export const registerOpenPackageAtCommands = () => {
    registerExtensionCommand('openOnNpm', async ({ command }, module?: string) => {
        if (!module) module = await pickInstalledDeps({ commandTitle: `Select package for ${command}`, multiple: false })
        if (module === undefined) return
        await vscode.env.openExternal(`https://npmjs.com/package/${module}` as any)
    })
    registerExtensionCommand('openAtPaka', async ({ command }, module?: string) => {
        if (!module) module = await pickInstalledDeps({ commandTitle: `Select package for ${command}`, multiple: false })
        if (module === undefined) return
        await vscode.env.openExternal(`https://paka.dev/npm/${module}` as any)
    })
}
