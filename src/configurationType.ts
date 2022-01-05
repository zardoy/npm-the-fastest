export type Configuration = {
    /**
     * What to do on clipboard detection for copied command to install packages
     * @default ask
     */
    'install.clipboardDetection'?: 'ask' | 'auto' | 'disabled'
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
    'install.packs'?: { [key: string]: string[] }
    /**
     * Whether to run package manager install command whenever new workspace is opened to
     * ensure that you have up-to-date deps
     * @default disable
     */
    'install.runOnOpen'?: 'always' | 'askIfNeeded' | 'disable' | 'ifNeeded'
    /**
     * Delay, before package manager invoke. Uses debounce. Relies on #install.watchPackageJson#
     * @default 500
     */
    'install.watchDelay'?: number
    /**
     * Invoke package maanger install whenever you change dependencies in package.json (within VSCode only)
     * @default true
     */
    'install.watchPackageJson'?: boolean
    /**
     * Invoke package manager install whenever lockfile is changed (usually after git operations)
     * @enumDescriptions [
            "Don't do anything",
            "Display confirmation prompt to perform packages install",
            "Perform packages install without any confirmation prompts"
        ]
     */
    'install.watchPackageLocks'?: 'disabled' | 'prompt' | 'withoutPrompt'
    /**
     * The first script will be run from this list on `start-npm-script` command.
     * @uniqueItems true
     * @default [
            "dev",
            "start",
            "watch"
        ]
     */
    'scripts.mainScripts'?: string[]
    /**
     * Whether to match script contents in quickpick search
     * @default false
     */
    'scripts.matchContents'?: boolean
    /**
     * This affects `runScript` and `runMainScript` commands. From where pick scripts
     */
    // "enumDescriptions": [
    //     "Closest package.json file of active text editor",
    //     "Root of current workspace folder (based on active text editor)"
    // ]
    'scripts.searchLocation'?: 'closest' | 'currentWorkspaceFolderRoot'
    /**
     * Include deprecated packages into search results
     * @default false
     */
    'search.includeDeprecated'?: boolean
    /**
     * From where to pick bin commands
     * @default allUpToRoot
     */
    // "enumDescriptions": [
    //     "All bin commands from all node_modules from cwd up to root of workspace",
    //     "All bin commands from nearest node_modules"
    // ]
    'runBinCommand.searchLocation'?: 'allUpToRoot' | 'nearest'
    // 'editor.suggestPackagesToInstall'?: { [identifier: string]: boolean }
    /**
     * Provider that will be used when adding new packages from NPM. Algolia provides more info
     * and 2x faster
     * @default algolia
     */
    'search.provder'?: 'algolia' | 'npms'
    /** @default true */
    'statusbar.showMainScriptStatus'?: boolean
    /** Applies only if project uses yarn 2 or greater and #openWorkspaceAutoInstall# is withoutPrompt. In this case project script, instead of your system-wide package manager will be used
     * @default false
     */
    'yarnBerry.workspaceAutoInstall'?: boolean
    /**
     * Disable, if action open repository takes a lot of time, would use master on directory path
     * @default true
     */
    'codeAction.resolveBranchName'?: boolean
}