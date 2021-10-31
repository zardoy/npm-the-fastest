import { builtinModules } from 'module'
import vscode from 'vscode'
import { getExtensionCommandId, getExtensionId, registerExtensionCommand } from 'vscode-framework'
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
        if (typeof repository !== 'string' || !repository.startsWith('http')) throw new Error(`Unsupported ${repository}`)
        await vscode.env.openExternal(vscode.Uri.parse(repository))
    })

    vscode.languages.registerCodeActionsProvider(
        { language: 'typescript', scheme: 'file' },
        {
            async provideCodeActions(document, range, { triggerKind }, token) {
                if (triggerKind === vscode.CodeActionTriggerKind.Automatic) return
                // TODO also check end
                const pos = range.start
                const lineText = document.lineAt(pos.line).text
                console.log('requested', lineText)
                // fast
                const result = /import .* from (['"].*['"])/.exec(lineText)
                if (!result) return
                const moduleName = result[1]!.slice(1, -1)
                if (builtinModules.includes(moduleName)) return
                if (pos.character < lineText.length - moduleName.length + 2) return
                const codeActions: vscode.CodeAction[] = []
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
        { language: 'typescript', scheme: 'file' },
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
