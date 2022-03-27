/// <reference types="vitest/globals" />
import { getPackagesFromInstallCmd } from '../src/core/clipboardDetection'
import { vi } from 'vitest'

vi.mock('vscode')

describe('getPackagesFromInstallCmd', () => {
    test('0', () => {
        expect(getPackagesFromInstallCmd('npm i foo')).toMatchInlineSnapshot(`
          {
            "flags": [],
            "packageManager": "npm",
            "packages": [
              "foo",
            ],
          }
        `)
    })
    test('1', () => {
        expect(getPackagesFromInstallCmd('npm i foo --dev bar --dangerous-flag foo -D some-another-package')).toMatchInlineSnapshot(`
          {
            "flags": [
              "--dev",
              "-D",
            ],
            "packageManager": "npm",
            "packages": [
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
          {
            "flags": [
              "--dev",
            ],
            "packageManager": "yarn",
            "packages": [
              "\\"test\\"",
            ],
          }
        `)
    })
    test('3', () => {
        expect(getPackagesFromInstallCmd('pnpm install "test" --save-dev -foo "-d" 83')).toMatchInlineSnapshot(`
          {
            "flags": [
              "--save-dev",
            ],
            "packageManager": "pnpm",
            "packages": [
              "\\"test\\"",
              "\\"-d\\"",
              "83",
            ],
          }
        `)
    })
})
