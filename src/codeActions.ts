import vscode from 'vscode'
import { getExtensionId } from 'vscode-framework'
import { readPackageJsonWithMetadata } from './commands-core/packageJson'

export const registerCodeActions = () => {
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
