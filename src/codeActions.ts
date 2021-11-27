import { builtinModules } from 'module'
import vscode from 'vscode'
import { getExtensionCommandId, getExtensionId, registerExtensionCommand } from 'vscode-framework'
import { fromUrl } from 'hosted-git-info'
import { findUpNodeModules, readDirPackageJson, readPackageJsonWithMetadata } from './commands-core/packageJson'

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
        const { repository } = await readDirPackageJson(cwd)
        // TODO use lib from vsce
        // TODO support just url
        if (typeof repository !== 'string') throw new Error(`Unsupported ${repository}`)
        await vscode.env.openExternal(vscode.Uri.parse(fromUrl(repository)!.browse()))
    })

    for (const language of ['typescript', 'typescriptreact', 'javascript', 'javascriptreact']) {
        vscode.languages.registerCodeActionsProvider(
            { language, scheme: 'file' },
            {
                async provideCodeActions(document, range, { triggerKind }, token) {
                    if (triggerKind === vscode.CodeActionTriggerKind.Automatic) return
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
                    }

                    if (!moduleName) return
                    const result = /(import .*)(['"].*['"])|((} from )(['"].*['"]))/.exec(lineText)
                    if (!result) return

                    // TODO also detect remaps (paths) from tsconfig.json
                    console.log('okay', moduleName)
                    if (builtinModules.includes(moduleName) || moduleName.startsWith('./')) return
                    if (pos.character < moduleNameIndex!) return
                    moduleName = moduleName.slice(1, -1)
                    const codeActions: vscode.CodeAction[] = []
                    // TODO check for existence
                    codeActions.push(
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
                    )
                    return codeActions
                    // vscode.window.showTextDocument(document)
                },
            },
            {
                // documentation
            },
        )
        vscode.languages.registerCodeActionsProvider(
            { language, scheme: 'file' },
            {
                async provideCodeActions(document, range, context, token) {
                    const { diagnostics } = context
                    const codeActions: vscode.CodeAction[] = []
                    const problem = diagnostics[0]
                    if (!problem || problem.source !== 'ts') return
                    console.log('inspect', diagnostics)
                    const addTypesFix = (module: string, isPreferred = true) => {
                        const constFix = new vscode.CodeAction(`Add @types/${module} as devDependency`, vscode.CodeActionKind.QuickFix)
                        constFix.command = { command: `${getExtensionId()}.installPackages`, title: '', arguments: [{ packages: [`@types/${module}`] }] }
                        constFix.isPreferred = isPreferred
                        constFix.diagnostics = [problem]
                        codeActions.push(constFix)
                    }

                    const addModuleFix = (module: string, type: 'dependency' | 'devDependency', isPreferred = true) => {
                        const constFix = new vscode.CodeAction(`Add ${module} as ${type}`, vscode.CodeActionKind.QuickFix)
                        // TODO! dev enablement
                        constFix.command = { command: `${getExtensionId()}.installPackages`, title: '', arguments: [{ packages: [module] }] }
                        constFix.isPreferred = isPreferred
                        constFix.diagnostics = [problem]
                        codeActions.push(constFix)
                    }

                    if (problem.code === 2307) {
                        const module = /'(.+)'\.$/.exec(problem.message)?.[1]
                        if (!module) {
                            console.warn("Can't extract name", problem)
                            return
                        }

                        if (module.startsWith('./')) return
                        // TODO! fetch them
                        const { packageJson } = await readPackageJsonWithMetadata({ type: 'closest', fallback: true })
                        const allDeps = Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies })
                        if (allDeps.includes(`@types/${module}`)) return []
                        if (Object.keys(packageJson.dependencies || {}).includes(module)) {
                            addTypesFix(module)
                        } else {
                            addModuleFix(module, 'dependency')
                            addModuleFix(module, 'devDependency')
                        }
                    }

                    return codeActions
                },
            },
        )
    }
}
