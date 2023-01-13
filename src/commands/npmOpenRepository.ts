import hostedGitInfo from 'hosted-git-info'

export const getPackageRepositoryUrl = (spec, { repository }, handleDirectory) => {
    const r = repository
    const rurl = r ? (typeof r === 'string' ? r : typeof r === 'object' && typeof r.url === 'string' ? r.url : null) : null

    if (!rurl)
        throw Object.assign(new Error('no repository'), {
            pkgid: spec,
        })

    const info = hostedFromMani({ repository })
    const url = info ? info.browse(handleDirectory ? repository.directory : undefined) : unknownHostedUrl(rurl)

    if (!url)
        throw Object.assign(new Error('no repository: could not get url'), {
            pkgid: spec,
        })

    return url
}

const hostedFromMani = ({ repository }) => {
    const r = repository
    const rurl = r ? (typeof r === 'string' ? r : typeof r === 'object' && typeof r.url === 'string' ? r.url : null) : null

    // hgi returns undefined sometimes, but let's always return null here
    return (rurl && hostedGitInfo.fromUrl(rurl.replace(/^git\+/, ''))) || null
}

const unknownHostedUrl = url => {
    try {
        const { protocol, hostname, pathname } = new URL(url)

        /* istanbul ignore next - URL ctor should prevent this */
        if (!protocol || !hostname) return null

        const proto = /(git\+)http:$/.test(protocol) ? 'http:' : 'https:'
        const path = pathname.replace(/\.git$/, '')
        return `${proto}//${hostname}${path}`
    } catch {
        return null
    }
}
