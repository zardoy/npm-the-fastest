/// <reference types="@withfig/autocomplete-types/index" />
import nodeSpec from '@withfig/autocomplete/build/node'
import gitSpec from '@withfig/autocomplete/build/git'
import yarnSpec from '@withfig/autocomplete/build/yarn'
import esbuildSpec from '@withfig/autocomplete/build/esbuild'
import webpackSpec from '@withfig/autocomplete/build/webpack'
import picomatch from 'picomatch/posix'
import {
    commands,
    CompletionItem,
    CompletionItemKind,
    CompletionItemLabel,
    CompletionItemTag,
    FileType,
    languages,
    MarkdownString,
    Position,
    Range,
    SnippetString,
    Uri,
    window,
    workspace,
} from 'vscode'
import { niceLookingCompletion } from '@zardoy/vscode-utils/build/completions'
import { compact, ensureArray, findCustomArray } from '@zardoy/utils'
import { parse } from './shell-quote-patched'
import _ from 'lodash'

const getFigSubcommand = (__spec: Fig.Spec) => {
    const _spec = typeof __spec === 'function' ? __spec() : __spec
    const spec = 'versionedSpecPath' in _spec ? undefined! : _spec
    return spec
}

const ALL_LOADED_SPECS = [
    gitSpec,
    nodeSpec,
    yarnSpec,
    webpackSpec,
    esbuildSpec,
    // todo
].map(value => getFigSubcommand(value)!)

// class CompletionItem extends CompletionItemRaw {}

// todo remove all icons from the bundle
// todo remove temp for all, introduce placeholders
const niceIconMap = {
    esbuild: 'esbuild.js',
}

const stableIconMap = {
    'fig://icon?type=yarn': 'yarn.lock',
    'fig://icon?type=npm': 'package.json',
}

const globalSettings = {
    insertOnCompletionAccept: 'space' as 'space' | 'disabled',
}

// todo resolve sorting!
type DocumentInfo = {
    // used for providing correct editing range
    realPosition: Position
    specName: string
    partsToPos: [isOption: boolean, contents: string][]
    currentPartValue: string | undefined
    /** all command options except currently completing */
    usedOptions: UsedOption[]
    parsedInfo: {
        args: string[]
        currentlyCompletingArgIndex: number | undefined
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

// type UsedOption = { name: string }
type UsedOption = string

// todo hide commands
const parseOptionToCompletion = (option: Fig.Option, info: DocumentInfo): CompletionItem | undefined => {
    let { isRequired, isRepeatable = false, requiresSeparator: seperator = false, dependsOn, exclusiveOn } = option

    if (seperator === true) seperator = '='
    if (seperator === false) seperator = ''

    const usedOptionsNames = info.usedOptions
    const currentOptionsArr = ensureArray(option.name)

    const optionUsedCount = usedOptionsNames.filter(name => currentOptionsArr.includes(name)).length
    if (isRepeatable === false && optionUsedCount > 0) return
    if (typeof isRepeatable === 'number' && optionUsedCount >= isRepeatable) return

    if (dependsOn && !dependsOn.every(name => usedOptionsNames.includes(name))) return
    if (exclusiveOn?.some(name => usedOptionsNames.includes(name))) return

    const optionsRender = currentOptionsArr.join(' ')
    const completion = figBaseSuggestionToVscodeCompletion(option, optionsRender, { ...info, sortTextPrepend: 'd' })
    ;(completion.label as CompletionItemLabel).detail = isRequired ? 'REQUIRED' : getArgPreviewFromOption(option)

    const typedOption = info.currentPartValue ?? ''
    const insertOption = Array.isArray(option.name)
        ? // option.name /* filter gracefully */
          //       .map(name => [name, name.indexOf(typedOption)] as const)
          //       .sort((a, b) => a[1] - b[1])
          //       .filter(([, index]) => index !== -1)?.[0]?.[0] || option.name[0]
          option.name.find(name => name.toLowerCase().includes(typedOption.toLowerCase())) || option.name[0]
        : option.name
    const defaultInsertText = insertOption + seperator + (seperator.length !== 1 && globalSettings.insertOnCompletionAccept === 'space' ? ' ' : '')
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

// todo review options mb add them to base
type DocumentInfoForCompl = Pick<DocumentInfo, 'currentPartValue' | 'realPosition'> & { kind?: CompletionItemKind; sortTextPrepend?: string; specName?: string }

// todo
const figBaseSuggestionToVscodeCompletion = (
    baseCompetion: Fig.BaseSuggestion,
    initialName: string,
    { currentPartValue, kind, sortTextPrepend = '', realPosition, specName }: DocumentInfoForCompl & { sortTextPrepend: string },
): CompletionItem => {
    const {
        displayName,
        insertValue,
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
    // lets be sure its consistent
    completion.sortText = sortTextPrepend + priority.toString().padStart(3, '0')
    if (kind) completion.kind = kind
    if (deprecated) completion.tags = [CompletionItemTag.Deprecated]
    if (hidden && currentPartValue !== initialName) completion.filterText = ''
    if (currentPartValue) completion.range = new Range(realPosition.translate(0, -currentPartValue.length), realPosition)

    if (specName && kind === undefined) {
        const niceLookingIcon = niceIconMap[specName]
        if (niceLookingIcon) Object.assign(completion, niceLookingCompletion(niceLookingIcon))
    }
    if (icon) {
        const mappedIcon = stableIconMap[icon]
        if (mappedIcon) Object.assign(completion, niceLookingCompletion(mappedIcon))
    }

    return completion
}

const getCwdUri = () => {
    // todo (easy) parse cd commands
    const allowSchemes = ['file', 'vscode-vfs']
    const { activeTextEditor } = window
    if (!activeTextEditor) return
    const {
        document: { uri },
    } = activeTextEditor
    if (allowSchemes.includes(uri.scheme)) return Uri.joinPath(uri, '..')
    const firstWorkspace = workspace.workspaceFolders?.[0]
    return firstWorkspace?.uri
}

// todo to options, introduce flattened lvl
const listFilesCompletions = async (cwd: Uri, stringContents: string, completionPos: Position, globFilter?: string, includeType?: FileType) => {
    const folderPath = stringContents.split('/').slice(0, -1).join('/')
    const pathLastPart = stringContents.split('/').pop()!
    const filesList = await workspace.fs.readDirectory(Uri.joinPath(cwd, folderPath))
    const isMatch = globFilter && picomatch(globFilter)
    // todo insertText
    return filesList
        .map(([name, type]): CompletionItem => {
            if ((includeType && !(type & includeType)) || (isMatch && !isMatch(name))) return undefined!
            const isDir = type & FileType.Directory
            return {
                label: isDir ? `${name}/` : name,
                kind: !isDir ? CompletionItemKind.File : CompletionItemKind.Folder,
                detail: name,
                // sort bind
                sortText: `a${isDir ? 1 : 2}`,
                command: isDir
                    ? {
                          command: 'editor.action.triggerSuggest',
                          title: '',
                      }
                    : undefined,
                range: new Range(completionPos.translate(0, -pathLastPart.length), completionPos),
            }
        })
        .filter(Boolean)
}

const templateToVscodeCompletion = async (_template: Fig.Template, info: DocumentInfo) => {
    const templates = ensureArray(_template)
    const completions: CompletionItem[] = []
    let includeFilesKindType: FileType | true | undefined
    if (templates.includes('folders')) includeFilesKindType = FileType.Directory
    if (templates.includes('filepaths')) includeFilesKindType = true
    // todo
    const includeHelp = templates.includes('help')
    if (includeFilesKindType) {
        const cwd = getCwdUri()
        if (cwd)
            completions.push(
                ...(await listFilesCompletions(
                    cwd,
                    info.currentPartValue ?? '',
                    info.realPosition,
                    // undefined,
                    // includeFilesKindType === true ? undefined : includeFilesKindType,
                )),
            )
    }
    return completions
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
    const partsToPos = commandParts.slice(1, currentPartIndex).map(([contents]) => [contents.startsWith('-'), contents] as [boolean, string])
    return {
        realPosition: position,
        specName,
        partsToPos,
        currentPartValue,
        usedOptions: commandParts.filter(([content], index) => content.startsWith('-') && index !== currentPartIndex).map(([content]) => content),
        parsedInfo: {
            currentlyCompletingArgIndex: !currentPartIsOption ? currentPartIndex : undefined,
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
    const spec = ALL_LOADED_SPECS.find(({ name }) => ensureArray(name).includes(specName))
    return spec
}

// current sorting:
// - a option arg suggestions
// - b just args
// - c subcommands
// - d options

const figSuggestionToCompletion = (suggestion: string | Fig.Suggestion, documentInfo: DocumentInfoForCompl) => {
    if (typeof suggestion === 'string')
        suggestion = {
            name: suggestion,
        }
    const completion = figBaseSuggestionToVscodeCompletion(suggestion, ensureArray(suggestion.name)[0]!, {
        kind: CompletionItemKind.Constant,
        sortTextPrepend: 'a',
        ...documentInfo,
    })
    return completion
}

const figArgToCompletions = async (arg: Fig.Arg, documentInfo: DocumentInfo) => {
    const completions: CompletionItem[] = []
    // todo optionsCanBreakVariadicArg suggestCurrentToken
    const { suggestions, template, default: defaultValue, generators } = arg
    // todo expect all props, handle type
    if (suggestions) completions.push(...suggestions.map((suggestion): CompletionItem => figSuggestionToCompletion(suggestion, documentInfo)))
    if (template) completions.push(...(await templateToVscodeCompletion(template, documentInfo)))
    if (generators) {
        for (const { template, filterTemplateSuggestions } of ensureArray(generators)) {
            // todo
            if (!template) continue
            let suggestions = await templateToVscodeCompletion(template, documentInfo)
            if (filterTemplateSuggestions)
                suggestions = filterTemplateSuggestions(
                    suggestions.map(suggestion => ({
                        ...suggestion,
                        name: suggestion.label as string,
                        context: { templateType: 'filepaths' },
                    })),
                ) as any
            console.log(suggestions)
            completions.push(...suggestions)
        }
    }
    if (defaultValue) {
        for (const completion of completions) {
            if (typeof completion.label !== 'object') continue
            // todo comp name?
            if (completion.label.label === defaultValue) completion.label.description = 'DEFAULT'
        }
    }
    return completions
}

const figSubcommandsToVscodeCompletions = (subcommands: Fig.Subcommand[], info: DocumentInfo): CompletionItem[] | undefined => {
    const { currentPartValue = '' } = info
    return subcommands.map(subcommand => {
        const nameArr = ensureArray(subcommand.name)
        const completion = figBaseSuggestionToVscodeCompletion(
            subcommand,
            nameArr.find(name => name.toLowerCase().includes(currentPartValue.toLowerCase())) ?? nameArr[0],
            {
                ...info,
                kind: CompletionItemKind.Module,
                sortTextPrepend: 'c',
            },
        )
        let insertSpace = subcommand.requiresSubcommand /*  && globalSettings.insertOnCompletionAccept === 'space' */
        if (!insertSpace) {
            // todo is that right?
            if (subcommand.subcommands) insertSpace = true
            for (const arg of ensureArray(subcommand.args ?? [])) {
                if (arg.isOptional) continue
                insertSpace = true
                break
            }
        }
        if (completion.insertText === undefined && insertSpace) completion.insertText = (completion.label as CompletionItemLabel).label + ' '
        return completion
    })
}

const getRootSpecCompletions = (info: Omit<DocumentInfoForCompl, 'sortTextPrepend'>, includeOnlyList?: string[]) => {
    // todo root loadSpec, filterGracefully, requiresSubcommand
    return Object.values(ALL_LOADED_SPECS)
        .map(specCommand => {
            // todo
            if (Array.isArray(specCommand.name)) return undefined!
            if (includeOnlyList && !includeOnlyList.includes(specCommand.name)) return undefined!
            const completion = figBaseSuggestionToVscodeCompletion(specCommand, specCommand.name, { ...info, sortTextPrepend: '' })
            Object.assign(completion, niceLookingCompletion('.sh'))
            return completion
        })
        .filter(Boolean)
}

const APPLY_SUGGESTION_COMPLETION = '_applyFigSuggestion'

declare const trackDisposable

trackDisposable(
    commands.registerCommand(APPLY_SUGGESTION_COMPLETION, () => {
        commands.executeCommand('editor.action.triggerSuggest')
        commands.executeCommand('editor.action.triggerParameterHints')
    }),
)

// todo git config
trackDisposable(
    languages.registerCompletionItemProvider(
        'bat',
        {
            async provideCompletionItems(document, position, token, context) {
                const documentInfo = getDocumentParsedResult(document.lineAt(position).text.slice(0, position.character), position)
                // todo?
                if (!documentInfo) return getRootSpecCompletions({ realPosition: position, currentPartValue: undefined })
                const spec = getCompletingSpec(documentInfo.specName)
                if (!spec) return
                const figRootSubcommand = getFigSubcommand(spec)

                const { partsToPos, currentPartValue = '' } = documentInfo
                const { completingOptionValue: completingParamValue, currentlyCompletingArgIndex } = documentInfo.parsedInfo
                let goingToSuggest = {
                    options: true,
                    subcommands: true,
                }
                let subcommand = figRootSubcommand
                // todo r
                let argMetCount = 0
                // in linting all parts
                for (const [isOption, partContents] of partsToPos) {
                    if (isOption) {
                        // todo is that right?
                        if (partContents === '--') {
                            goingToSuggest.options = false
                            goingToSuggest.subcommands = false
                        }
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
                                // we failed to load unknown spec now its nothing
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
                            collectedCompletions.push(...((await figArgToCompletions(arg, documentInfo)) ?? []))
                        }
                    }
                    if (goingToSuggest.subcommands) {
                        const { subcommands, additionalSuggestions } = subcommand
                        collectedCompletions.push(...((subcommands && figSubcommandsToVscodeCompletions(subcommands, documentInfo)) ?? []))
                        if (additionalSuggestions)
                            collectedCompletions.push(
                                ...additionalSuggestions.map(suggest =>
                                    figSuggestionToCompletion(suggest, { ...documentInfo, kind: CompletionItemKind.Event, sortTextPrepend: 'c' }),
                                ),
                            )
                    }
                }

                const options = getNormalizedSpecOptions(subcommand)
                if (options) {
                    // todo maybe use sep-all optm?
                    let patchedDocumentInfo = documentInfo
                    // todo1 refactor to forof
                    // parserDirectives, esbuild args
                    const { usedOptions } = documentInfo
                    const currentOptionValue =
                        findCustomArray(options, ({ requiresSeparator, name }) => {
                            if (!requiresSeparator) return
                            const sep = requiresSeparator === true ? '=' : requiresSeparator
                            for (const option of usedOptions) {
                                const sepIndex = option.indexOf(sep)
                                if (sepIndex === -1) continue
                                usedOptions.push(option.slice(0, sepIndex))
                            }
                            const sepIndex = currentPartValue.indexOf(sep)
                            if (sepIndex === -1) return
                            const userParamName = currentPartValue.slice(0, sepIndex)
                            if (!ensureArray(name).includes(userParamName)) return
                            const userParamValue = currentPartValue.slice(sepIndex + 1)
                            patchedDocumentInfo = { ...documentInfo, currentPartValue: userParamValue }
                            return [userParamName, userParamValue] as const
                        }) || (completingParamValue ? [completingParamValue.paramName, completingParamValue.currentEnteredValue] : undefined)

                    patchedDocumentInfo = { ...patchedDocumentInfo, usedOptions }
                    if (currentOptionValue) {
                        const completingOption = options.find(specOption => ensureArray(specOption.name).includes(currentOptionValue[0]))
                        const { args } = completingOption ?? {}
                        if (args && !Array.isArray(args)) {
                            if (!args.isOptional) {
                                // make sure only arg completions are showed
                                // todo r
                                collectedCompletions.splice(0, collectedCompletions.length)
                                goingToSuggest.options = false
                            }
                            collectedCompletions.push(...((await figArgToCompletions(args, patchedDocumentInfo)) ?? []))
                        }
                    }

                    if (goingToSuggest.options) collectedCompletions.push(...specOptionsToVscodeCompletions(subcommand, patchedDocumentInfo))
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
        // file path
        '/',
        // file ext
        '.',
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

// COMMANDS

// extremely useful for giving a link to a friend, like hey I was right about the options!
const openInSheelHow = (skipOpening = false) => {
    const { activeTextEditor } = window
    if (!activeTextEditor) return
    const { document, selection } = activeTextEditor
    let scriptToOpen = selection.start.isEqual(selection.end) ? getCurrentCommand() : document.getText(selection)
}

// this is to allow some other extensions to contribute/extend their completions!
const api = {
    // todo
    extendCompletions(rootSubcommand: Fig.Subcommand) {},
}
