# NPM Rapid Ready

## Key Features

- fast packages search
- auto install `@types` with any package manager
- start main script command
- clipboard detection for `npm i -D esbuild`
- and even more

## Default Package Manager

PM – Package Manager.

By default, when project has no lockfile the first installed package manager from your system will be used:
`pnpm`, `yarn` or `npm`
Note that, `npm.packageManager` setting (when not `auto`) always takes precedence and forces to use specific PM in all cases.

## Before hit v0.1.0

Currently, extension is stable enough, but there some work before its get out of preview:

1. Tests
2. Icon
3. yarn berry support

And even more.

**before v0.1.0 config is subject to change without any warnings**

## Known Issues

- commands can't be canceled
- ...

<!-- ## Auto Install

By default, whenever you change in editor and save package.json with dependencies removed or added, package manager with `install` command will be invoked.\

Also, by default whenever lockfiles are changed (usually because of git operations) `install` command also invoked. -->
