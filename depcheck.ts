import depcheck from 'depcheck'
import { writeFile } from 'jsonfile'
;(async () => {
    const cwd = 'C:\\Users\\Professional\\Desktop\\repos\\vscode-framework'
    const result = await depcheck(cwd, { ignoreMatches: ['vscode'] })
    await writeFile('./output.json', result, { spaces: 4 })
})()
