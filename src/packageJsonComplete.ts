/* eslint-disable no-bitwise */
/* eslint-disable max-depth */
import * as vscode from 'vscode'
import { parseTree, getLocation, findNodeAtLocation, getNodeValue, Node } from 'jsonc-parser'
import { getExtensionCommandId, getExtensionSetting, VSCodeQuickPickItem } from 'vscode-framework'
import { getJsonCompletingInfo, jsonPathEquals, jsonValuesToCompletions } from '@zardoy/vscode-utils/build/jsonCompletions'
import { Utils } from 'vscode-uri'
import picomatch from 'picomatch/posix'
import { compact } from '@zardoy/utils'
import { getBinCommands, runBinCommand } from './commands/runBinCommand'

const selector = { language: 'json', pattern: '**/package.json' }
export const registerPackageJsonAutoComplete = () => {
    registerCompletions()
    registerLinks()
}

const registerCompletions = () => {
    if (!getExtensionSetting('packageJsonIntellisense')) return
    vscode.languages.registerCompletionItemProvider(
        selector,
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

                    // general purpose
                    if (location.matches(['icon'])) {
                        const value = (getNodeValue(findNodeAtLocation(root, path)!) as string).slice(0, offset - document.offsetAt(insideStringRange.start))
                        // const string = document.getText(insideStringRange)
                        return listFilesCompletions(document, value, insideStringRange, '*.{jpg,jpeg,png,svg}')
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
                        const nameRangeRegex = /[\w\d-]+/i

                        const afterArg = /^\s*\S+\s/.exec(currentPartClip)
                        if (afterArg) {
                            // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
                            const lastArgLength = currentPartClip.match(/[\w\d-]+$/i)?.[0]?.length
                            const lastArgRange = lastArgLength ? new vscode.Range(position.translate(0, -lastArgLength), position) : undefined
                            // completions lookup
                            let compareString = currentPartClip.trimStart()
                            if (lastArgLength) compareString = compareString.slice(0, -lastArgLength)
                            compareString = compareString.replace(/\s$/, '')
                            for (const [key, filesGlob] of Object.entries(pathAutoComplete))
                                if (compareString === key) {
                                    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, filesGlob), '**/node_modules/**')
                                    return files.map(uri => ({
                                        label: Utils.basename(uri),
                                        kind: vscode.CompletionItemKind.File,
                                        detail: Utils.basename(uri),
                                        range: lastArgRange,
                                    }))
                                }

                            if (scriptCompletionCommandRegex.test(compareString)) {
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
                            document.getWordRangeAtPosition(position, nameRangeRegex),
                        )
                    }
                    //
                }

                // if (location.matches(['peerDependenciesMeta'])) return jsonValuesToCompletions(['test'])

                // console.log(getLocation(document.getText(), offset).matches(['scripts', '*']))
                return undefined
            },
        },
        '"',
        ' ',
        '/',
    )
}

const registerLinks = () => {
    vscode.languages.registerDocumentLinkProvider(selector, {
        provideDocumentLinks(document, token) {
            const root = parseTree(document.getText())!
            const scriptsRootNode = findNodeAtLocation(root, ['scripts'])
            const scriptsNodes = scriptsRootNode?.children
            const links: vscode.DocumentLink[] = []
            const nodeObjectMap = (nodes: Node[], type: 'prop' | 'value') => {
                const indexGetter = type === 'prop' ? 0 : 1
                return compact(nodes.map(value => value.type === 'property' && value.children![indexGetter]))
            }

            // #region scripts links
            if (getExtensionSetting('packageJsonLinks') && scriptsNodes)
                for (const scriptNode of nodeObjectMap(scriptsNodes, 'value')) {
                    const script = getNodeValue(scriptNode)
                    let match: RegExpExecArray | null
                    while ((match = scriptLinksCommandRegex.exec(script))) {
                        const scriptRefName = match.groups!.NAME!
                        // if (!(scriptRefName in scriptsObject)) continue
                        const targetScriptNode = scriptsNodes.find(node => node.children![0]!.value === scriptRefName)?.children?.[1]
                        if (!targetScriptNode) continue
                        const getNodeStringStart = (node: Node) => node.offset + 1
                        const startOffset = getNodeStringStart(scriptNode) + match.index + match[1]!.length
                        const positions = [startOffset, startOffset + scriptRefName.length].map(offset => document.positionAt(offset)) as [
                            vscode.Position,
                            vscode.Position,
                        ]
                        const { line: targetScriptLine, character: targetScriptCharacter } = document.positionAt(getNodeStringStart(targetScriptNode))
                        const fragment = `L${targetScriptLine + 1},${targetScriptCharacter + 1}`
                        links.push({
                            range: new vscode.Range(...positions),
                            tooltip: 'Reveal script',
                            target: document.uri.with({ fragment }),
                        })
                    }

                    scriptLinksCommandRegex.lastIndex = 0
                }
            // #endregion

            if (getExtensionSetting('packageJsonScriptNameLink') && scriptsNodes)
                for (const scriptNode of nodeObjectMap(scriptsNodes, 'prop')) {
                    const startOffset = scriptNode.offset + 1
                    const scriptName: string = scriptNode.value
                    const positions = [startOffset, startOffset + scriptName.length].map(offset => document.positionAt(offset)) as [
                        vscode.Position,
                        vscode.Position,
                    ]
                    links.push({
                        range: new vscode.Range(...positions),
                        tooltip: 'Run Script',
                        target: vscode.Uri.parse(`command:${getExtensionCommandId('runNpmScript')}?${JSON.stringify(scriptName)}`),
                    })
                }

            return links
        },
    })
}

const listFilesCompletions = async (baseDocument: vscode.TextDocument, stringContents: string, completionRange: vscode.Range, glob = '*') => {
    const folderPath = stringContents.split('/').slice(0, -1).join('/')
    const filesList = await vscode.workspace.fs.readDirectory(Utils.joinPath(baseDocument.uri, '..', folderPath))
    const isMatch = picomatch(glob)
    return filesList
        .map(([name, type]): vscode.CompletionItem => {
            if (type & vscode.FileType.File && !isMatch(name)) return undefined!
            return {
                label: name,
                kind: type & vscode.FileType.File ? vscode.CompletionItemKind.File : vscode.CompletionItemKind.Folder,
                detail: name,
                range: completionRange,
            }
        })
        .filter(Boolean)
}

const parseScriptCommand = (contents: string) => {}

const tsm = '*.{js,jsx,ts,tsx,cjs}'
const pathAutoComplete = {
    'tsc -p': '[tj]sconfig*.json',
    node: '*.{js,mjs,cjs}',
    tsm,
    'ts-node': tsm,
}

const scriptCompletionCommandRegex = /^(pnpm|yarn)|(pnpm|yarn|npm) run$/
const scriptLinksCommandRegex = /((^|&&)\s?((pnpm|yarn)|(pnpm|yarn|npm) run) )(?<NAME>[A-z\d-]+)/g
