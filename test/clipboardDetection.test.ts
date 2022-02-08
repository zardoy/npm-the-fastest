/// <reference types="jest" />
import { getPackagesFromInstallCmd } from '../src/core/clipboardDetection'

describe('getPackagesFromInstallCmd', () => {
    test('0', () => {
        expect(getPackagesFromInstallCmd('npm i foo')).toMatchInlineSnapshot(`
Object {
  "flags": Array [],
  "packageManager": "npm",
  "packages": Array [
    "foo",
  ],
}
`)
    })
    test('1', () => {
        expect(getPackagesFromInstallCmd('npm i foo --dev bar --dangerous-flag foo -D some-another-package')).toMatchInlineSnapshot(`
Object {
  "flags": Array [
    "--dev",
    "-D",
  ],
  "packageManager": "npm",
  "packages": Array [
    "foo",
    "bar",
    "foo",
    "some-another-package",
  ],
}
`)
    })
    test('2', () => {
        expect(getPackagesFromInstallCmd('yarn add "test" --dev')).toMatchInlineSnapshot(`
Object {
  "flags": Array [
    "--dev",
  ],
  "packageManager": "yarn",
  "packages": Array [
    "\\"test\\"",
  ],
}
`)
    })
    test('3', () => {
        expect(getPackagesFromInstallCmd('pnpm install "test" --save-dev -foo "-d" 83')).toMatchInlineSnapshot(`
Object {
  "flags": Array [
    "--save-dev",
  ],
  "packageManager": "pnpm",
  "packages": Array [
    "\\"test\\"",
    "\\"-d\\"",
    "83",
  ],
}
`)
    })
})
