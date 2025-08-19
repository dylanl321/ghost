// Histoire setup with Nuxt plugin
// Provide comprehensive mocks for Nuxt UI components

export function setupVue3({ app }) {
  // Enhanced router mock
  app.config.globalProperties.$router = {
    push: (to) => console.log('Router push:', to),
    replace: (to) => console.log('Router replace:', to),
    go: (delta) => console.log('Router go:', delta),
    back: () => console.log('Router back'),
    forward: () => console.log('Router forward'),
    resolve: (to) => ({ href: '#', route: { path: '/', name: 'mock' } }),
    currentRoute: { value: { path: '/story', name: 'story', params: {}, query: {}, hash: '' } }
  }
  
  app.config.globalProperties.$route = {
    path: '/story',
    name: 'story',
    params: {},
    query: {},
    hash: '',
    meta: {},
    fullPath: '/story'
  }
  
  // Mock nuxtApp context
  app.config.globalProperties.$nuxtApp = {
    $router: app.config.globalProperties.$router,
    $route: app.config.globalProperties.$route
  }
  
  // Provide composables mocks
  app.provide('$router', app.config.globalProperties.$router)
  app.provide('$route', app.config.globalProperties.$route)
  
  // Mock useRouter and useRoute composables
  const useRouter = () => app.config.globalProperties.$router
  const useRoute = () => app.config.globalProperties.$route
  
  app.config.globalProperties.useRouter = useRouter
  app.config.globalProperties.useRoute = useRoute
  
  // Global composables
  if (typeof window !== 'undefined') {
    window.useRouter = useRouter
    window.useRoute = useRoute
  }
  
  console.log('Histoire setup complete - Enhanced Nuxt environment with comprehensive mocks')
}