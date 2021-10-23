const dotenv = require('dotenv')

dotenv.config({ path: '.env.local' })

/** @type{import('vscode-framework/build/config').UserConfig*/
const config = {
    esbuildConfig: {
        external: ['@vue/compiler-sfc'],
        define: {
            ALGOLIA_APP_ID: process.env.ALGOLIA_APP_ID,
            ALGOLIA_APP_KEY: process.env.ALGOLIA_APP_KEY,
        },
    },
    development: {
        disableExtensions: false,
    },
}

module.exports = config
