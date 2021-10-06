import { join } from 'path'
import { PackageJson } from 'type-fest'
import jsonfile from 'jsonfile'

export const readDirPackageJson = async (cwd: string) => (await jsonfile.readFile(join(cwd, 'package.json'))) as PackageJson

// TODO return undefined
export const getPrefferedScriptOrThrow = (packageJson: PackageJson, scripts: string[]) => {
    if (packageJson.scripts) {
        const availableScripts = Object.keys(packageJson.scripts)
        for (const script of scripts) if (availableScripts.includes(script)) return script
    }

    // TODO suggest to add one
    throw new Error(`Start script (${scripts.join(', ')}) not found`)
}
