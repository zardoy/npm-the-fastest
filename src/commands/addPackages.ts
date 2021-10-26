import { throttle } from 'lodash'
import vscode from 'vscode'
import { performInstallAction } from '../commands-core/installPackages'
import { getCurrentWorkspaceRoot } from '../commands-core/core'
import { NpmSearchResult, performAlgoliaSearch } from '../core/npmSearch'
import { throwIfNowPackageJson } from '../commands-core/packageJson'

export const installPackages = async (location: 'closest' | 'workspace') => {
    // in pm-workspaces: select workspace, root at bottom, : to freeChoice
    // otherwise: freeChoice
    const currentWorkspaceRoot = getCurrentWorkspaceRoot()
    await throwIfNowPackageJson(currentWorkspaceRoot.uri, true)
    const quickPick = vscode.window.createQuickPick()
    // quickPick.buttons = []
    quickPick.title = 'Add packages to the project'
    quickPick.matchOnDescription = true

    const selectedPackages: vscode.QuickPickItem[] = []
    /** Force use cache as got and algoliasearch don't cache */
    const internalCache = new Map<string, { date: number; data: NpmSearchResult }>() // query-results
    // TODO!
    let currentRequestSignal: AbortSignal | undefined
    const acceptInstallItem = { installAction: true }

    // TODO tab expansion on `

    /** false when no search query */
    const setItems = (searchItems: vscode.QuickPickItem[] | false) => {
        if (searchItems) quickPick.items = searchItems
        else if (selectedPackages.length === 0) quickPick.items = []
        else
            quickPick.items = [
                { label: `Install ${selectedPackages.length} packages`, description: selectedPackages.join(', '), ...acceptInstallItem },
                ...selectedPackages.map(item => ({ ...item, alwaysShow: true })),
            ]
    }

    const throttledSearch = throttle(async (search: string) => {
        console.time('fetch packages list')
        const results = await (async () => {
            const cached = internalCache.get(search)
            if (cached) {
                if (Date.now() - cached.date > 1000 * 60 * 60 * 24 * 2) return cached.data

                internalCache.delete(search)
            }

            const results = await performAlgoliaSearch(search)
            internalCache.set(search, { data: results, date: Date.now() })
            return results
        })()
        console.timeEnd('fetch packages list')
        quickPick.busy = false
        setItems(
            results.map(({ name, owner, version, description, bin, humanDownloadsLast30Days, types }) => {
                let detail = `v${version}`

                if (humanDownloadsLast30Days !== undefined) detail += ` $(extensions-install-count) ${humanDownloadsLast30Days}`

                const commands = Object.keys(bin ?? {})
                if (commands.length > 0) detail += ` $(terminal) ${commands.join(', ')}`

                if (types !== undefined) detail += ` $(symbol-type-parameter) ${types === false ? 'No' : types === 'definitely-typed' ? '@types' : types}`

                if (owner) detail += ` $(account) ${owner}`

                return {
                    label: name,
                    detail,
                    description,
                    alwaysShow: true,
                }
            }),
        )
    }, 200)
    quickPick.onDidChangeValue(async search => {
        if (search.endsWith('`')) {
            quickPick.value = quickPick.selectedItems[0]!.label
            return
        }

        setItems(false)
        if (search.length < 3) return
        quickPick.busy = true
        await throttledSearch(search)
    })
    quickPick.onDidAccept(async () => {
        // quickPick.value = ''
        const activeItem = quickPick.selectedItems[0]!
        if ((activeItem as unknown as typeof acceptInstallItem).installAction) {
            // TODO! workspaces
            await performInstallAction(
                currentWorkspaceRoot.uri.fsPath,
                selectedPackages.map(({ label }) => label),
            )
            quickPick.hide()
        } else if (activeItem.alwaysShow) {
            selectedPackages.splice(selectedPackages.indexOf(activeItem), 1)
            setItems(false)
        } else {
            selectedPackages.unshift({ ...activeItem })
        }
    })

    quickPick.onDidHide(quickPick.dispose)
    quickPick.show()
}
