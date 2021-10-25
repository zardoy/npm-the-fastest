import { getExtensionSetting } from 'vscode-framework'
import { launchNpmTask } from '../commands-core/npmScripts'
import { getPrefferedScriptOrThrow } from '../core/packageJson'

export const startMainNpmScript = async () => {
    await launchNpmTask(async ({ packageJson }) => {
        const npmScript = getPrefferedScriptOrThrow(packageJson, getExtensionSetting('start-npm-script'))
        return npmScript
    })
}
