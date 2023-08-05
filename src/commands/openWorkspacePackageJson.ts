import { getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'
import { registerExtensionCommand } from 'vscode-framework'
import { showPackageJson } from '../commands-core/packageJson'

export default () => {
    registerExtensionCommand('openWorkspacePackageJson', async () => {
        await showPackageJson(getCurrentWorkspaceRoot().uri)
    })
}
