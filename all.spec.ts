/// <reference types="vitest/globals" />

vi.mock('vscode', () => ({
    commands: {
        registerCommand() {},
    },
    languages: new Proxy(
        {},
        {
            get(target, p, receiver) {
                return () => {}
            },
        },
    ),
    workspace: {},
    window: {
        onDidChangeTextEditorSelection() {},
    },
}))

globalThis.trackDisposable = a => a

import { parseCommandString } from './test'

const stringWithCursor = (inputString: string, cursorMarker = '|') => {
    const idx = inputString.indexOf(cursorMarker)
    return [inputString.slice(0, idx) + inputString.slice(idx + 1), idx] as const
}

const parseCommandStringWithCursor = (input: string, sliceStr = false) => {
    const [str, cursor] = stringWithCursor(input)
    return parseCommandString(str, cursor, sliceStr)
}

const testCommandPart = (input: string, expectedValue: string, expectedOffset: number, expectedIndex?: number) => {
    test(`Command part: ${input}`, () => {
        const { currentPartValue, currentPartOffset, currentPartIndex } = parseCommandStringWithCursor(input) || {}
        expect(currentPartValue).toBe(expectedValue)
        expect(currentPartOffset).toBe(expectedOffset)
        if (expectedIndex !== undefined) expect(currentPartIndex).toBe(expectedIndex)
    })
}

describe('parseCommandString', () => {
    test('Basic', () => {
        const result = parseCommandStringWithCursor('yarn &&  pnpm| test')
        expect(result?.parts).toEqual([
            ['pnpm', 9],
            ['test', 14],
        ])
    })

    test('Trim', () => {
        const result = parseCommandStringWithCursor('esbuild "test 2.js" --define:|yes', true)
        expect(result?.currentPartValue).toBe('--define:')
    })

    testCommandPart('|', '', 0, 0)
    testCommandPart('yarn && pnpm |test', 'test', 13, 1)
    testCommandPart('esbuild "test 2.js" --define:yes|', '--define:yes', 20, 2)
    testCommandPart('esbui|ld "test 2.js" --define:yes ', 'esbuild', 0, 0)
    testCommandPart('|esbuild "test 2.js" --define:yes', 'esbuild', 0, 0)
    testCommandPart('esbuild| "test 2.js" --define:yes', 'esbuild', 0, 0)
    testCommandPart('esbuild "--opt=|value " --define:yes ', '--opt=value ', 8, 1)
    testCommandPart('esbuild --allow-|overwrite ', '--allow-overwrite', 8, 1)
    testCommandPart('esbuild "v" --allow-overwrite| ', '--allow-overwrite', 12, 2)
    // todo
    testCommandPart('esbuild "v" --allow-overwrite |', ' ', 30, 3)
})
