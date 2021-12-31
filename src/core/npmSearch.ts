import algoliasearch from 'algoliasearch'
import got, { Response } from 'got'
import { SearchResult as NpmsSearchResult } from 'npms.io'
import { SetOptional } from 'type-fest'
import { AlgoliaSearchResultItem } from './algoliaSearchType'

export type NpmSearchResult = Array<
    SetOptional<
        Pick<AlgoliaSearchResultItem, 'name' | 'version' | 'humanDownloadsLast30Days' | 'description' | 'bin' | 'repository'>,
        'bin' | 'repository' | 'humanDownloadsLast30Days'
    > & {
        owner: string
        types?: AlgoliaSearchResultItem['types']['ts']
    }
>

export const performAlgoliaSearch = async (search: string): Promise<NpmSearchResult> => {
    const client = algoliasearch(process.env.ALGOLIA_APP_ID!, process.env.ALGOLIA_APP_KEY!)
    const index = client.initIndex('npm-search')

    const makeAttributesToRetrieve = <T extends Array<keyof AlgoliaSearchResultItem>>(t: T) => t

    const attributesToRetrieve = makeAttributesToRetrieve([
        'name',
        // 'downloadsLast30Days',
        'humanDownloadsLast30Days',
        'popular',
        'repository',
        'version',
        // 'tags',
        'description',
        // 'githubRepo',
        'bin',
        // 'homepage',
        // 'license',
        // 'keywords',
        'modified',
        // 'changelogFilename',
        'owner',
        'types',
    ])
    const results = await index.search<Pick<AlgoliaSearchResultItem, typeof attributesToRetrieve[number]>>(search, {
        hitsPerPage: 20,
        page: 0,
        attributesToHighlight: ['name', 'description', 'keywords'],
        // attributesToRetrieve: ['deprecated', 'description', 'downloadsLast30Days', 'homepage', 'humanDownloadsLast30Days', 'keywords', 'license', 'modified', 'name', 'owner', 'repository', 'types', 'version'],
        attributesToRetrieve,
        filters: 'deprecated:false',
        cacheable: true,
        // analyticsTags: ["github.com/zardoy/npm-the-fastest"],
    })
    return results.hits.map(({ owner, types, ...rest }) => ({ ...rest, owner: owner.name, types: types.ts ?? false }))
    // return results.hits.map(({ name, version, owner }) => ({ name, version, owner: owner.name }))
}

export const performNpmsSearch = async (search: string): Promise<NpmSearchResult> => {
    const currentRequest = got(`https://api.npms.io/v2/search?q=${search}&size=20`, {
        responseType: 'json',
    })
    const successfullRequest: Response<any> = await currentRequest
    const response: NpmsSearchResult = successfullRequest.body
    return response.results.map(({ package: pkg }) => ({
        name: pkg.name,
        owner: pkg.author?.username ?? pkg.author?.name ?? pkg.maintainers[0]!.username,
        version: pkg.version,
        description: pkg.description,
    })) as any
}
