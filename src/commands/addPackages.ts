import { throttle } from 'lodash'
import vscode from 'vscode'
import { extensionCtx } from 'vscode-framework'
import { performInstallAction } from '../commands-core/addPackages'
import { getCurrentWorkspaceRoot } from '../commands-core/util'
import { NpmSearchResult, performAlgoliaSearch } from '../core/npmSearch'
import { throwIfNowPackageJson } from '../commands-core/packageJson'

export const installPackages = async (location: 'closest' | 'workspace') => {
    // in pm-workspaces: select workspace, root at bottom, : to freeChoice
    // otherwise: freeChoice
    const currentWorkspaceRoot = getCurrentWorkspaceRoot()
    await throwIfNowPackageJson(currentWorkspaceRoot.uri, true)
    type ItemType = vscode.QuickPickItem & {
        itemType?: 'install-action' | 'selectedToInstall'
    }

    const quickPick = vscode.window.createQuickPick<ItemType>()
    const openPackageJsonButton = {
        iconPath: {
            dark: vscode.Uri.file(extensionCtx.asAbsolutePath('./assets/dark/go-to-file.svg')),
            light: vscode.Uri.file(extensionCtx.asAbsolutePath('./assets/light/go-to-file.svg')),
        },
        tooltip: 'Open package.json',
    }
    quickPick.buttons = [openPackageJsonButton]
    quickPick.title = 'Add packages to the project'
    quickPick.matchOnDescription = true
    quickPick.onDidTriggerButton(button => {
        if (button === openPackageJsonButton) {
            // TODO! handle action
        }
    })

    const selectedPackages: ItemType[] = []
    /** Force use cache as got and algoliasearch don't cache */
    const internalCache = new Map<string, { date: number; data: NpmSearchResult }>() // query-results

    // TODO tab expansion on `

    /** false when no search query */
    const setItems = (searchItems: vscode.QuickPickItem[] | false) => {
        if (searchItems) quickPick.items = searchItems
        else if (selectedPackages.length === 0) quickPick.items = []
        else
            quickPick.items = [
                { label: `Install ${selectedPackages.length} packages`, description: selectedPackages.join(', '), itemType: 'install-action' },
                ...selectedPackages.map(item => ({ ...item, alwaysShow: true })),
            ]
    }

    const throttledSearch = throttle(async (search: string) => {
        const results = await (async () => {
            const cached = internalCache.get(search)
            if (cached) {
                if (Date.now() - cached.date < 1000 * 60 * 60 * 24 * 2) {
                    console.log('used cached data')
                    return cached.data
                }

                internalCache.delete(search)
            }

            console.time('fetch packages list')
            const results = await performAlgoliaSearch(search)
            console.timeEnd('fetch packages list')
            internalCache.set(search, { data: results, date: Date.now() })
            return results
        })()
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
        setItems(false)
        if (search.length < 3) return
        quickPick.busy = true
        await throttledSearch(search)
    })
    quickPick.onDidAccept(async () => {
        const activeItem = quickPick.activeItems[0]
        if (!activeItem) return
        quickPick.value = ''
        if (activeItem.itemType === 'install-action') {
            // TODO! workspaces
            quickPick.hide()
            await performInstallAction(
                currentWorkspaceRoot.uri.fsPath,
                selectedPackages.map(({ label }) => label),
            )
            return
        }

        if (activeItem.itemType === 'selectedToInstall') selectedPackages.splice(selectedPackages.indexOf(activeItem), 1)
        else selectedPackages.unshift({ ...activeItem, itemType: 'selectedToInstall' })

        setItems(false)
    })

    quickPick.onDidHide(quickPick.dispose)
    quickPick.show()
}
