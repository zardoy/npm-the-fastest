import { builtinModules } from 'module'
import vscode from 'vscode'
import { getExtensionCommandId } from 'vscode-framework'
import { readPackageJsonWithMetadata } from './commands-core/packageJson'
import { AddPackagesArg } from './commands/addPackages'

export const registerCodeActions = () => {
    vscode.languages.registerCodeActionsProvider(
        ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].map(language => ({ language, scheme: 'file' })),
        {
            async provideCodeActions(document, range, { triggerKind, diagnostics }, token) {
                if (triggerKind === vscode.CodeActionTriggerKind.Automatic) return
                const problem = diagnostics[0]
                const hasMissingImport = problem && problem.source === 'ts' && problem.code === 2307
                const hasMissingTypes = problem && problem.source === 'ts' && problem.code === 7016
                // TODO also check end
                const pos = range.start
                const lineText = document.lineAt(pos.line).text
                // faster than ask TS lang server
                const regexs = [/(import .*)(['"].*['"])/, /(} from )(['"].*['"])/]
                let moduleNameIndex: number | undefined
                let moduleName: string | undefined
                for (const regex of regexs) {
                    const result = regex.exec(lineText)
                    moduleNameIndex = result?.[1]?.length
                    moduleName = result?.[2]
                    if (result) break
                }

                if (!moduleName) return

                // TODO also detect remaps (paths) from tsconfig.json
                moduleName = moduleName.slice(1, -1)
                if (builtinModules.includes(moduleName) || moduleName.startsWith('./')) return
                if (pos.character < moduleNameIndex!) {
                    console.log('pos')
                    return
                }

                const codeActions: vscode.CodeAction[] = []
                // TODO check for existence
                codeActions.push(
                    ...(hasMissingImport
                        ? []
                        : [
                              {
                                  title: 'Open README to side',
                                  command: {
                                      command: getExtensionCommandId('openPackageReadmePreview'),
                                      // TODO investigate on titles
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
                          ]),
                    {
                        title: 'Open on NPM',
                        command: {
                            command: getExtensionCommandId('openOnNpm'),
                            title: '',
                            arguments: [moduleName],
                        },
                        kind: vscode.CodeActionKind.Empty,
                    },
                    {
                        title: 'Remove with PNPM',
                        command: {
                            command: getExtensionCommandId('removePackages'),
                            title: '',
                            arguments: [[moduleName]],
                        },
                        kind: vscode.CodeActionKind.Empty,
                    },
                )

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
                // vscode.window.showTextDocument(document)
            },
        },
        {
            // documentation
        },
    )
}
