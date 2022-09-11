import { parseTree, findNodeAtLocation, getNodeValue, Node } from 'jsonc-parser'
import { compact } from 'lodash'
import * as vscode from 'vscode'
import { getExtensionSetting, getExtensionCommandId } from 'vscode-framework'
import { packageJsonSelector } from './packageJsonComplete'

const scriptLinksCommandRegex = /((^|&&|")\s?((pnpm|yarn)|(pnpm|yarn|npm) run) )(?<NAME>[A-z\d-]+)/g

export const registerPackageJsonLinks = () => {
    vscode.languages.registerDocumentLinkProvider(packageJsonSelector, {
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
