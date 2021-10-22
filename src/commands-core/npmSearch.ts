import algoliasearch from 'algoliasearch'

const client = algoliasearch(process.env.ALGOLIA_APP_ID, process.env.ALGOLIA_APP_KEY)
const index = client.initIndex('npm-search')

console.time('search')

const result = await index.search('material-ui', {
    hitsPerPage: 5,
    page: 0,
    attributesToHighlight: ['name', 'description', 'keywords'],
    // attributesToRetrieve: ['deprecated', 'description', 'downloadsLast30Days', 'homepage', 'humanDownloadsLast30Days', 'keywords', 'license', 'modified', 'name', 'owner', 'repository', 'types', 'version'],
    attributesToRetrieve: [
        'name',
        // 'downloadsLast30Days',
        // 'humanDownloadsLast30Days',
        // 'popular',
        'version',
        // 'tags',
        // 'description',
        // 'githubRepo',
        // 'bin',
        // 'homepage',
        // 'license',
        // 'keywords',
        // 'modified',
        // // 'changelogFilename',
        'owner',
        // 'types',

        // 'repository',
    ],
    // filters: 'deprecated:false',
    // analyticsTags: ["github.com/zardoy/npm-the-fastest"],
})

// console.log(body.results.map(({ package: pkg }) => pkg.name))
console.log(result.hits.map(hit => hit))
// console.log(result.hits[0])

console.timeEnd('search')
