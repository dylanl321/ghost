// Middleware to check if user has required permissions for a route
export default defineNuxtRouteMiddleware((to) => {
  // Skip on server-side rendering
  if (process.server) return
  
  // Get the required permission from route meta
  const requiredPermission = to.meta.permission as string | undefined
  const requiredPermissions = to.meta.permissions as string[] | undefined
  const requireAll = to.meta.requireAll as boolean | undefined
  
  // If no permission requirements, allow access
  if (!requiredPermission && !requiredPermissions) return
  
  const { can, canAny, canAll } = useUserRoles()
  const toast = useToast()
  
  // Check single permission
  if (requiredPermission && !can(requiredPermission)) {
    toast.add({
      title: 'Access Denied',
      description: 'You do not have permission to access this page.',
      color: 'red',
      icon: 'i-heroicons-shield-exclamation'
    })
    
    return abortNavigation()
  }
  
  // Check multiple permissions
  if (requiredPermissions) {
    const hasAccess = requireAll 
      ? canAll(requiredPermissions)
      : canAny(requiredPermissions)
    
    if (!hasAccess) {
      toast.add({
        title: 'Access Denied',
        description: 'You do not have the required permissions to access this page.',
        color: 'red',
        icon: 'i-heroicons-shield-exclamation'
      })
      
      return abortNavigation()
    }
  }
})