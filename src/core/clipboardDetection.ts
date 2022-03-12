import vscode from 'vscode'
import { getExtensionSetting } from 'vscode-framework'
import { partition } from 'lodash'
import { getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'
import { notificationConfirmAction } from '@zardoy/vscode-utils/build/ui'
import { getPrefferedPackageManager, packageManagerCommand } from '../commands-core/packageManager'

export const registerClipboardDetection = () => {
    let lastAskedClipboardString = null as string | null
    vscode.window.onDidChangeWindowState(async ({ focused }) => {
        if (!focused) return
        if (getExtensionSetting('install.clipboardDetection') === 'disabled') return
        const clipboardText = await vscode.env.clipboard.readText().then(str => str.trim())
        if (lastAskedClipboardString === clipboardText) return
        // don't spam with messages on every window focus
        lastAskedClipboardString = clipboardText
        const result = getPackagesFromInstallCmd(clipboardText)
        if (!result) return

        // TODO
        const cwd = getCurrentWorkspaceRoot()
        const prefferedPm = await getPrefferedPackageManager(cwd.uri)
        // as devDeps
        if (!(await notificationConfirmAction(`Install packages from clipboard: ${result.packages.join(', ')}`, `Install using ${prefferedPm}`))) return
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
    // stricter regex: /^(npm|yarn|pnpm) (?:i|install|add)((?: (?:@[a-z\d~-][a-z\d._~-]*\/)?[a-z\d~-][a-z\d._~-]*)+)$/
    const result = /^(npm|yarn|pnpm) (?:i|install|add) (.+)$/.exec(input.trim())
    if (!result) return
    const packageManager = result[1]!
    // space delimiter is fine, since package names can't have space within
    let [flags, packages] = partition(result[2]!.split(' '), value => value.startsWith('-'))
    const preserveFlags = new Set(['--global', '-g', '--ignore-scripts'])
    // lodash-marker
    flags = flags.filter(flag => preserveFlags.has(flag) || flag.startsWith('--save') || ['--dev', '-D'].includes(flag))
    return {
        packageManager,
        packages,
        flags,
    }
}
