/// <reference types="@withfig/autocomplete-types/index" />
import specNames from '@withfig/autocomplete/build/'
import nodeSpec from '@withfig/autocomplete/build/node'
import gitSpec from '@withfig/autocomplete/build/git'
import yarnSpec from '@withfig/autocomplete/build/yarn'
import webpackSpec from '@withfig/autocomplete/build/webpack'
import { commands, CompletionItem, CompletionItemTag, languages, MarkdownString, Position, Range, SnippetString, TextDocument, window } from 'vscode'
import { ensureArray } from '@zardoy/utils'
import { parse } from './shell-quote-patched'
import { niceLookingCompletion } from '@zardoy/vscode-utils/build/completions'
import { join } from 'path'
import { pathToFileURL } from 'url'

const globalOptions = {
    insertOnCompletionAccept: 'space' as 'space' | 'disabled',
}

type DocumentInfo = {
    typedOption: string
    // used for providing correct editing range
    realPosition: Position
    loadSpec: string
}

type ParsedOption = [optionName: string, value?: string]

const parseOptionToCompletion = (option: Fig.Option, usedOptions: { name: string }[], info: DocumentInfo): CompletionItem[] => {
    // todo deprecated option
    let {
        displayName,
        description,
        isRequired,
        isRepeatable = false,
        insertValue,
        hidden,
        requiresSeparator: seperator = false,
        /* replaceValue, */
        deprecated,
        dependsOn,
        exclusiveOn,
        priority = 50,
        /* isDangerous, */
    } = option
    if (seperator === true) seperator = '='
    if (seperator === false) seperator = globalOptions.insertOnCompletionAccept === 'space' ? ' ' : ''
    const completions: CompletionItem[] = []
    const usedOptionsNames = usedOptions.map(({ name }) => name)
    for (const optionName of ensureArray(option.name)) {
        // todo look for both etc -m --message
        const optionUsedCount = usedOptionsNames.filter(name => name === optionName).length
        if (isRepeatable === false && optionUsedCount > 0) continue

        if (typeof isRepeatable === 'number' && optionUsedCount >= isRepeatable) continue
        if (hidden && info.typedOption !== optionName) continue
        if (dependsOn && !dependsOn.every(name => usedOptionsNames.includes(name))) continue
        if (exclusiveOn?.some(name => usedOptionsNames.includes(name))) continue

        const defaultInsertText = optionName + seperator
        const customInsertText = insertValue !== undefined ? new SnippetString().appendText(insertValue) : undefined
        if (customInsertText) customInsertText.value = customInsertText.value.replace(/{cursor\\}/, '$1')
        completions.push({
            label: { label: optionName, detail: isRequired ? 'REQUIRED' : undefined, description: displayName },
            // be sure its consistent
            sortText: priority.toString().padStart(3, '0'),
            documentation: new MarkdownString(description),
            insertText: customInsertText ?? defaultInsertText,
            range: new Range(info.realPosition.translate(0, -info.typedOption.length), info.realPosition),
            ...(deprecated
                ? {
                      tags: [CompletionItemTag.Deprecated],
                  }
                : {}),
        })
    }
    return completions
}

// have nothing common with ts!
// const parseCommandLine = () => {
//     parse(, )
// }

const getDocumentParsedResult = (stringContents: string, position: Position): DocumentInfo | undefined => {
    const textParts = stringContents.split(' ')
    if (textParts.length < 2) return

    return {
        typedOption: textParts.pop() ?? '',
        realPosition: position,
        loadSpec: textParts[0],
    }
}

const getSpecCompletions = async (__spec: Fig.Spec, documentInfo: DocumentInfo) => {
    const _spec = typeof __spec === 'function' ? __spec() : __spec
    const spec = 'versionedSpecPath' in _spec ? undefined! : _spec

    if (!spec.options?.length) return

    return spec.options.flatMap(option => parseOptionToCompletion(option, [], documentInfo))
}

declare const trackDisposable

trackDisposable(
    languages.registerCompletionItemProvider(
        'bat',
        {
            async provideCompletionItems(document, position, token, context) {
                const documentInfo = getDocumentParsedResult(document.lineAt(position).text.slice(0, position.character), position)
                if (!documentInfo) return specNames.map(name => ({ label: name }))

                const spec = {
                    git: gitSpec,
                    node: nodeSpec,
                    yarn: yarnSpec,
                    webpack: webpackSpec,
                }[documentInfo.loadSpec] as any
                if (!spec) return

                const specCompletions = await getSpecCompletions(spec, documentInfo)
                if (!specCompletions) return

                return {
                    items: specCompletions,
                    // set it only if dynamic generator or has hidden
                    isIncomplete: true,
                }
            },
        },
        ' ',
        '-',
    ),
)

trackDisposable(
    languages.registerSignatureHelpProvider('bat', {
        provideSignatureHelp(document, position, token, context) {
            console.log(position.character)
            const text = document.getText(document.getWordRangeAtPosition(position))
            const hint = 'message'
            if (text === 'yes') {
                return {
                    activeParameter: 0,
                    activeSignature: 0,
                    signatures: [
                        {
                            label: hint,
                            parameters: [{ label: hint }],
                        },
                    ],
                }
            }
        },
    }),
)

trackDisposable(
    window.onDidChangeTextEditorSelection(async ({ selections, textEditor }) => {
        const text = textEditor.document.getText(textEditor.document.getWordRangeAtPosition(selections[0].anchor))
        if (text === 'yes') {
            await commands.executeCommand('editor.action.triggerParameterHints')
        }
    }),
)
