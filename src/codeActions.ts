import { builtinModules } from 'module'
import vscode from 'vscode'
import { getExtensionCommandId, getExtensionId, getExtensionSetting, registerExtensionCommand } from 'vscode-framework'
import { fromUrl } from 'hosted-git-info'
import defaultBranch from 'default-branch'
import { findUpNodeModules, readDirPackageJson, readPackageJsonWithMetadata } from './commands-core/packageJson'
import { AddPackagesArg } from './commands/addPackages'

/** get module dir URI from closest node_modules */
const getClosestModulePath = async (module: string, path = '') => {
    const currentDirUri = vscode.Uri.joinPath(vscode.window.activeTextEditor!.document.uri, '..')
    const nodeModulesPath = await findUpNodeModules(currentDirUri)
    return vscode.Uri.joinPath(nodeModulesPath, 'node_modules', module, path)
}

export const registerCodeActions = () => {
    registerExtensionCommand('openPackageReadmePreview', async (_, module: string) => {
        const readmeUri = await getClosestModulePath(module, 'README.MD')
        await vscode.commands.executeCommand('markdown.showPreviewToSide', readmeUri)
    })

    registerExtensionCommand('openPackageRepository', async (_, module: string) => {
        const cwd = await getClosestModulePath(module)
        let { repository } = await readDirPackageJson(cwd)
        if (!repository) {
            // TODO try to resolve url automatically
            const action = await vscode.window.showWarningMessage(`${module} doesn't have repository field`, 'Open on NPM')
            if (action === 'Open on NPM') await vscode.commands.executeCommand(getExtensionCommandId('openOnNpm'), module)
            return
        }

        // TODO use lib from vsce
        // TODO support just url
        let repoDir: string | undefined
        if (typeof repository === 'object') {
            repoDir = repository.directory
            repository = repository.url
        }

        const repo = fromUrl(repository)!
        let urlPath = ''
        if (repo.domain === 'github.com' && repoDir) {
            let branchName
            if (getExtensionSetting('codeAction.resolveBranchName')) {
                console.time('get branch')
                branchName = await defaultBranch(`${repo.user}/${repo.project}`)
                console.timeEnd('get branch')
            } else {
                branchName = 'master'
            }

            urlPath = `/tree/${branchName}/${repoDir}`
        }

        await vscode.env.openExternal((repo.browse() + urlPath) as any)
    })

    registerExtensionCommand('openOnNpm', async (_, module: string) => {
        await vscode.env.openExternal(`https://npmjs.com/package/${module}` as any)
    })

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
                            arguments: [moduleName],
                        },
                        kind: vscode.CodeActionKind.Empty,
                    },
                )

                if (hasMissingImport || hasMissingTypes) {
                    const addModuleFix = (module: string, type: 'dependency' | 'devDependency', isPreferred = true) => {
                        const codeAction = new vscode.CodeAction(`Add ${module} as ${type}`, vscode.CodeActionKind.QuickFix)
                        const arg: AddPackagesArg = {
                            [type === 'devDependency' ? 'packages' : 'devPackages']: [module],
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
