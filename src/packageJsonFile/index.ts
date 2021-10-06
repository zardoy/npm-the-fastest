import { PackageJson } from 'type-fest'
import { MaybePromise } from 'vscode-framework/build/util'

// TODO give diagnostic
const checkFields: { [K in keyof PackageJson]: (packageJson: PackageJson & { [T in K]: NonNullable<PackageJson[T]> }) => MaybePromise<boolean> } = {
    main({ main }) {
        return main.startsWith('src/')
    },
}
