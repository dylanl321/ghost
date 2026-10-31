/**
 * Path segments for layout breadcrumbs, decoded.
 * route.path is decoded on the server but percent-encoded on the client (an email's @ arrives
 * as %40), so decoding here makes both render the same labels and links.
 */
export function breadcrumbSegments(path: string): string[] {
  return path.split('/').filter(Boolean).map((seg) => {
    try {
      return decodeURIComponent(seg)
    } catch {
      return seg
    }
  })
}

/** Link to the first `count` decoded segments, re-encoded. */
export function breadcrumbPath(segments: string[], count: number): string {
  return '/' + segments.slice(0, count).map(encodeURIComponent).join('/')
}
