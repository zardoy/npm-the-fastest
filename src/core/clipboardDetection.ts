import vscode from 'vscode'
import { getExtensionSetting } from 'vscode-framework'
import { partition } from 'lodash'
import { getPrefferedPackageManager, packageManagerCommand } from '../commands-core/packageManager'
import { confirmAction, getCurrentWorkspaceRoot } from '../commands-core/util'

export const registerClipboardDetection = () => {
    vscode.window.onDidChangeWindowState(async ({ focused }) => {
        if (!focused) return
        if (getExtensionSetting('install.clipboardDetection') === 'disabled') return
        const clipboardText = (await vscode.env.clipboard.readText()).trim()
        const result = getPackagesFromInstallCmd(clipboardText)
        if (!result) return

        // TODO
        const cwd = getCurrentWorkspaceRoot()
        const prefferedPm = await getPrefferedPackageManager(cwd.uri)
        // as devDeps
        if (!(await confirmAction(`Install packages from clipboard: ${result.packages.join(', ')}`, `Install using ${prefferedPm}`))) return
        // TODO ensure progress
        await packageManagerCommand({
            cwd: cwd.uri,
            // command: result.flags.includes('-D') || result.flags.includes('--save-dev') ? 'install -D' as any : 'install',
            command: 'install',
            packages: result.packages,
        })
    })
}

export const getPackagesFromInstallCmd = (input: string) => {
    // const regex = /^(npm|yarn|pnpm) (?:i|install|add)((?: (?:@[a-z\d~-][a-z\d._~-]*\/)?[a-z\d~-][a-z\d._~-]*)+)$/
    const result = /^(npm|yarn|pnpm) (?:i|install|add) (.+)$/.exec(input.trim())
    if (!result) return
    const packageManager = result[1]!
    let [flags, packages] = partition(result[2]!.split(' '), value => value.startsWith('-'))
    const preserveFlags = new Set(['--global', '-g', '--ignore-scripts'])
    // lodash-marker
    flags = flags.filter(flag => preserveFlags.has(flag) || flag.startsWith('--save') || ['dev', '-D'].includes(flag))
    return {
        packageManager,
        packages,
        flags,
    }
}

const yarnStripSavePart = (input: string) => {}
