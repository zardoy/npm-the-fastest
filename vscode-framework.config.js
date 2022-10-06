//@ts-check

const dotenv = require('dotenv')
const { defineConfig } = require('@zardoy/vscode-utils/build/defineConfig.cjs')

dotenv.config({ path: '.env.local' })

module.exports = defineConfig({
    esbuild: {
        defineEnv: {
            ALGOLIA_APP_ID: process.env.ALGOLIA_APP_ID,
            ALGOLIA_APP_KEY: process.env.ALGOLIA_APP_KEY,
        },
        keepNames: true,
    },
    development: {
        // disableExtensions: false,
    },
})
