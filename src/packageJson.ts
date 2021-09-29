import jsonfile from 'jsonfile'
import { join } from 'path'
import { PackageJson } from 'type-fest'

export const readPackageJson = async (cwd: string) => {
    return (await jsonfile.readFile(join(cwd, 'package.json'))) as PackageJson
}
