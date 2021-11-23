import rewire from 'rewire'
const clipboardDetection = rewire('./clipboardDetection')
const getPackagesFromInstallCmd = clipboardDetection.__get__('getPackagesFromInstallCmd')
// @ponicode
describe('getPackagesFromInstallCmd', () => {
    test('0', async () => {
        expect(await getPackagesFromInstallCmd('npm i foo'))
    })
})
