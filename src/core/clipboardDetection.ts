import vscode from 'vscode'
import { getExtensionSetting } from 'vscode-framework'
import { getPrefferedPackageManager, packageManagerCommand } from '../commands-core/packageManager'
import { confirmAction, getCurrentWorkspaceRoot } from '../commands-core/util'
import { partition } from 'lodash'

export const registerClipboardDetection = () => {
    vscode.window.onDidChangeWindowState(async ({ focused }) => {
        if (!focused) return
        console.time('detect')
        if (getExtensionSetting('install.clipboardDetection') === 'disabled') return
        const clipboardText = await vscode.env.clipboard.readText()
        const result = regex.exec(clipboardText.trim())
        console.timeEnd('detect')

        // TODO
        const cwd = getCurrentWorkspaceRoot()
        const prefferedPm = await getPrefferedPackageManager(cwd.uri)
        // as devDeps
        if (!(await confirmAction(`Install packages from clipboard: ${packages.join(', ')}`, `Install using ${prefferedPm}`))) return
        // TODO ensure progress
        await packageManagerCommand({
            cwd: cwd.uri,
            command: 'install',
            packages: packages,
        })
    })
}

const getPackagesFromInstallCmd = (input: string) => {
    // const regex = /^(npm|yarn|pnpm) (?:i|install|add)((?: (?:@[a-z\d~-][a-z\d._~-]*\/)?[a-z\d~-][a-z\d._~-]*)+)$/
    const result = /^(npm|yarn|pnpm) (?:i|install|add) (.+)$/.exec(input.trim())
    if (!result) return
    const packageManager = result[1]!
    let [packages, flags] = partition(result[2]!.split(' '), value => value.startsWith('-'))
    const preserveFlags = ['--global', '-g', '--ignore-scripts']
    // lodash-marker
    flags = flags.filter(flag => preserveFlags.includes(flag))
    return {
        packageManager,
        packages,
        flags,
    }
}

const yarnStripSavePart = (input: string) => {}
