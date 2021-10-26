import { PackageJson } from 'type-fest'

const myOrder = [
    'name',
    'private',
    'version',
    'author',
    'description',
    'keywords',
    'files',
    'bin',
    'engines',
    'main',
    'browser',
    'types',
    'scripts',
    'dependencies',
    'peerDependencies',
    'peerDependenciesMeta',
    'optionalDependencies',
    'devDependencies',
] as Array<keyof PackageJson>
