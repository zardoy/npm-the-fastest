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
import { compact, ensureArray, findCustomArray } from '@zardoy/utils'
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
    const completion = figBaseSuggestionToVscodeCompletion(option, optionsRender, { ...info, sortTextPrepend: 'd' })
    ;(completion.label as CompletionItemLabel).detail = isRequired ? 'REQUIRED' : getArgPreviewFromOption(option)

    const typedOption = info.parsedInfo.currentPartValue ?? ''
    const insertOption = Array.isArray(option.name)
        ? // option.name /* filter gracefully */
          //       .map(name => [name, name.indexOf(typedOption)] as const)
          //       .sort((a, b) => a[1] - b[1])
          //       .filter(([, index]) => index !== -1)?.[0]?.[0] || option.name[0]
          option.name.find(name => name.toLowerCase().includes(typedOption.toLowerCase())) || option.name[0]
        : option.name
    const defaultInsertText = insertOption + seperator + (seperator.length !== 1 && globalOptions.insertOnCompletionAccept === 'space' ? ' ' : '')
    completion.insertText ??= defaultInsertText
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
const figBaseSuggestionToVscodeCompletion = (
    baseCompetion: Fig.BaseSuggestion,
    initialName: string,
    info: DocumentInfo & { kind?: CompletionItemKind; sortTextPrepend: string },
): CompletionItem => {
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
    completion.documentation = (description && new MarkdownString(description)) || undefined
    const {
        parsedInfo: { currentPartValue },
        kind,
        sortTextPrepend = '',
    } = info
    // lets be sure its consistent
    completion.sortText = sortTextPrepend + priority.toString().padStart(3, '0')
    if (kind) completion.kind = kind
    if (deprecated) completion.tags = [CompletionItemTag.Deprecated]
    if (hidden && currentPartValue !== initialName) completion.filterText = ''
    completion.range = new Range(info.realPosition.translate(0, -(currentPartValue ?? '').length), info.realPosition)

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
    if (currentCommandParts.length && inputString.endsWith(' ')) currentCommandParts.push([' ', stringPos])
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
    const [params, args] = _.partition(
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

const getNormalizedSpecOptions = (__spec: Fig.Spec) => {
    const specOptions = getSpecOptions(__spec)
    if (!specOptions) return

    const optionsUniq = _.uniqBy([...specOptions].reverse(), value => value.name.toString())
    return optionsUniq
}

// imo specOptions is more memorizable rather than commandOptions
const specOptionsToVscodeCompletions = (__spec: Fig.Spec, documentInfo: DocumentInfo) => {
    return compact(getNormalizedSpecOptions(__spec)?.map(option => parseOptionToCompletion(option, documentInfo)) ?? [])
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

// current sorting:
// - a option arg suggestions
// - b just args
// - c subcommands
// - d options

const figArgToCompletions = (arg: Fig.Arg, documentInfo: DocumentInfo) => {
    // if (Array.isArray(arg.generators)) return
    // todo expect all props
    if (!arg.suggestions) return
    return arg.suggestions.map((suggestion): CompletionItem => {
        if (typeof suggestion === 'string')
            suggestion = {
                name: suggestion,
            }
        const completion = figBaseSuggestionToVscodeCompletion(suggestion, ensureArray(suggestion.name)[0]!, {
            ...documentInfo,
            kind: CompletionItemKind.Constant,
            sortTextPrepend: 'a',
        })
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

                const { completingOptionValue: completingParamValue, partsToPos, currentPartValue = '', currentlyCompletingArgIndex } = documentInfo.parsedInfo
                let subcommand = figRootSubcommand
                let lastCompletingArg: Fig.Arg | undefined
                let argMetCount = 0
                // in linting all parts
                for (const [isOption, partContents] of partsToPos) {
                    if (isOption) {
                        // validate option
                    } else {
                        const subcommandSwitch = subcommand.subcommands?.find(subcommand => ensureArray(subcommand.name).includes(partContents))
                        if (subcommandSwitch) {
                            subcommand = subcommandSwitch
                            argMetCount = 0
                        } else if (subcommand.args) {
                            argMetCount++
                            // subcommand.requiresSubcommand
                            // todo
                            const arg = ensureArray(subcommand.args)[0]
                            // arg.name hint
                            // note: we don't support deprecated (isModule)
                            if (!arg.isVariadic) {
                                let newSubcommand
                                if (arg.isCommand) newSubcommand = getCompletingSpec(partContents)
                                else if (arg.loadSpec) newSubcommand = getCompletingSpec(arg.loadSpec)
                                // we loaded unknown spec now its nothing
                                if (!newSubcommand) return
                                argMetCount = 0
                                subcommand = newSubcommand
                            }
                            // validate arg
                        } else {
                            // report no arg
                        }
                    }
                }
                const collectedCompletions: CompletionItem[] = []
                if (currentlyCompletingArgIndex !== undefined) {
                    for (const arg of ensureArray(subcommand.args ?? [])) {
                        if (arg && !arg.isVariadic && argMetCount === 0) {
                            collectedCompletions.push(...(figArgToCompletions(arg, documentInfo) ?? []))
                        }
                    }
                    collectedCompletions.push(
                        ...(subcommand.subcommands?.map(subc => {
                            const nameArr = ensureArray(subc.name)
                            const completion = figBaseSuggestionToVscodeCompletion(
                                subc,
                                nameArr.find(name => name.toLowerCase().includes(currentPartValue.toLowerCase())) ?? nameArr[0],
                                {
                                    ...documentInfo,
                                    kind: CompletionItemKind.Module,
                                    sortTextPrepend: 'c',
                                },
                            )
                            return completion
                        }) ?? []),
                    )
                }

                const options = getNormalizedSpecOptions(subcommand)
                if (options) {
                    // todo maybe use sep-all optm?
                    let patchedDocumentInfo = documentInfo
                    const currentOptionValue =
                        findCustomArray(options, ({ requiresSeparator, name }) => {
                            if (!requiresSeparator) return
                            const sep = requiresSeparator ? '=' : requiresSeparator
                            const sepIndex = currentPartValue.indexOf(sep)
                            if (sepIndex === -1) return
                            const userParamName = currentPartValue.slice(0, sepIndex)
                            if (!ensureArray(name).includes(userParamName)) return
                            const userParamValue = currentPartValue.slice(sepIndex + 1)
                            patchedDocumentInfo = { ...documentInfo, parsedInfo: { ...documentInfo.parsedInfo, currentPartValue: userParamValue } }
                            return [userParamName, userParamValue] as const
                        }) || (completingParamValue ? [completingParamValue.paramName, completingParamValue.currentEnteredValue] : undefined)

                    if (currentOptionValue) {
                        const completingOption = options.find(specOption => ensureArray(specOption.name).includes(currentOptionValue[0]))
                        if (completingOption) {
                            const { args } = completingOption
                            if (args) {
                                if (Array.isArray(args)) return
                                collectedCompletions.push(...(figArgToCompletions(args, patchedDocumentInfo) ?? []))
                            }
                        }
                    }

                    collectedCompletions.push(...specOptionsToVscodeCompletions(subcommand, patchedDocumentInfo))
                }

                return {
                    items: collectedCompletions,
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
                if (!specOptions) return
                const completingOption = specOptions.find(specOption => ensureArray(specOption.name).includes(completingParamValue.paramName))
                if (!completingOption) return
                const { args } = completingOption
                if (!args || Array.isArray(args)) return
                let hint = args.description ?? args.name ?? 'argument'
                if (args.isOptional) hint += '?'
                if (args.default) hint += ` (${args.default})`
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

// todo
const getCurrentCommand = () => {}

// commands

// extremely useful for giving a link to a friend, like hey I was right about the options!
const openInSheelHow = (skipOpening = false) => {
    const { activeTextEditor } = window
    if (!activeTextEditor) return
    const { document, selection } = activeTextEditor
    let scriptToOpen = selection.start.isEqual(selection.end) ? getCurrentCommand() : document.getText(selection)
}
