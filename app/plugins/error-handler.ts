export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('vue:error', (error: unknown, instance: ComponentPublicInstance | null, info: string) => {
    console.log("Error handler has caught an error!")

    const route = useRoute(); // Get the current route
    const logMessage = `Error - ERROR:${error}, INFO:${info}, ROUTE:${route.fullPath}, STACK:${error.stack}`;
    
    logActivity(logMessage);
  })
})