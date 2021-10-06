import execa from 'execa'

export const getPnpmVersion = async () => {
    return (await execa('pnpm', ['-v'])).stdout
}

export const getPnpmVersionOrThrow = () => {
    await getPnpmVersion()
}
