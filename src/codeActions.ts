import { builtinModules } from 'module'
import vscode from 'vscode'
import { getExtensionCommandId, getExtensionSetting, getExtensionSettingId } from 'vscode-framework'
import { readPackageJsonWithMetadata } from './commands-core/packageJson'
import { AddPackagesArg } from './commands/addPackages'

const regexs = [/ from (['"].*['"])/, /import\((['"].*['"])\)/, /require(?:\.resolve)?\((['"].*['"])\)/]

const cdnLikeSitesPatterns = ['https://cdn.skypack.dev/', 'https://cdn.jsdelivr.net/npm/']

export const registerCodeActions = () => {
    // TODo refactor with helper
    const registerCodeActionsInner = () =>
        vscode.languages.registerCodeActionsProvider(
            getExtensionSetting('codeActions.enableLanguages').map(language => ({ language, scheme: 'file' })),
            {
                // eslint-disable-next-line complexity
                async provideCodeActions(document, range, { diagnostics }) {
                    const problem = diagnostics[0]
                    const hasMissingImport = problem && problem.source === 'ts' && problem.code === 2307
                    const hasMissingTypes = problem && problem.source === 'ts' && problem.code === 7016
                    let moduleName: string | undefined
                    for (const regex of regexs) {
                        const regexRange = document.getWordRangeAtPosition(range.start, regex)
                        if (!regexRange || range.end.isAfter(regexRange.end)) continue
                        const result = regex.exec(document.getText(regexRange))!
                        moduleName = getModuleName(result[1]!.slice(1, -1))
                        break
                    }

                    if (!moduleName) return
                    if (builtinModules.includes(moduleName) || moduleName.startsWith('./')) return

                    const codeActions: vscode.CodeAction[] = [
                        {
                            title: 'Open on NPM',
                            command: {
                                command: getExtensionCommandId('openOnNpm'),
                                title: '',
                                arguments: [moduleName],
                            },
                            kind: vscode.CodeActionKind.Empty,
                        },
                    ]
                    if (!hasMissingImport) {
                        const { packageJson = {} } = await readPackageJsonWithMetadata({ type: 'closest' }).catch(() => ({} as never))
                        let foundType: string | undefined
                        for (const depType of ['dependencies', 'devDependencies', 'optionalDependencies'])
                            if (moduleName in packageJson[depType] ?? {}) {
                                foundType = depType
                                break
                            }

                        // TODO-low check for existence
                        codeActions.unshift(
                            {
                                title: 'Open README to side',
                                command: {
                                    command: getExtensionCommandId('openPackageReadmePreview'),
                                    title: '',
                                    arguments: [moduleName],
                                },
                                kind: vscode.CodeActionKind.Empty,
                            },
                            {
                                title: 'Open Repository',
                                command: {
                                    command: getExtensionCommandId('openPackageRepository'),
                                    title: '',
                                    arguments: [moduleName],
                                },
                                kind: vscode.CodeActionKind.Empty,
                            },
                        )
                        codeActions.push({
                            // todo use multiple find up packageJson and disable this code action if not found
                            title: `Remove ${foundType ? `from ${foundType}` : 'module'}`,
                            command: {
                                command: getExtensionCommandId('removePackages'),
                                title: '',
                                arguments: [[moduleName]],
                            },
                            kind: vscode.CodeActionKind.Empty,
                        })
                    }

                    if (hasMissingImport || hasMissingTypes) {
                        const addModuleFix = (module: string, type: 'dependency' | 'devDependency', isPreferred = true) => {
                            const codeAction = new vscode.CodeAction(`Add ${module} as ${type}`, vscode.CodeActionKind.QuickFix)
                            const arg: AddPackagesArg = {
                                [type === 'devDependency' ? 'devPackages' : 'packages']: [module],
                            }
                            codeAction.command = { command: getExtensionCommandId('addPackages'), title: '', arguments: [arg] }
                            codeAction.isPreferred = isPreferred
                            codeAction.diagnostics = [problem]
                            codeActions.push(codeAction)
                        }

                        if (hasMissingTypes) {
                            addModuleFix(`@types/${moduleName}`, 'devDependency')
                        } else {
                            // TODO! fetch them
                            const { packageJson } = await readPackageJsonWithMetadata({ type: 'closest', fallback: true })
                            const allDeps = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })
                            if (allDeps.includes(`@types/${moduleName}`)) return []
                            if (Object.keys(packageJson.dependencies || {}).includes(moduleName)) {
                                // TODO remove that!
                                addModuleFix(`@types/${moduleName}`, 'devDependency')
                            } else {
                                addModuleFix(moduleName, 'dependency')
                                addModuleFix(moduleName, 'devDependency')
                            }
                        }
                    }

                    return codeActions
                },
            },
            {
                // documentation
            },
        )

    let disposable = registerCodeActionsInner()

    vscode.workspace.onDidChangeConfiguration(({ affectsConfiguration }) => {
        if (affectsConfiguration(getExtensionSettingId('codeActions.enableLanguages'))) {
            disposable.dispose()
            disposable = registerCodeActionsInner()
        }
    })
}

const getModuleName = (importPath: string) => {
    if (importPath.startsWith('http'))
        for (const cdnLikeSitesPattern of cdnLikeSitesPatterns)
            if (importPath.startsWith(cdnLikeSitesPattern)) {
                importPath = importPath.slice(cdnLikeSitesPattern.length, findStringIndex(importPath, '/', cdnLikeSitesPattern.length))
                break
            }

    return /^(@[a-z\d-~][a-z\d-._~]*\/)?[a-z\d-~][a-z\d-._~]*/.exec(importPath)?.[0]
}

const findStringIndex = (str: string, needle: string, offset = 0) => {
    const idx = str.indexOf(needle, offset)
    return idx === -1 ? undefined : idx
}
