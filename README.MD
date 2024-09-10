# NPM Rapid Ready

## Key Features

### Install Packages

> Command: `Add npm Packages`

- Fast packages search
- Auto install `@types` with any package manager
- Clipboard detection for `npm i -D esbuild`

### Remove Packages

Quickly select & remove packages with `Remove npm Packages` command or code action on import statements.

### Lockfile Watcher

By default, we prompt to run package manager install command on lockfile change (e.g. if `package-lock.json` was changed after git switch). You can either disable this feature or make it run without confirmation with `install.watchLockfiles` setting.

### Npm Scripts

- Select and start script command: `Run npm Script`
- Start main script command: `Run Main npm Script`
- Displays running npm script names in statusbar

- and even more

#### Useful Builtin Commands

> These commands are already builtin into VSCode:

- `Tasks: Restart Running Task` - Shows QuickPick with all started tasks including NPM scripts. Press enter to restart.
- `Tasks: Terminate Task` - Same as above, but enter instantly terminates and closes the task
- `Tasks: Show Running Tasks` - Reveals panel with running tasks
- `Tasks: Rerun Last Task` - Useful to bind to some shortcut

## Open At

There are commands to quickly select and open package on specific resource, such as its repository or its readme right within VSCode. Just go explore command by clicking contributes tab in VSCode!

## Default Package Manager

> PM – Package Manager.

By default, when project has no lockfile the first installed PM from your system will be used: `pnpm`, `yarn`, `bun` or `npm`

Note that, `npm.packageManager` setting (when not `auto`) always takes precedence and forces to use specific PM in all cases.

## Before hit v0.1.0

Currently, extension is stable enough, but there some work before its get out of preview.

On v0.1.0 config will be probably changed.

## Similar Extensions

These useful extensions have functionality, that this extension doesn't have:

- [npm-import-package-version](https://marketplace.visualstudio.com/items?itemName=axetroy.vscode-npm-import-package-version) - show versions as decorations and hover with quick description and ability to go to dep's package.json
- [npm-links](https://marketplace.visualstudio.com/items?itemName=Dolov.npm-links) - show more comprehensive description with ability to go to package repo or other sites

### Help Wanted

This extension has already implemented a lot of great & unique features, but it was always suffering because of lack maintenance support. It still has a lot of ideas be to implemented in the feature, they are all easy to implement and I'd happy to transfer them!

## Extension Development Notes

### `src` Directory Structure

- `src/commands-core` - command-related code
- `src/core` general code, that can be used outside of vscode

<!-- ## Auto Install

By default, whenever you change in editor and save package.json with dependencies removed or added, package manager with `install` command will be invoked.\

Also, by default whenever lockfiles are changed (usually because of git operations) `install` command also invoked. -->
