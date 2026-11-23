import { copyFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
await build({ absWorkingDir: root, entryPoints: ['src/main.js'], bundle: true, format: 'esm', minify: true,
  legalComments: 'eof', outfile: 'lib/life-room3d.js' })
await copyFile(new URL('../src/page.html', import.meta.url), new URL('../lib/life-room3d.html', import.meta.url))
