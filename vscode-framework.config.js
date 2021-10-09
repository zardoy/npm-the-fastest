/** @type{import('vscode-framework/build/config').UserConfig*/
const config = {
    esbuildConfig: {
        external: ['@vue/compiler-sfc'],
    },
}

module.exports = config
