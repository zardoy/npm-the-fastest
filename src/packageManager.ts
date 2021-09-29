import whichPm from 'which-pm'

const makeSupportedPackageManagers = <T extends string>(i: Record<T, true | string>) => i

/** Should be enhanced with package manager - min version map */
const supportedPackageManagers = makeSupportedPackageManagers({
    npm: true,
    pnpm: true,
    yarn: true,
})

const getSupportedPackageManager = async (cwd: string) => {
    const { name } = await whichPm(cwd)
    if (!Object.keys(supportedPackageManagers).includes(name as any)) throw new TypeError(`Unsupported package manager ${name}`)
    return name as keyof typeof supportedPackageManagers
}
