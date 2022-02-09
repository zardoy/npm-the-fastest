# NPM Rapid Ready

## Key Features

### Package Manager Support

- Fast packages search
- Auto install `@types` with any package manager
- Clipboard detection for `npm i -D esbuild`

### Npm Scripts

- Start main script command
- Displays running npm script names in statusbar
- Start npm scripts from quick pick menu

- and even more

## Default Package Manager

> PM – Package Manager.

By default, when project has no lockfile the first installed package manager from your system will be used:
`pnpm`, `yarn` or `npm`
Note that, `npm.packageManager` setting (when not `auto`) always takes precedence and forces to use specific PM in all cases.

## Before hit v0.1.0

Currently, extension is stable enough, but there some work before its get out of preview:

1. Tests
2. Icon
3. Yarn berry support

And even more.

On v0.1.0 config will be probably changed.

<!-- ## Auto Install

By default, whenever you change in editor and save package.json with dependencies removed or added, package manager with `install` command will be invoked.\

Also, by default whenever lockfiles are changed (usually because of git operations) `install` command also invoked. -->
