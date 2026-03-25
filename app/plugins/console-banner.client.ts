/**
 * Prints a fun ASCII art banner to the browser console on app load.
 */
export default defineNuxtPlugin(() => {
  const banner = `
 ██████╗ ██╗  ██╗ ██████╗ ███████╗████████╗
██╔════╝ ██║  ██║██╔═══██╗██╔════╝╚══██╔══╝
██║  ███╗███████║██║   ██║███████╗   ██║
██║   ██║██╔══██║██║   ██║╚════██║   ██║
╚██████╔╝██║  ██║╚██████╔╝███████║   ██║
 ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝
`

  const config = useRuntimeConfig()
  const version = config.public.appVersion || ''
  const env = config.public.environment || 'local'

  console.log(
    `%c${banner}`,
    'color: #6366f1; font-family: monospace; font-size: 12px;'
  )
  console.log(
    `%c  v${version} • ${env} %c\n  Welcome to the GHOST Dashboard 👻\n`,
    'color: #6366f1; font-weight: bold;',
    'color: #a5b4fc;'
  )
})
