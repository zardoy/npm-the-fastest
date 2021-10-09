import { join } from 'path'
import execa from 'execa'
import globby from 'globby'
import slash from 'slash'
import fsExtra from 'fs-extra'

export const getPnpmVersion = async () => {
    try {
        return (await execa('pnpm', ['-v'])).stdout
    } catch {
        return undefined
    }
}

export const getPnpmVersionOrThrow = async () => {
    const version = await getPnpmVersion()
    if (!version) throw new Error('pnpm is not installed')
    return version
}

/** List packages, installable with `--offline` flag */
export const getPnpmOfflinePackages = async () => {
    console.time('get-offline')
    await getPnpmVersionOrThrow()
    const globalStorePath = (await execa('pnpm', 'store path'.split(' '))).stdout
    const searchPath = slash(join(globalStorePath, 'files/**/*-index.json'))
    const indexFiles = await globby(searchPath)
    const packageVersions: { [packageName: string]: string[] } = {} // version[]
    await Promise.all(
        indexFiles.map(async indexFile =>
            (async () => {
                const { name, version } = JSON.parse(await fsExtra.readFile(indexFile, 'utf-8')) as Record<'name' | 'version', string>
                if (!packageVersions[name]) packageVersions[name] = []
                packageVersions[name]!.push(version)
            })(),
        ),
    )
    console.timeEnd('get-offline')
    return packageVersions
}
