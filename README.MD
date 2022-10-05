# NPM Rapid Ready

### Help Wanted

This extension has already implemented a lot of great & unique features, but it was always suffering because of lack maintenance support. It still has a lot of ideas be to implemented in the feature, they are all easy to implement and I'd happy to transfer them!

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

#### Useful Builtin Commands

- `Tasks: Restart Running Task` - Shows QuickPick with all started tasks including NPM scripts. Press enter to restart.
- `Tasks: Terminate Task` - Same as above, but enter instantly terminates and closes the task
- `Tasks: Show Running Tasks` - Reveals panel with running tasks
- `Tasks: Rerun Last Task` - Useful to bind to some shortcut

Note, that not all setting (such as `install.watchPackageLocks`) are implemented for now.

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

## Similar Extensions

These useful extensions have functionality, that this extension doesn't have:

- [npm-import-package-version](https://marketplace.visualstudio.com/items?itemName=axetroy.vscode-npm-import-package-version) - show versions as decorations and hover with quick description and ability to go to dep's package.json
- [npm-links](https://marketplace.visualstudio.com/items?itemName=Dolov.npm-links) - show more comprehensive description with ability to go to package repo or other sites

<!-- ## Auto Install

By default, whenever you change in editor and save package.json with dependencies removed or added, package manager with `install` command will be invoked.\

Also, by default whenever lockfiles are changed (usually because of git operations) `install` command also invoked. -->
