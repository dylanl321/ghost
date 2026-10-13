import { getHeader, setHeader, type H3Event } from 'h3'
import { payloadTooLarge } from './errors'

/** Bound memory while reading, including requests without Content-Length. */
export async function readCollaborationBody(event: H3Event, limit: number): Promise<Buffer | undefined> {
  const request = event.node.req
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method || '')) return undefined
  const closeAfterResponse = () => {
    // Return the safe error envelope before closing, without buffering the rest.
    request.pause()
    if (request.httpVersionMajor === 1) setHeader(event, 'Connection', 'close')
  }
  const declaredLength = Number(getHeader(event, 'content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    closeAfterResponse()
    throw payloadTooLarge()
  }
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const cleanup = () => {
      request.off('data', onData)
      request.off('end', onEnd)
      request.off('error', onError)
      request.off('aborted', onAborted)
    }
    const onError = (error: Error) => {
      cleanup()
      closeAfterResponse()
      reject(error)
    }
    const onAborted = () => onError(new Error('Request body was interrupted'))
    const onData = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += bytes.byteLength
      if (size > limit) {
        onError(payloadTooLarge())
        return
      }
      chunks.push(bytes)
    }
    const onEnd = () => {
      cleanup()
      resolve(Buffer.concat(chunks, size))
    }
    if (request.aborted || request.destroyed) {
      onAborted()
      return
    }
    request.on('data', onData)
    request.once('end', onEnd)
    request.once('error', onError)
    request.once('aborted', onAborted)
  })
}
