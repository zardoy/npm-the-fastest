/// <reference types="@withfig/autocomplete-types/index" />
import specNames from '@withfig/autocomplete/build/'
import nodeSpec from '@withfig/autocomplete/build/node'
import gitSpec from '@withfig/autocomplete/build/git'
import yarnSpec from '@withfig/autocomplete/build/yarn'
import esbuildSpec from '@withfig/autocomplete/build/esbuild'
import webpackSpec from '@withfig/autocomplete/build/webpack'
import {
    commands,
    CompletionItem,
    CompletionItemKind,
    CompletionItemTag,
    languages,
    MarkdownString,
    Position,
    Range,
    SnippetString,
    TextDocument,
    window,
} from 'vscode'
import { ensureArray } from '@zardoy/utils'
import { parse } from './shell-quote-patched'
import { niceLookingCompletion } from '@zardoy/vscode-utils/build/completions'
import { join } from 'path'
import { pathToFileURL } from 'url'

// todo remove all icons from the bundle
const niceIconMap = {
    esbuild: 'esbuild.js',
}

const globalOptions = {
    insertOnCompletionAccept: 'space' as 'space' | 'disabled',
}

type DocumentInfo = {
    typedOption: string
    // used for providing correct editing range
    realPosition: Position
    loadSpec: string
    parsedInfo: {
        usedOptions: UsedOption[]
        completingArg: string | undefined
        // TODO strip to position
        completingParamValue:
            | {
                  // TODO also strip
                  currentEnteredValue: string
                  paramName: string
              }
            | undefined
    }
}

type ParsedOption = [optionName: string, value?: string]

type UsedOption = { name: string }

const parseOptionToCompletion = (option: Fig.Option, usedOptions: UsedOption[], info: DocumentInfo): CompletionItem[] => {
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
    if (seperator === false) seperator = ''
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

        // todo charset option
        const defaultInsertText = optionName + seperator + (seperator.length !== 1 && globalOptions.insertOnCompletionAccept === 'space' ? ' ' : '')
        const customInsertText = insertValue !== undefined ? new SnippetString().appendText(insertValue) : undefined
        if (customInsertText) customInsertText.value = customInsertText.value.replace(/{cursor\\}/, '$1')
        completions.push({
            label: {
                label: displayName || optionName,
                detail: isRequired ? 'REQUIRED' : getArgPreviewFromOption(option) /** todo description: short documentation */,
            },
            // be sure its consistent
            sortText: priority.toString().padStart(3, '0'),
            documentation: new MarkdownString(description),
            insertText: customInsertText ?? defaultInsertText,
            range: new Range(info.realPosition.translate(0, -info.typedOption.length), info.realPosition),
            command: {
                command: APPLY_SUGGESTION_COMPLETION,
                title: '',
            },
            ...(deprecated
                ? {
                      tags: [CompletionItemTag.Deprecated],
                  }
                : {}),
        })
    }
    return completions
}

const getArgPreviewFromOption = ({ args }: Fig.Option) => {
    const argsPreview =
        args &&
        ensureArray(args)
            .map(({ name }) => name)
            .filter(name => name?.trim())
            .join(' ')
    if (!argsPreview) return
    return ` ${argsPreview}`
}

// todo
// const figBaseSuggestionToVscodeCompletion = (baseCompetion: Fig.BaseSuggestion): CompletionItem => {}

console.clear()
type CommandParts = [string, number][]
const parseCommandString = (inputString: string, stringPos: number) => {
    // todo parse fig completion separators later
    const commandsParts = parse(inputString).reduce<CommandParts[]>(
        (prev, parsedPart) => {
            if (Array.isArray(parsedPart)) prev.slice(-1)[0]!.push(parsedPart as any)
            else prev.push([])
            return prev
        },
        [[]],
    )
    let currentCommandParts: CommandParts | undefined
    for (const commandParts of commandsParts) {
        const firstCommandPart = commandParts[0]
        if (firstCommandPart?.[1] <= stringPos) {
            currentCommandParts = commandParts
            // currentCommandOffset = len - stringPos
        }
    }
    return currentCommandParts
}

const commandPartsToParsed = (commandParts: CommandParts) => {
    return {
        name: commandParts[0][0],
        params: commandParts.map(commandPart => commandPart[0]).filter(part => part.startsWith('-')),
    }
}

const getDocumentParsedResult = (stringContents: string, position: Position): DocumentInfo | undefined => {
    const textParts = stringContents.split(' ')
    if (textParts.length < 2) return
    const commandParts = parseCommandString(stringContents, position.character)
    if (!commandParts) return
    let parsedPartsLength = commandParts.length
    const { name, params } = commandPartsToParsed(commandParts)

    let lastValue = commandParts.slice(-1)[0]
    let preLastValue = commandParts.slice(-2)[0]
    // TODO
    if (stringContents.endsWith(' ')) {
        preLastValue = lastValue
        lastValue = ['', stringContents.length - 1]
        parsedPartsLength++
    }
    return {
        typedOption: textParts.pop() ?? '',
        realPosition: position,
        loadSpec: name,
        parsedInfo: {
            usedOptions: params.map(param => ({ name: param })),
            completingArg: lastValue && !lastValue?.[0].startsWith('-') && parsedPartsLength === 2 ? lastValue?.[0] : undefined,
            completingParamValue: preLastValue?.[0].startsWith('-')
                ? {
                      paramName: preLastValue[0],
                      currentEnteredValue: lastValue[0],
                  }
                : undefined,
        },
    }
}

const getFigSubcommand = (__spec: Fig.Spec) => {
    const _spec = typeof __spec === 'function' ? __spec() : __spec
    const spec = 'versionedSpecPath' in _spec ? undefined! : _spec
    return spec
}

const getSpecOptions = (__spec: Fig.Spec) => {
    const spec = getFigSubcommand(__spec)
    if (!spec.options?.length) return
    return spec.options
}

const getSpecCompletions = (__spec: Fig.Spec, documentInfo: DocumentInfo) => {
    const specOptions = getSpecOptions(__spec)

    return specOptions?.flatMap(option => parseOptionToCompletion(option, documentInfo.parsedInfo.usedOptions, documentInfo))
}

const loadCompletingSpec = (documentInfo: DocumentInfo): Fig.Spec => {
    const spec = {
        git: gitSpec,
        node: nodeSpec,
        yarn: yarnSpec,
        webpack: webpackSpec,
        esbuild: esbuildSpec,
    }[documentInfo.loadSpec] as any
    return spec
}

const figArgToCompletions = (arg: Fig.Arg) => {
    // if (Array.isArray(arg.generators)) return
    // todo expect all props
    if (!arg.suggestions) return
    return arg.suggestions.map((suggestion): CompletionItem => {
        const completion = new CompletionItem(typeof suggestion === 'string' ? suggestion : ensureArray(suggestion.name)[0]!, CompletionItemKind.Value)
        return completion
    })
}

const APPLY_SUGGESTION_COMPLETION = '_applyFigSuggestion'

declare const trackDisposable

trackDisposable(
    commands.registerCommand(APPLY_SUGGESTION_COMPLETION, () => {
        commands.executeCommand('editor.action.triggerSuggest')
        commands.executeCommand('editor.action.triggerParameterHints')
    }),
)

trackDisposable(
    languages.registerCompletionItemProvider(
        'bat',
        {
            async provideCompletionItems(document, position, token, context) {
                const documentInfo = getDocumentParsedResult(document.lineAt(position).text.slice(0, position.character), position)
                if (!documentInfo) return specNames.map(name => ({ label: name }))
                const spec = loadCompletingSpec(documentInfo)

                const { completingParamValue, completingArg } = documentInfo.parsedInfo
                const figSubcommand = getFigSubcommand(spec)
                console.log(figSubcommand.options)
                const { args, subcommands } = figSubcommand
                let completingSubcommand = figSubcommand
                if (completingArg !== undefined && subcommands) {
                    return subcommands.map(subcommand => ({
                        label: subcommand.name,
                        documentation: subcommand.description && new MarkdownString(subcommand.description),
                    }))
                }
                if (completingParamValue) {
                    const specOptions = getSpecOptions(spec)
                    // console.log(specOptions)
                    if (!specOptions) return
                    const completingOption = specOptions.find(specOption => ensureArray(specOption.name).includes(completingParamValue.paramName))
                    if (!completingOption) return
                    const { args } = completingOption
                    if (args) {
                        // console.log(args, completingOption)
                        if (Array.isArray(args)) return
                        return figArgToCompletions(args)
                    }
                }
                const specCompletions = getSpecCompletions(spec, documentInfo)
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
        '/',
    ),
)

trackDisposable(
    languages.registerSignatureHelpProvider('bat', {
        provideSignatureHelp(document, position, token, context) {
            const documentInfo = getDocumentParsedResult(document.lineAt(position).text.slice(0, position.character), position)
            if (!documentInfo) return
            const spec = loadCompletingSpec(documentInfo)
            if (!spec) return
            const { completingParamValue } = documentInfo.parsedInfo
            if (completingParamValue) {
                const specOptions = getSpecOptions(spec)
                console.log(specOptions)
                if (!specOptions) return
                const completingOption = specOptions.find(specOption => ensureArray(specOption.name).includes(completingParamValue.paramName))
                if (!completingOption) return
                const { args } = completingOption
                if (!args || Array.isArray(args)) return
                const hint = args.name ?? 'argument'
                return {
                    activeParameter: 0,
                    activeSignature: 0,
                    signatures: [
                        {
                            label: hint,
                            parameters: [
                                {
                                    label: hint,
                                },
                            ],
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
