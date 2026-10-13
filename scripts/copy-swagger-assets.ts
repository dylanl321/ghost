import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceDirectory = resolve(projectRoot, 'node_modules/swagger-ui-dist')
const targetDirectory = resolve(projectRoot, 'public/api/swagger-assets')
const assets = [
  'swagger-ui.css',
  'swagger-ui-bundle.js',
  'swagger-ui-standalone-preset.js',
  'favicon-32x32.png'
]

await mkdir(targetDirectory, { recursive: true })
await Promise.all(assets.map(asset =>
  copyFile(resolve(sourceDirectory, asset), resolve(targetDirectory, asset))
))

process.stdout.write(`Copied ${assets.length} pinned Swagger UI assets\n`)
