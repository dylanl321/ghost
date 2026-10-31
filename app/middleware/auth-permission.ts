// Middleware to check if user has required permissions or roles for a route
export default defineNuxtRouteMiddleware(async (to) => {
  // Skip on server-side rendering
  if (import.meta.server) return

  // Get the required permission/role from route meta
  const requiredPermission = to.meta.permission as string | undefined
  const requiredPermissions = to.meta.permissions as string[] | undefined
  const requireAll = to.meta.requireAll as boolean | undefined

  // If no permission requirements, allow access
  if (!requiredPermission && !requiredPermissions) return

  const { user, loggedIn } = useOidcAuth()
  if (!loggedIn.value || !user.value) return

  const userGroupStore = useUserGroupStore()
  const accessToken = user.value.accessToken
  const toast = useToast()

  if (user.value.provider === 'dev' && userGroupStore.groupsNeedRefresh) {
    userGroupStore.applyConfiguredDevGroups()
  } else if (accessToken && userGroupStore.groupsNeedRefresh) {
    try {
      await userGroupStore.ensureGroupsInitialized(accessToken)
    } catch {
      toast.add({
        title: 'Unable to Verify Access',
        description: 'Your permissions could not be refreshed. Please try again.',
        color: 'red',
        icon: 'i-heroicons-shield-exclamation'
      })
      return navigateTo('/')
    }
  }

  // Authentication middleware handles incomplete sessions; do not mislabel them as authorization failures.
  if (!userGroupStore.groupsLastFetch) return

  const { can, canAny, canAll, hasRole } = useUserRoles()

  // Check single permission or role
  if (requiredPermission) {
    // First check if it's a role (like 'admin')
    const hasAccess = hasRole(requiredPermission) || can(requiredPermission)

    if (!hasAccess) {
      toast.add({
        title: 'Access Denied',
        description: 'You do not have permission to access this page.',
        color: 'red',
        icon: 'i-heroicons-shield-exclamation'
      })

      return navigateTo('/')
    }
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

      return navigateTo('/')
    }
  }
})
