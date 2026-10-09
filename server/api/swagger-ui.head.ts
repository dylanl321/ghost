import { defineEventHandler, setHeader, setResponseStatus } from 'h3'

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/html')
  setResponseStatus(event, 200)
  return ''
})
