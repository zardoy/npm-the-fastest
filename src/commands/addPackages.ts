import vscode from 'vscode'
import { partition } from 'rambda'
import { throttle } from 'lodash'
import { CommandHandler, extensionCtx, getExtensionSetting } from 'vscode-framework'
import isOnline from 'is-online'
import { PackageJson } from 'type-fest'
import { getCurrentWorkspaceRoot } from '@zardoy/vscode-utils/build/fs'
import { NpmSearchResult, performAlgoliaSearch } from '../core/npmSearch'
import { readPackageJsonWithMetadata, throwIfNowPackageJson } from '../commands-core/packageJson'
import { AlgoliaSearchResultItem } from '../core/algoliaSearchType'
import { packageManagerCommand } from '../commands-core/packageManager'

export type AddPackagesArg = {
    packages?: string[]
    devPackages?: string[]
    /** Use --offline flag for pnpm if there is no internet connection */
    // TODO ignored when passed without package args
    useOffline?: boolean
}

export const addPackagesCommand: CommandHandler = async (_, { devPackages, packages, useOffline = true }: AddPackagesArg = {}) => {
    if (devPackages === undefined && packages === undefined) {
        await installPackages('workspace')
        return
    }

    const useOffllineFlag = useOffline && !(await isOnline())
    for (const [pkgs, flags] of [
        [packages, ''],
        [devPackages, '-D'],
    ] as Array<[string[], string]>) {
        if (pkgs === undefined || pkgs.length === 0) continue
        await packageManagerCommand({
            command: 'add',
            cwd: getCurrentWorkspaceRoot().uri,
            packages: pkgs,
            flags: [...flags.split(' '), ...(useOffllineFlag ? ['--offline'] : [])],
        })
    }
}

export const installPackages = async (location: 'closest' | 'workspace') => {
    let isPickingDev = false
    // in pm-workspaces: select workspace, root at bottom, : to freeChoice
    // otherwise: freeChoice
    const currentWorkspaceRoot = getCurrentWorkspaceRoot()
    await throwIfNowPackageJson(currentWorkspaceRoot.uri, true)
    const { packageJson } = await readPackageJsonWithMetadata({ type: 'closest' })
    type ItemType = vscode.QuickPickItem & {
        itemType?: 'install-action' | 'selectedToInstall'
        types?: AlgoliaSearchResultItem['types']['ts']
        installType?: 'dev'
        repositoryUrl?: string
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
                // TODO label isn't stable (icon will be added), refactor to name
                {
                    label: `Install ${selectedPackages.length} packages`,
                    description: selectedPackages.map(({ label }) => label).join(', '),
                    itemType: 'install-action',
                },
                ...selectedPackages.map(item => ({
                    ...item,
                    description: item.installType === 'dev' ? `$(tools) ${item.description!}` : item.description,
                    alwaysShow: true,
                })),
            ]
    }

    let latestQuery = null as string | null

    type ButtonAction = 'dev' | 'npm' | 'repo'
    const throttledSearch = throttle(async (query: string) => {
        latestQuery = query
        const results = await (async () => {
            const cached = internalCache.get(query)
            if (cached) {
                if (Date.now() - cached.date < 1000 * 60 * 60 * 24 * 2) {
                    console.log('used cached data')
                    return cached.data
                }

                internalCache.delete(query)
            }

            console.log(`fetching ${query}`)
            console.time(`fetched ${query}`)
            const results = await performAlgoliaSearch(query)
            console.timeEnd(`fetched ${query}`)
            internalCache.set(query, { data: results, date: Date.now() })
            return results
        })()
        if (latestQuery !== query) return
        quickPick.busy = false
        setItems(
            results.map(({ name, owner, version, description, bin, humanDownloadsLast30Days, types, repository }) => {
                let detail = `v${version}`

                if (humanDownloadsLast30Days !== undefined) detail += ` $(extensions-install-count) ${humanDownloadsLast30Days}`

                const commands = Object.keys(bin ?? {})
                if (commands.length > 0) detail += ` $(terminal) ${commands.join(', ')}`

                if (types !== undefined) {
                    if (types === false) detail += ' NO TYPES'
                    if (types === 'included') detail += ' $(symbol-type-parameter)'
                    if (types === 'definitely-typed') detail += ' @types'
                }

                const buttons: Array<vscode.QuickInputButton & { action: ButtonAction }> = [
                    {
                        iconPath: new vscode.ThemeIcon('tools'),
                        action: 'dev',
                        tooltip: 'Install as devDependency',
                    },
                    ...((repository
                        ? [
                              {
                                  iconPath: new vscode.ThemeIcon('package'),
                                  action: 'npm',
                                  tooltip: 'Open at NPM',
                              },
                          ]
                        : []) as any),
                    {
                        iconPath: new vscode.ThemeIcon('github'),
                        action: 'repo',
                        tooltip: 'Open repository',
                    },
                ]
                // Hide author by default
                // if (owner) detail += ` $(account) ${owner}`
                if (selectedPackages.some(({ label }) => label === name)) description = `$(history) ${description}`
                const depsPick: Array<keyof PackageJson> = ['dependencies', 'devDependencies']
                const isInstalled = depsPick.some(key => Object.keys(packageJson[key] as Record<string, any>).includes(name))
                if (isInstalled) description = `$(pass) ${description}`

                return {
                    label: name,
                    detail,
                    buttons,
                    description,
                    alwaysShow: true,
                    repositoryUrl: repository?.url,
                    // going to use API only, make happy with types, otherwise let user install if needed
                    types: commands.length === 0 ? types : undefined,
                }
            }),
        )
    }, 200)

    quickPick.onDidTriggerItemButton(({ item, button }) => {
        switch ((button as any).action as ButtonAction) {
            // case 'dev':
            //     selectedPackages.unshift({ ...item, itemType: 'selectedToInstall', installType: 'dev' })
            //     quickPick.value = ''
            //     break
            case 'repo':
                void vscode.env.openExternal(item.repositoryUrl as any)
                break
            case 'npm':
                void vscode.env.openExternal(`https://npmjs.com/package/${item.label}` as any)
                break

            default:
                break
        }
    })
    quickPick.onDidChangeValue(async search => {
        if (['d:', 'dev:'].some(str => search.startsWith(str))) {
            search = search.slice(search.indexOf(':') + 1)
            isPickingDev = true
        } else {
            isPickingDev = false
        }

        if (search.length < 3) {
            quickPick.busy = false
            setItems(false)
            // not involving throttled search anymore, ignore fetching suggestions
            latestQuery = ''
            return
        }

        quickPick.busy = true
        await throttledSearch(search)
    })
    quickPick.onDidAccept(async () => {
        const activeItem = quickPick.activeItems[0]
        if (!activeItem) return
        if (activeItem.itemType === 'install-action') {
            // TODO! workspaces
            quickPick.hide()
            const online = await isOnline()
            const installPackages = async (packages: string[], flags: string[]) =>
                packageManagerCommand({
                    command: 'add',
                    cwd: currentWorkspaceRoot.uri,
                    packages,
                    flags: [...flags, ...(online ? [] : ['--offline'])],
                })
            // `https://cdn.jsdelivr.net/npm/${packageName}/package.json`
            const [devDeps, regularDeps] = partition(({ installType }) => installType === 'dev', selectedPackages).map(arr =>
                arr.map(({ label }) => label),
            ) as [string[], string[]]

            const typesToInstall = selectedPackages.filter(({ types }) => types === 'definitely-typed')
            if (regularDeps.length > 0) await installPackages(regularDeps, [])
            if (getExtensionSetting('addPackages.installTypes')) devDeps.push(...typesToInstall.map(({ label }) => `@types/${label}`))
            if (devDeps.length > 0) await installPackages(devDeps, ['-D'])

            return
        }

        if (activeItem.itemType === 'selectedToInstall') selectedPackages.splice(selectedPackages.indexOf(activeItem), 1)
        else selectedPackages.unshift({ ...activeItem, itemType: 'selectedToInstall', installType: isPickingDev ? 'dev' : undefined })

        if (quickPick.value) quickPick.value = quickPick.value.slice(0, quickPick.value.indexOf(':') + 1)
        // will be updated by onDidChangeValue
        // Update items in quickpick
        else setItems(false)
    })

    quickPick.ignoreFocusOut = true
    quickPick.onDidHide(quickPick.dispose)
    quickPick.show()
}
