# NPM The Fastest

Under heavy development, I want to make it the most comprehensive tool for working with NPM ecosystem inside VSCode

## Features

- Keeps dependencies always in sync with your package manager (editing: [ ] watch: [ ])
- Doesn't support yarn2
<!-- - Works with any package managers best with pnpm!
- [ ] workspaces and monorepos support
- Fastest plugin for
- \> 50 commands should save you a lot of time -->

- Statusbar item

## Statusbar

This extension adds statusbar item, which will warn you if node_modules out of date or there is problem with you package manager.

Also, it shows whether your main script is running.

## Commands in Depth

## Install

The most basic command for installing deps from `package.json`. This is identical to calling `yarn`, `pnpm i -r` or `npm i`.

- By default, pnpm in workspace [will install](https://pnpm.io/cli/install) dependencies in all projects
- There is already builtin command `npm.runInstall`, but it:
  - Only accessible with right click on explorer.
  - Instead of opening terminal, shows graceful notification with installing progress

### Start NPM Script

I think you might aware of NPM Scripts explorer, however to be more productive it's better to launch scripts with keyboards shortcuts.

Calling this command will bring list of scripts

As you can see, `start NPM Script` command **isn't only for starting scripts**. Probably it's just a naming problem.

## Multiple `package.json`

It's common to have multiply `package.json` files across the project (especially in npm-like workspaces).

But things become more complicated in [VSCode multi-root workspaces](https://code.visualstudio.com/docs/editor/workspaces#_multiroot-workspaces).

- *Install NPM Packages* runs install from the root of every folder in multi-root workspace.
  - It can be disabled with `install.handleMutlirootWorkspaces` set to `disabled`
- *Install NPM Packages* runs install from the root of every folder in multi-root workspace.

## Command Arguments

Every command of this extension support arg `location`, which can be `closest`

Example:

```json
{
    "key": "ctrl+k p",
    "command": "
}
```

### Extension Development Notes

## `src` Directory Structure

- `src/commands-core` - command-related code
- `src/core` general code, that can be used outside of vscode
<!-- TODO: linter don't allow to use vscode module inside src/core -->

## Unrelated Functionality

This functionality can be enabled, however it will be removed.

- TypeScript top-line snippets
- TypeScript advanced fixes
