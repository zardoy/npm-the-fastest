import * as vscode from 'vscode'
import { parseTree, findNodeAtLocation, getNodeValue, Node } from 'jsonc-parser'
import { compact } from 'lodash'
import { getExtensionSetting, getExtensionCommandId } from 'vscode-framework'
import { packageJsonSelector } from './packageJsonComplete'

const scriptLinksCommandRegex = /((?<START>(^|&&|")\s?((pnpm|yarn|npm) run) )(?<NAME>[\wA-Z\d:-]+))|((?<START2>(^|&&|")\s?(pnpm|yarn) )(?<NAME2>[\wA-Z\d:-]+))/g;

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
                    // ensure script's length matches real text length in JSON document
                    const script = (getNodeValue(scriptNode) as string)
                        .replaceAll('\\', '\\\\')
                        .replace(/[\n\r\t]/g, '\\$&')
                        .replaceAll('"', '\\"')
                    let match: RegExpExecArray | null
                    while ((match = scriptLinksCommandRegex.exec(script))) {
                        const scriptRefName = match.groups!.NAME || match.groups!.NAME2!
                        // if (!(scriptRefName in scriptsObject)) continue
                        const targetScriptNode = scriptsNodes.find(node => node.children![0]!.value === scriptRefName)?.children?.[1]
                        if (!targetScriptNode) continue
                        const getNodeStringStart = (node: Node) => node.offset + 1
                        const startOffset = getNodeStringStart(scriptNode) + match.index + (match.groups!.START || match.groups!.START2!).length
                        const { line: targetScriptLine, character: targetScriptCharacter } = document.positionAt(getNodeStringStart(targetScriptNode))
                        const fragment = `L${targetScriptLine + 1},${targetScriptCharacter + 1}`
                        const linkPositions = [startOffset, startOffset + scriptRefName.length].map(offset => document.positionAt(offset)) as [
                            vscode.Position,
                            vscode.Position,
                        ]
                        links.push({
                            range: new vscode.Range(...linkPositions),
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
