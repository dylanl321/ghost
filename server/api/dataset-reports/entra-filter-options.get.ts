/**
 * Get available filter options for Entra Users dataset
 * Returns actual roles and departments from the organization's Entra ID data
 */

export default defineEventHandler(async (event) => {
  try {
    // Verify authentication
    const auth = event.context.auth
    if (!auth || !auth.isAuthenticated) {
      throw createError({
        statusCode: 401,
        message: 'Authentication required'
      })
    }

    logger.info('[Entra Filter Options] Fetching available filter options')

    // Get all AWS role groups
    const { data: groupsByAccount } = await getAWSGroups(event)

    // Extract unique roles from groups
    const rolesSet = new Set<string>()
    const departmentsSet = new Set<string>()

    for (const [accountId, accountGroups] of Object.entries(groupsByAccount)) {
      // Ensure commercial and govcloud are arrays before spreading
      const commercial = Array.isArray(accountGroups.commercial) ? accountGroups.commercial : []
      const govcloud = Array.isArray(accountGroups.govcloud) ? accountGroups.govcloud : []
      const allGroups = [...commercial, ...govcloud]

      for (const group of allGroups) {
        // Add role to set
        if (group.role) {
          rolesSet.add(group.role)
        }
      }
    }

    // Convert roles to sorted array
    const roles = Array.from(rolesSet).sort()

    logger.info('[Entra Filter Options] Fetching user departments from first 100 users')

    // Fetch a sample of users to get departments
    // We'll get members from the first few groups to build department list
    const sampleGroups = Object.values(groupsByAccount)
      .flatMap(accountGroups => {
        const commercial = Array.isArray(accountGroups.commercial) ? accountGroups.commercial : []
        const govcloud = Array.isArray(accountGroups.govcloud) ? accountGroups.govcloud : []
        return [...commercial, ...govcloud]
      })
      .slice(0, 5) // Sample first 5 groups

    for (const group of sampleGroups) {
      try {
        const membersResponse = await getGroupMembers(event, group.id, true)

        for (const member of membersResponse.members || []) {
          if (member.department) {
            departmentsSet.add(member.department)
          }
        }

        // Stop if we have enough departments
        if (departmentsSet.size >= 20) break
      } catch (error) {
        logger.warn('[Entra Filter Options] Failed to fetch members for department sampling', {
          groupId: group.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
        // Continue with other groups
      }
    }

    // Convert departments to sorted array
    const departments = Array.from(departmentsSet).sort()

    logger.info('[Entra Filter Options] Filter options fetched successfully', {
      roleCount: roles.length,
      departmentCount: departments.length
    })

    return {
      success: true,
      data: {
        roles: roles.map(role => ({ label: role, value: role })),
        departments: departments.map(dept => ({ label: dept, value: dept }))
      }
    }

  } catch (error: any) {
    logger.error('[Entra Filter Options] Failed to fetch filter options', { error })

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to fetch Entra filter options'
    })
  }
})
