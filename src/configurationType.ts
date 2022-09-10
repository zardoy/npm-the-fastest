// TODO impl commands:
// {
//     "command": "openPackageJsonFrom",
//     "title": "Open package.json from..."
// },
// enforcePackageManagerUse

type RunOnSaveRule = {
    relativePathGlob: string
    command: string
    deps?: Array<string | { dep: string; type: string }>
    /**
     * Note for `packageJson`: it will fallback to file if closest package.json cannot be find
     *  @default file */
    cwd?: 'file' | 'packageJson' | 'workspace'
    // TODO!
    /** Checks against locally installed version from node_modules. Raises a warning by default, if  */
    // semverRange?: string
    /** Only when `semverRange` is specified */
    // noInstalledWarning?: boolean
    /** Kill previous command execution @default true */
    killPrev: boolean
}

export type Configuration = {
    // TOOD describe difference between builtin setting
    /**
     * Your main package manager that leads your projects
     * Used when no lockfile is detected
     * By default (when null) first installed is picked: pnpm, yarn, npm
     * @default null
     * */
    leadingPackageManager: 'pnpm' | 'yarn' | 'npm' | null
    /**
     * What to do on clipboard detection for copied command to install packages
     * @default ask
     */
    'install.clipboardDetection': 'ask' | 'auto' | 'disabled'
    // "enumDescriptions": [
    //     "Always perform install only for active editor workspace",
    //     "Install packages for each workspace at the same time. Several progress notifications will be showed",
    //     "Install packages for each workspace in sequence"
    // ],
    // "default": "parallel"
    // "install.handleMutlirootWorkspaces"?: "disabled" | "parallel" | "serial";
    /**
     * Create your own sets of package to install at once
     */
    'install.packs': { [key: string]: string[] }
    /**
     * Whether to run package manager install command whenever new workspace is opened to
     * ensure that you have up-to-date deps
     * @default disable
     */
    'install.runOnOpen': 'always' | 'askIfNeeded' | 'disable' | 'ifNeeded'
    /**
     * Delay, before package manager invoke. Uses debounce. Relies on #install.watchPackageJson#
     * @default 500
     */
    'install.watchDelay': number
    /**
     * Invoke package maanger install whenever you change dependencies in package.json (within VSCode only)
     * @default true
     */
    'install.watchPackageJson': boolean
    /**
     * Invoke package manager install whenever lockfile is changed (usually after git operations)
     * @enumDescriptions [
            "Don't do anything",
            "Display confirmation prompt to perform packages install",
            "Perform packages install without any confirmation prompts"
        ]
     */
    'install.watchPackageLocks': 'disabled' | 'prompt' | 'withoutPrompt'
    /**
     * All package manager commands are executed from extension host process. Passing all environmental variables from ext host can cause problems that is hard to debug.
     * Note, that this affects all package manager commands for all package managers.
     * @default include
     */
    packageManagerAllowedEnv: 'include' | 'exclude' | 'disable'
    /**
     * The first script will be run from this list on `start-npm-script` command.
     * @uniqueItems true
     * @default [
            "dev",
            "start",
            "watch"
        ]
     */
    /**
     * Install missing @types/ packages, if package doesn't have bin
     * @default true
     */
    'addPackages.installTypes': boolean
    /**
     * The first script will be run from this list on `start-npm-script` command.
     * @uniqueItems true
     * @default [
            "dev",
            "start",
            "watch"
        ]
     */
    'scripts.mainScripts': string[]
    /**
     * Whether to enable searching by script contents in quickpick
     * @default false
     */
    'scripts.matchContents': boolean
    /**
     * This affects `runScript` and `runMainScript` commands. From where pick scripts
     * @default closest
     */
    // "enumDescriptions": [
    //     "Closest package.json file of active text editor",
    //     "Root of current workspace folder (based on active text editor)"
    // ]
    // 'scripts.searchLocation': 'closest' | 'currentWorkspaceFolderRoot'
    /**
     * Number of milliseconds to wait after killing the script and before starting the script again
     * Note: it only affects restart command from quick pick of this extension
     * @default {}
     */
    'scripts.restartDelay': {
        '*'?: number
    } & { [script: string]: number }
    /** Map of workspace glob path: array of script contents */
    'scripts.specialCommands': {
        [workspaceGlobPath: string]: Array<{
            /** Defaults to command contents */
            label?: string
            command: string
            // optional
            presentationOptions?: any
        }>
    }
    /**
     * Include deprecated packages into search results
     * @default false
     */
    'search.includeDeprecated': boolean
    /**
     * Affects `openPackageReadmePreview`: whether to open README on npmjs, if it can't be found on disk locally.
     * @default true
     */
    // 'openReadmeRemote': boolean
    /**
     * From where to pick bin commands
     * @default allUpToRoot
     */
    // "enumDescriptions": [
    //     "All bin commands from all node_modules from cwd up to root of workspace",
    //     "All bin commands from nearest node_modules"
    // ]
    'runBinCommand.searchLocation': 'allUpToRoot' | 'nearest'
    // 'editor.suggestPackagesToInstall': { [identifier: string]: boolean }
    /**
     * Provider that will be used when adding new packages from NPM. Algolia provides more info
     * and 2x faster
     * @default algolia
     */
    'search.provder': 'algolia' | 'npms'
    /**
     * Specify language IDs in which to enable code actions. You can set it to empty array to entirely disable the feature.
     * @default ["typescript", "typescriptreact", "javascript", "javascriptreact", "vue"]
     */
    'codeActions.enableLanguages': string[]
    /** @default true */
    'statusbar.showMainScriptStatus': boolean
    /** Applies only if project uses yarn 2 or greater and #openWorkspaceAutoInstall# is withoutPrompt. In this case project script, instead of your system-wide package manager will be used
     * @default false
     */
    'yarnBerry.workspaceAutoInstall': boolean
    /**
     * Disable if action open repository takes a lot of time, in this case it would use `master` branch in url
     * @default true
     */
    'codeAction.resolveBranchName': boolean
    runOnSave: RunOnSaveRule[]
    /**
     * It won't run on after delay auto save type anyway
     * @default false
     */
    'runOnSave.runOnAutoSave': ''
    /**
     * Wether to enable completions in package.json files
     * @default true
     */
    packageJsonIntellisense: boolean
    /**
     * Wether to enable links in package.json files
     * @default true
     */
    packageJsonLinks: boolean
    // TODO change to always show state
    /**
     * Wether to enable links script names to run script
     * @default false
     */
    packageJsonScriptNameLink: boolean
    /** @default true */
    // enableTerminalLinkProvider: boolean
}
