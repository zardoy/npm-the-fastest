import { throttle } from 'lodash'
import vscode from 'vscode'
import { NpmSearchResult, performAlgoliaSearch } from '../core/npmSearch'

export const installPackages = (location: 'closest' | 'workspace') => {
    const quickPick = vscode.window.createQuickPick()
    // quickPick.buttons = []
    quickPick.title = 'Add packages to the project'
    let selectedPackages: vscode.QuickPickItem[] = []
    /** Force using cache as got and algoliasearch won't cache */
    const internalCache = new Map<string, { date: number; data: NpmSearchResult }>() // query-results
    // TODO!
    let currentRequestSignal: AbortSignal | undefined

    // TODO tab expansion
    const throttledSearch = throttle(
        async (search: string) => {
            console.time('request')
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
            console.timeEnd('request')
            quickPick.busy = false
            quickPick.items = results.map(({ name, owner, version, description, bin, humanDownloadsLast30Days, types }) => {
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
            })
        },
        200,
        { leading: false },
    )
    quickPick.matchOnDescription = true
    quickPick.onDidAccept(() => {
        console.log('accpet')
        quickPick.value = ''
        const activeItem = quickPick.selectedItems[0]!
        if (activeItem.alwaysShow) {
            selectedPackages = selectedPackages.filter(item => item !== activeItem)
            quickPick.items = selectedPackages
        } else {
            selectedPackages.unshift({ ...activeItem })
        }
        if (selectedPackages.length > 0)
    })
    quickPick.onDidChangeValue(async search => {
        quickPick.items = selectedPackages
        if (search.length < 3) return
        quickPick.busy = true
        return throttledSearch(search)
    })
    quickPick.onDidHide(quickPick.dispose)
    quickPick.show()
}
