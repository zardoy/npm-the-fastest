import { PackageJson } from 'type-fest'

// TODO return undefined
export const getPrefferedScriptOrThrow = (packageJson: PackageJson, scripts: string[]) => {
    if (packageJson.scripts) {
        const availableScripts = Object.keys(packageJson.scripts)
        for (const script of scripts) if (availableScripts.includes(script)) return script
    }

    // TODO suggest to add one
    throw new Error(`Start script (${scripts.join(', ')}) not found`)
}
