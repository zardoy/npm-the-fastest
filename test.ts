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
    CompletionItemLabel,
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
import _ from 'lodash'

// todo remove all icons from the bundle
const niceIconMap = {
    esbuild: 'esbuild.js',
}

const globalOptions = {
    insertOnCompletionAccept: 'space' as 'space' | 'disabled',
}

// todo resolve sorting!
type DocumentInfo = {
    typedOption: string
    // used for providing correct editing range
    realPosition: Position
    specName: string
    parsedInfo: {
        partsToPos: [isOption: boolean, contents: string][]
        options: UsedOption[]
        args: string[]
        currentlyCompletingArgIndex: number | undefined
        currentPartValue: string | undefined
        // TODO strip to position
        completingOptionValue:
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

// todo hide commands
const parseOptionToCompletion = (option: Fig.Option, info: DocumentInfo): CompletionItem | undefined => {
    // todo deprecated option
    let { isRequired, isRepeatable = false, requiresSeparator: seperator = false, dependsOn, exclusiveOn } = option

    if (seperator === true) seperator = '='
    if (seperator === false) seperator = ''

    const usedOptionsNames = info.parsedInfo.options.map(({ name }) => name)
    const currentOptionsArr = ensureArray(option.name)

    const optionUsedCount = usedOptionsNames.filter(name => currentOptionsArr.includes(name)).length
    if (isRepeatable === false && optionUsedCount > 0) return
    if (typeof isRepeatable === 'number' && optionUsedCount >= isRepeatable) return

    if (dependsOn && !dependsOn.every(name => usedOptionsNames.includes(name))) return
    if (exclusiveOn?.some(name => usedOptionsNames.includes(name))) return

    // todo charset option
    const optionsRender = currentOptionsArr.join(' ')
    const completion = figBaseSuggestionToVscodeCompletion(option, optionsRender, info.typedOption)
    ;(completion.label as CompletionItemLabel).detail = isRequired ? 'REQUIRED' : getArgPreviewFromOption(option)

    const insertOption = Array.isArray(option.name)
        ? // option.name /* filter gracefully */
          //       .map(name => [name, name.indexOf(info.typedOption)] as const)
          //       .sort((a, b) => a[1] - b[1])
          //       .filter(([, index]) => index !== -1)?.[0]?.[0] || option.name[0]
          option.name.find(name => name.toLowerCase().includes(info.typedOption.toLowerCase())) || option.name[0]
        : option.name
    const defaultInsertText = insertOption + seperator + (seperator.length !== 1 && globalOptions.insertOnCompletionAccept === 'space' ? ' ' : '')
    completion.insertText ??= defaultInsertText
    // todo also pass
    completion.range = new Range(info.realPosition.translate(0, -info.typedOption.length), info.realPosition)
    completion.command = {
        command: APPLY_SUGGESTION_COMPLETION,
        title: '',
    }

    return completion
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
const figBaseSuggestionToVscodeCompletion = (baseCompetion: Fig.BaseSuggestion, initialName: string, lastTypedText: string): CompletionItem => {
    const {
        displayName,
        insertValue,
        replaceValue,
        description,
        icon,
        /* isDangerous, */
        priority = 50,
        hidden,
        deprecated,
    } = baseCompetion
    const STRING_TRUNCATE_LENGTH = 10
    let descriptionText = undefined
    // let descriptionText = (description && markdownToTxt(description)) || undefined
    // if (descriptionText && descriptionText.length > STRING_TRUNCATE_LENGTH) descriptionText = `${descriptionText!.slice(0, STRING_TRUNCATE_LENGTH)}`

    const completion = new CompletionItem({ label: displayName || initialName, description: descriptionText })

    completion.insertText = insertValue !== undefined ? new SnippetString().appendText(insertValue) : undefined
    if (completion.insertText) completion.insertText.value = completion.insertText.value.replace(/{cursor\\}/, '$1')
    // lets be sure its consistent
    completion.sortText = priority.toString().padStart(3, '0')
    completion.documentation = (description && new MarkdownString(description)) || undefined
    if (deprecated) completion.tags = [CompletionItemTag.Deprecated]
    if (hidden && lastTypedText !== initialName) completion.filterText = ''

    return completion
}

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
    let currentPartIndex
    let currentPartValue
    let currentCommandParts: CommandParts | undefined
    // todo reverse them
    for (const commandParts of commandsParts) {
        const firstCommandPart = commandParts[0]
        if (firstCommandPart?.[1] <= stringPos) {
            currentCommandParts = commandParts
        } else {
            break
        }
    }
    if (!currentCommandParts) return
    if (currentCommandParts.length && inputString.endsWith(' ')) currentCommandParts.push([' ', stringPos - 1])
    for (const [i, currentCommandPart] of currentCommandParts.entries()) {
        if (currentCommandPart?.[1] <= stringPos) {
            currentPartIndex = i
            currentPartValue = currentCommandPart[0].slice(0, stringPos - currentCommandPart?.[1])
            // currentCommandOffset = len - stringPos
        } else {
            break
        }
    }
    return { parts: currentCommandParts, currentPartIndex, currentPartValue }
}

const commandPartsToParsed = (commandParts: CommandParts) => {
    const [specPart, ...restParts] = commandParts
    const [args, params] = _.partition(
        restParts.map(([partString]) => partString),
        partString => partString.startsWith('-'),
    )
    return {
        specName: specPart[0],
        args,
        params,
    }
}

// todo first incomplete
const getDocumentParsedResult = (stringContents: string, position: Position): DocumentInfo | undefined => {
    const textParts = stringContents.split(' ')
    if (textParts.length < 2) return
    const { parts: commandParts, currentPartIndex, currentPartValue } = parseCommandString(stringContents, position.character) ?? {}
    if (!commandParts) return
    const currentPartIsOption = currentPartValue.startsWith('-')
    const { specName, args, params } = commandPartsToParsed(commandParts)

    /** can be specName */
    let preCurrentValue = commandParts[currentPartIndex - 1]?.[0]
    return {
        typedOption: textParts.pop() ?? '',
        realPosition: position,
        specName,
        parsedInfo: {
            partsToPos: commandParts.slice(1, currentPartIndex).map(([contents]) => [contents.startsWith('-'), contents]),
            currentPartValue,
            currentlyCompletingArgIndex: !currentPartIsOption ? currentPartIndex : undefined,
            options: params.map(param => ({ name: param })),
            args,
            completingOptionValue:
                preCurrentValue.startsWith('-') && !currentPartIsOption
                    ? {
                          paramName: preCurrentValue,
                          currentEnteredValue: currentPartValue,
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

const normalizeSpecOptions = (__spec: Fig.Spec) => {
    const specOptions = getSpecOptions(__spec)
    if (!specOptions) return

    const optionsUniq = _.uniqBy([...specOptions].reverse(), value => value.name.toString())
    return optionsUniq
}

const specOptionsToVscodeCompletions = (__spec: Fig.Spec, documentInfo: DocumentInfo) => {
    return normalizeSpecOptions(__spec)
        ?.flatMap(option => parseOptionToCompletion(option, documentInfo))
        .filter(Boolean)
}

const getCompletingSpec = (specName: string | Fig.LoadSpec): Fig.Spec | undefined => {
    // todo
    if (typeof specName !== 'string') return
    const spec = {
        git: gitSpec,
        node: nodeSpec,
        yarn: yarnSpec,
        webpack: webpackSpec,
        esbuild: esbuildSpec,
    }[specName] as any
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
                const spec = getCompletingSpec(documentInfo.specName)
                if (!spec) return
                const figRootSubcommand = getFigSubcommand(spec)

                const { completingOptionValue: completingParamValue, partsToPos } = documentInfo.parsedInfo
                let subcommand = figRootSubcommand
                let lastCompletingArg: Fig.Arg | undefined
                // in linting all parts
                for (const [isOption, partContents] of partsToPos) {
                    lastCompletingArg = undefined
                    if (isOption) {
                        // validate option
                    } else {
                        const subcommandSwitch = subcommand.subcommands?.find(subcommand => ensureArray(subcommand.name).includes(partContents))
                        if (subcommandSwitch) subcommand = subcommandSwitch
                        else if (subcommand.args) {
                            // subcommand.requiresSubcommand
                            // todo
                            const arg = ensureArray(subcommand.args)[0]
                            // arg.name hint
                            lastCompletingArg = arg
                            // note: we don't support deprecated (isModule)
                            if (!arg.isVariadic) {
                                let newSubcommand
                                if (arg.isCommand) newSubcommand = getCompletingSpec(partContents)
                                else if (arg.loadSpec) newSubcommand = getCompletingSpec(arg.loadSpec)
                                // we loaded unknown spec now its nothing
                                if (!newSubcommand) return
                                subcommand = newSubcommand
                            }
                            // validate arg
                        } else {
                            // report no arg
                        }
                    }
                }
                if (lastCompletingArg) {
                    return figArgToCompletions(lastCompletingArg)
                }

                if (completingParamValue) {
                    const specOptions = getSpecOptions(subcommand)
                    if (!specOptions) return
                    const completingOption = specOptions.find(specOption => ensureArray(specOption.name).includes(completingParamValue.paramName))
                    if (!completingOption) return
                    const { args } = completingOption
                    if (args) {
                        if (Array.isArray(args)) return
                        return figArgToCompletions(args)
                    }
                }
                const specCompletions = specOptionsToVscodeCompletions(subcommand, documentInfo)
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
            const spec = getCompletingSpec(documentInfo.specName)
            if (!spec) return
            const { completingOptionValue: completingParamValue } = documentInfo.parsedInfo
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
