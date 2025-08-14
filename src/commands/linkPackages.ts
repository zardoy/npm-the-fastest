import * as vscode from 'vscode'
import { getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'
import { showQuickPick } from '@zardoy/vscode-utils/build/quickPick'
import { getExtensionSetting, registerExtensionCommand, VSCodeQuickPickItem } from 'vscode-framework'
import { Utils } from 'vscode-uri'
import { packageJsonInstallDependenciesKeys, readDirPackageJson } from '../commands-core/packageJson'
import { getPrefferedPackageManager, packageManagerCommand } from '../commands-core/packageManager'
import { joinPackageJson } from '../commands-core/util'

export const registerLinkPackages = () => {
    // eslint-disable-next-line complexity
    registerExtensionCommand('linkPackages' as any, async () => {
        const { uri: workspaceUri } = getCurrentWorkspaceRoot()
        const pm = await getPrefferedPackageManager(workspaceUri)
        if (pm !== 'pnpm') {
            void vscode.window.showWarningMessage('linkPackages currently supports pnpm only')
            return
        }

        const rootPkg = await readDirPackageJson(workspaceUri)
        const allDeps = new Set<string>()
        for (const key of packageJsonInstallDependenciesKeys) for (const dep of Object.keys(rootPkg[key] ?? {})) allDeps.add(dep)

        const parent = Utils.joinPath(workspaceUri, '..')
        console.time('linkPackages: scan candidates')
        const dirs = await vscode.workspace.fs
            .readDirectory(parent)
            // eslint-disable-next-line no-bitwise
            .then(entries => entries.filter(([, type]) => type & vscode.FileType.Directory))
        const candidates = [] as Array<{ name: string; dirPath: string; dirUri: vscode.Uri }>
        for (const [dirName] of dirs) {
            const dirUri = Utils.joinPath(parent, dirName)
            try {
                const pkg = await readDirPackageJson(dirUri)
                if (pkg.name && allDeps.has(pkg.name)) {
                    const dirPath = `../${dirName}`
                    candidates.push({ name: pkg.name, dirPath, dirUri: Utils.joinPath(workspaceUri, dirPath) })
                }
            } catch {}
        }

        console.timeEnd('linkPackages: scan candidates')

        const overrides = (rootPkg as any).pnpm?.overrides as Record<string, string> | undefined
        const isLinked = (dep: string, dirPath: string) => {
            const picked = overrides && typeof overrides[dep] === 'string' && overrides[dep].startsWith(`file:${dirPath}`)
            return picked
        }

        const items: Array<VSCodeQuickPickItem<CandidateData>> = candidates
            .map(
                (candidate): VSCodeQuickPickItem<CandidateData> => ({
                    label: candidate.name,
                    description: candidate.dirPath,
                    value: candidate,
                    picked: isLinked(candidate.name, candidate.dirPath),
                    buttons: [
                        {
                            tooltip: 'Open Workspace Folder',
                            iconPath: new vscode.ThemeIcon('folder-library'),
                        },
                    ],
                }),
            )
            .sort((a, b) => Number(b.picked) - Number(a.picked) || a.label.localeCompare(b.label))

        type CandidateData = { name: string; dirPath: string; dirUri: vscode.Uri }
        const selected = await showQuickPick(items, {
            title: `Link packages using ${pm}`,
            canPickMany: true,
            matchOnDescription: true,
            onDidTriggerItemButton(button) {
                // eslint-disable-next-line curly
                if (button.button.tooltip === 'Open Workspace Folder') {
                    void vscode.commands.executeCommand('vscode.openFolder', button.item.value.dirUri, { forceNewWindow: true })
                }
            },
        })
        if (selected === undefined) return

        const selectedNames = new Set(selected.map(s => s.name))

        // determine operations based on current overrides
        const toRemove = new Set(candidates.filter(c => !selectedNames.has(c.name) && overrides?.[c.name]?.startsWith('file:')).map(c => c.name))
        const toAdd = candidates.filter(c => selectedNames.has(c.name) && !overrides?.[c.name]?.startsWith('file:'))

        // Raw text edit of package.json
        const decoder = new TextDecoder()
        const encoder = new TextEncoder()
        const pkgUri = joinPackageJson(workspaceUri)
        const originalText = decoder.decode(await vscode.workspace.fs.readFile(pkgUri))
        const lines = originalText.split(/\r?\n/)

        // find pnpm block
        const pnpmLineIndex = lines.findIndex(l => /^\s*"pnpm"\s*:\s*{\s*$/.test(l))
        if (pnpmLineIndex === -1) {
            void vscode.window.showWarningMessage('Could not find pnpm block in package.json to edit overrides')
            return
        }

        // find overrides block start and end within pnpm block
        const pnpmIndent = /^(\s*)/.exec(lines[pnpmLineIndex]!)![1] || ''
        let overridesStart = -1
        let pnpmEnd = -1
        for (let i = pnpmLineIndex + 1; i < lines.length; i++) {
            if (overridesStart === -1 && /^\s*"overrides"\s*:\s*{\s*$/.test(lines[i]!)) overridesStart = i
            if (new RegExp(`^${pnpmIndent}}`).test(lines[i]!)) {
                pnpmEnd = i
                break
            }
        }

        if (overridesStart === -1) {
            void vscode.window.showWarningMessage('Could not find pnpm.overrides block in package.json')
            return
        }

        const overridesIndent = /^(\s*)/.exec(lines[overridesStart]!)![1] || ''
        let overridesEnd = -1
        for (let i = overridesStart + 1; i < pnpmEnd; i++)
            if (new RegExp(`^${overridesIndent}}`).test(lines[i]!)) {
                overridesEnd = i
                break
            }

        if (overridesEnd === -1) {
            void vscode.window.showWarningMessage('Malformed pnpm.overrides block in package.json')
            return
        }

        // map existing override lines by name and mark deletions
        const entryLineIndicesByName = new Map<string, number>()
        for (let i = overridesStart + 1; i < overridesEnd; i++) {
            const line = lines[i]!
            const m = /^\s*"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$/.exec(line)
            if (m) entryLineIndicesByName.set(m[1]!, i)
        }

        const toDeleteLineIdx = new Set<number>()
        for (const name of toRemove) {
            const idx = entryLineIndicesByName.get(name)
            if (idx !== undefined) toDeleteLineIdx.add(idx)
        }

        // remove existing lines for those we will add (replace)
        for (const { name } of toAdd) {
            const idx = entryLineIndicesByName.get(name)
            if (idx !== undefined) toDeleteLineIdx.add(idx)
        }

        // apply deletions from bottom to top to keep indices stable
        const deleteIndicesSorted = [...toDeleteLineIdx].sort((a, b) => b - a)
        for (const idx of deleteIndicesSorted) lines.splice(idx, 1)

        // adjust overridesEnd after deletions
        const removedBeforeEnd = deleteIndicesSorted.filter(i => i < overridesEnd).length
        overridesEnd -= removedBeforeEnd

        // compute remaining entry count
        const remainingEntries = Math.max(0, overridesEnd - (overridesStart + 1))

        // insert new entries directly after overrides line, maintain commas
        const childIndent = `${overridesIndent}  `
        const additions = toAdd.map(({ name, dirPath }) => ({ name, dirPath }))
        const hasFollowingAfterAdditions = remainingEntries > 0
        const newLines: string[] = []
        for (const [idx, add] of additions.entries()) {
            const isLastAdded = idx === additions.length - 1
            const needComma = hasFollowingAfterAdditions || !isLastAdded
            newLines.push(`${childIndent}"${add.name}": "file:${add.dirPath}"${needComma ? ',' : ''}`)
        }

        // splice new lines right after overridesStart
        if (newLines.length > 0) {
            lines.splice(overridesStart + 1, 0, ...newLines)
            overridesEnd += newLines.length
        }

        // normalize commas: every entry line except the last should end with a comma
        const entryIdxs: number[] = []
        for (let i = overridesStart + 1; i < overridesEnd; i++) {
            const line = lines[i]!
            if (/^\s*"[^"]+"\s*:\s*"[^"]*"\s*,?\s*$/.test(line)) entryIdxs.push(i)
        }

        for (const [pos, idx] of entryIdxs.entries()) {
            const isLast = pos === entryIdxs.length - 1
            const m = /^(\s*)"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$/.exec(lines[idx]!)!
            const indent = m[1]!
            const key = m[2]!
            const val = m[3]!
            lines[idx] = `${indent}"${key}": "${val}"${isLast ? '' : ','}`
        }

        const updatedText = lines.join('\n')
        await vscode.workspace.fs.writeFile(pkgUri, encoder.encode(updatedText))

        // Run install
        const runInstall = getExtensionSetting('linkCommand.runInstall')
        // eslint-disable-next-line curly
        if (runInstall) {
            await packageManagerCommand({
                command: 'install',
                cwd: workspaceUri,
                forcePm: 'pnpm',
            })
        }
    })
}
