import { PackageJson } from 'type-fest'

// investigate
type DateTime = string

type MatchLevel = 'none' | 'full'

type Owner = Record<'name' | 'email' | 'avatar' | 'link', string>

// TODO! setup auto testsing with TJS

export interface AlgoliaSearchResultItem {
    name: string
    downloadsLast30Days: number
    downloadsRatio: number
    humanDownloadsLast30Days: string // '16.8k' or '9m'
    popular: boolean
    version: string // SemVer
    // 1
    /** version - publish date */
    versions: Record<string, DateTime>
    /** tag - latest version */
    tags: Record<string, string> // highlight dev, next, beta unsure: canary
    description: string
    dependencies: PackageJson['dependencies']
    devDependencies: PackageJson['dependencies']
    originalAuthor: Record<'name' | 'email', string>
    repository: {
        type: 'git'
        url: string
        project: string
        user: string
        host: string
        // empty if root
        path: string
        head: string
        // same as head, sha
        branch: string
    }
    githubRepo: {
        user: string
        // repo
        project: string
        path: string
        // investigate
        head: string
    }
    gitHead: string // sha of repo 8f522dbec41cf1fb6e10f02e56ccc75a3bf073a1
    readme: string
    owner: {
        name: string
        avatar: string // user.png
        link: string // github
    }
    deprecated: false | string
    isDeprecated: boolean
    deprecatedReason: string | null
    homepage: string | null
    license: string // 'MIT'
    keywords: string[]
    computedKeywords: string[]
    computedMetadata: Record<string, unknown>
    created: number
    modified: number
    lastPublisher: Owner
    owners: Owner[]
    bin: PackageJson['bin']
    types: { ts: false | 'included' | 'definitely-typed' }
    // TODO
    moduleTypes: ['unknown'] | ['cjs'] | ['esm'] | ['cjs' | 'esm']
    // 2021-07-30T01:39:21.322Z
    lastCrawl: string
    _searchInternal: {
        alternativeNames: string
        // 1_630_111_161_640
        expiresAt: number
        downloadsMagnitude: number
        jsDelivrPopularity: number
    }
    dependents: number
    humanDependents: string
    /** possible values: https://github.com/algolia/npm-search/blob/aae2d8646350b07e3881cb293dff633050fd7774/src/__tests__/changelog.test.ts#L4 */
    changelogFilename: string | null
    jsDelivrHits: number
    objectID: string
    _highlightResult: {
        name: {
            value: string // '@<em>zardoy</em>/xo-config' //extract <em>
            matchLevel: MatchLevel
            fullyHighlighted: boolean // ?
            matchedWords: [string[]]
        }
        description: {
            value: string
            matchLevel: MatchLevel
            matchedWords: string[]
        }
        owner: { name: [Record<string, unknown>] }
        keywords: Array<{ value: string; matchLevel: MatchLevel; matchedWords: string[] }>
        owners: [[Record<string, unknown>]]
        _searchInternal: { alternativeNames: [string[]] }
    }
}
