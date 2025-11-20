export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('vue:error', (error: unknown, instance: ComponentPublicInstance | null, info: string) => {
    console.log("Error handler has caught an error!")

    // Access route safely - it's available at error time, not plugin setup time
    try {
      const route = useRoute();
      const logMessage = `Error - ERROR:${error}, INFO:${info}, ROUTE:${route.fullPath}, STACK:${error.stack}`;
      logActivity(logMessage);
    } catch (routeError) {
      // Fallback if route is not available
      const logMessage = `Error - ERROR:${error}, INFO:${info}, ROUTE:unknown, STACK:${error.stack}`;
      logActivity(logMessage);
    }
  })
})