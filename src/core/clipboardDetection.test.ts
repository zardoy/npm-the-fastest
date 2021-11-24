import { getPackagesFromInstallCmd } from './clipboardDetection'

describe('getPackagesFromInstallCmd', () => {
    test('0', async () => {
        expect(await getPackagesFromInstallCmd('npm i foo'))
    })
})
