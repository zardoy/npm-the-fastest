/* eslint-disable max-depth */
import * as vscode from 'vscode'
import { parseTree, getLocation, findNodeAtLocation, getNodeValue } from 'jsonc-parser'
import { getExtensionSetting, VSCodeQuickPickItem } from 'vscode-framework'
import { getJsonCompletingInfo, jsonPathEquals, jsonValuesToCompletions } from '@zardoy/vscode-utils/build/jsonCompletions'
import { Utils } from 'vscode-uri'
import { getBinCommands, runBinCommand } from './commands/runBinCommand'

export const registerPackageJsonAutoComplete = () => {
    if (!getExtensionSetting('packageJsonIntellisense')) return
    vscode.languages.registerCompletionItemProvider(
        { language: 'json', pattern: '**/package.json' },
        {
            async provideCompletionItems(document, position, token, context) {
                if (!document.uri.path.endsWith('package.json')) return []
                const offset = document.offsetAt(position)
                const root = parseTree(document.getText())!
                const location = getLocation(document.getText(), offset)
                const { path } = location
                const node = findNodeAtLocation(root, path)
                const jsonCompletingInfo = getJsonCompletingInfo(location, document, position)
                if (!jsonCompletingInfo) return
                const { insideStringRange } = jsonCompletingInfo
                const folder = Utils.joinPath(document.uri, '..')
                if (insideStringRange) {
                    if (location.matches(['name'])) {
                        const folderName = Utils.basename(folder)
                        return jsonValuesToCompletions([folderName])
                    }

                    if (location.matches(['scripts', '*'])) {
                        const node = findNodeAtLocation(root, path)!
                        const value: string = getNodeValue(node)
                        const start = node.offset + 1
                        const stringPos = offset - start
                        const parts = value.split('&&')
                        let currentPart: string | undefined
                        let currentPartPosNeg = 0
                        let len = 0
                        for (const part of parts) {
                            len += part.length
                            if (len > stringPos) {
                                currentPart = part
                                currentPartPosNeg = len - stringPos
                                break
                            }
                        }

                        if (!currentPart) currentPart = parts.slice(-1)[0]!
                        const currentPartClip = currentPart.slice(0, currentPart.length - currentPartPosNeg)

                        const afterArg = /^\s*\S+\s/.exec(currentPartClip)
                        if (afterArg) {
                            const compareString = currentPartClip.trimStart().replace(/\s$/, '')
                            for (const [key, filesGlob] of Object.entries(pathAutoComplete))
                                if (compareString === key) {
                                    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, filesGlob), '**/node_modules/**')
                                    return files.map(uri => ({
                                        // / trigger char on folder
                                        label: Utils.basename(uri),
                                        kind: vscode.CompletionItemKind.File,
                                        detail: Utils.basename(uri),
                                    }))
                                }

                            if (scriptLinkCommandRegex.test(compareString)) {
                                const scriptsKeys = Object.keys(getNodeValue(findNodeAtLocation(root, ['scripts'])!)!).filter(s => s !== path[1])
                                return jsonValuesToCompletions(scriptsKeys)
                            }

                            return
                        }

                        let binCommands: VSCodeQuickPickItem[] = []
                        try {
                            binCommands = await getBinCommands()
                        } catch (error) {
                            console.warn(error)
                        }

                        return jsonValuesToCompletions(
                            binCommands.map(({ label }) => label),
                            document.getWordRangeAtPosition(position, /[\w\d-]+/i),
                        )
                    }
                    //
                }

                // if (location.matches(['peerDependenciesMeta'])) return jsonValuesToCompletions(['test'])

                // console.log(getLocation(document.getText(), offset).matches(['scripts', '*']))
            },
        },
        '"',
        ' ',
    )
}

const parseScriptCommand = (contents: string) => {}

const tsm = '*.{js,jsx,ts,tsx,cjs}'
const pathAutoComplete = {
    'tsc -p': '[tj]sconfig*.json',
    node: '*.{js,mjs,cjs}',
    tsm,
    'ts-node': tsm,
}

const scriptLinkCommandRegex = /^(pnpm|yarn)|(pnpm|yarn|npm) run$|/
