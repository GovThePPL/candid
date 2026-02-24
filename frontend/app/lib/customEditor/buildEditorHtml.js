import { readFileSync, writeFileSync, mkdirSync } from 'fs'

mkdirSync('build', { recursive: true })

const html = readFileSync('dist/index.html', 'utf8')
writeFileSync(
  'build/editorHtml.js',
  `export default ${JSON.stringify(html)};\n`
)

console.log(`Built editorHtml.js (${(html.length / 1024).toFixed(1)} KB)`)
