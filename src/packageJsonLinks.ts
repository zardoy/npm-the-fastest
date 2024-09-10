import * as vscode from 'vscode'
import { parseTree, findNodeAtLocation, getNodeValue, Node } from 'jsonc-parser'
import { compact } from 'lodash'
import { getExtensionSetting, getExtensionCommandId, RegularCommands } from 'vscode-framework'
import { watchExtensionSettings } from '@zardoy/vscode-utils/build/settings'
import { noCase } from 'change-case'
import { packageJsonSelector } from './packageJsonComplete'
import { packageJsonAllDependenciesKeys } from './commands-core/packageJson'
import { Configuration } from './configurationType'

const scriptLinksCommandRegex =
    /((?<START>(^|&&|")\s?((pnpm|yarn|npm|bun) run) )(?<NAME>[\wA-Z\d:-]+))|((?<START2>(^|&&|")\s?(pnpm|yarn|bun|run-p|run-s|npm-run-all|concurrently) )(?<NAME2>[\wA-Z\d:-]+))/g

// eslint-disable-next-line arrow-body-style
const registerPackageJsonLinksProvider = () => {
    return vscode.languages.registerDocumentLinkProvider(packageJsonSelector, {
        provideDocumentLinks(document: vscode.TextDocument) {
            const root = parseTree(document.getText())!

            const links: vscode.DocumentLink[] = []

            links.push(...addDependenciesLinks(document, root))

            // #region scripts links
            const scriptsNodes = findNodeAtLocation(root, ['scripts'])?.children

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
                for (const scriptNode of nodeObjectMap(scriptsNodes, 'key')) {
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

export const registerPackageJsonLinks = () => {
    let provider = registerPackageJsonLinksProvider()

    // these settings require reevaluate links (important when package.json is open in side)
    watchExtensionSettings(['depsKeyLinkAction', 'depsValueLinkAction'], () => {
        provider.dispose()
        provider = registerPackageJsonLinksProvider()
    })
}

const addLinksEachChildJson = (
    node: Node | undefined,
    type: 'key' | 'value',
    getLink: (childNode: Node) => vscode.DocumentLink | undefined,
): vscode.DocumentLink[] => {
    if (!node?.children) return []

    const links: vscode.DocumentLink[] = []
    for (const childNode of nodeObjectMap(node.children, type)) {
        const link = getLink(childNode)
        if (!link) continue
        links.push(link)
    }

    return links
}

const getNodeStringStart = (node: Node) => node.offset + 1 // + 1 for quote

const nodeObjectMap = (nodes: Node[], type: 'key' | 'value') => {
    const indexGetter = type === 'key' ? 0 : 1
    return compact(nodes.map(value => value.type === 'property' && value.children![indexGetter]))
}

// Record<Configuration['depsKeyLinkAction'], keyof RegularCommands>
const linkActionSettingMap: Record<Exclude<Configuration['depsKeyLinkAction'], 'disable'>, keyof RegularCommands> = {
    chooseAction: 'openPackageAt',
    openAtJsdelivr: 'openAtJsdelivr',
    openOnNpm: 'openOnNpm',
    openPackageJson: 'openPackagePackageJson',
    openPackageReadmePreview: 'openPackageReadmePreview',
    openPackageRepository: 'openPackageRepository',
    revealInExplorer: 'revealInExplorer',
}

const addDependenciesLinks = (document: vscode.TextDocument, rootNode: Node): vscode.DocumentLink[] => {
    const links: vscode.DocumentLink[] = []

    for (const type of ['key', 'value'] as const) {
        const actionSetting = getExtensionSetting(type === 'key' ? 'depsKeyLinkAction' : 'depsValueLinkAction')
        if (actionSetting === 'disable') continue
        const actionCommand = linkActionSettingMap[actionSetting]
        for (const dependenciesKeyName of packageJsonAllDependenciesKeys) {
            const depsNode = findNodeAtLocation(rootNode, [dependenciesKeyName])
            links.push(
                ...addLinksEachChildJson(depsNode, type, childNode => {
                    const pkg = type === 'key' ? childNode.value : childNode.parent!.children![0]!.value
                    // get range that within quotes
                    const startOffset = getNodeStringStart(childNode)
                    const endOffset = startOffset + childNode.length - 2 /* for opening & closing quote */
                    return {
                        range: new vscode.Range(document.positionAt(startOffset), document.positionAt(endOffset)),
                        tooltip: noCase(actionSetting),
                        target: vscode.Uri.parse(`command:${getExtensionCommandId(actionCommand)}?${JSON.stringify(pkg)}`),
                    }
                }),
            )
        }
    }

    return links
}
