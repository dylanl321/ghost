import { createReadStream } from 'node:fs'
import { createRequire } from 'node:module'
import { createError, defineEventHandler, getRouterParam, sendStream, setHeader } from 'h3'

const require = createRequire(import.meta.url)
const assets = {
  'swagger-ui.css': 'text/css; charset=utf-8',
  'swagger-ui-bundle.js': 'text/javascript; charset=utf-8',
  'swagger-ui-standalone-preset.js': 'text/javascript; charset=utf-8',
  'favicon-32x32.png': 'image/png'
} as const

export default defineEventHandler((event) => {
  const asset = getRouterParam(event, 'asset') as keyof typeof assets
  const contentType = assets[asset]
  if (!contentType) {
    throw createError({ statusCode: 404, statusMessage: 'Swagger asset not found' })
  }

  setHeader(event, 'content-type', contentType)
  setHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
  return sendStream(event, createReadStream(require.resolve(`swagger-ui-dist/${asset}`)))
})
