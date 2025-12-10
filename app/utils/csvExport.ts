/**
 * CSV Export utilities for user and access data
 */

export interface UserExportData {
  displayName: string
  userPrincipalName: string
  jobTitle?: string
  department?: string
  awsAccountCount: number
  roleCount: number
  highestPrivilege: string
  tags: string
  awsAccounts: string
}

/**
 * Convert a value to CSV-safe string
 */
const escapeCSV = (value: any): string => {
  if (value === null || value === undefined) return ''
  
  const str = String(value)
  
  // If contains comma, newline, or quote, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  
  return str
}

/**
 * Export users data to CSV
 */
export const exportUsersToCSV = (users: any[], filename = 'users-export.csv') => {
  if (!users || users.length === 0) {
    console.warn('No users to export')
    return
  }

  // Define CSV headers
  const headers = [
    'Display Name',
    'Email',
    'Job Title',
    'Department',
    'AWS Accounts',
    'Role Count',
    'Highest Privilege',
    'Tags',
    'Account Details'
  ]

  // Build CSV rows
  const rows = users.map(user => {
    const awsAccountNames = user.awsAccounts?.map((acc: any) => acc.accountName).join('; ') || ''
    const tags = user.tags?.map((tag: any) => tag.title).join(', ') || ''
    const roles = user.roles?.join(', ') || ''
    
    // Determine highest privilege
    let highestPrivilege = 'None'
    if (user.roles?.some((r: string) => r.toLowerCase().includes('admin'))) {
      highestPrivilege = 'Admin'
    } else if (user.roles?.some((r: string) => r.toLowerCase().includes('power'))) {
      highestPrivilege = 'Power User'
    } else if (user.roles?.some((r: string) => r.toLowerCase().includes('readwrite'))) {
      highestPrivilege = 'Read-Write'
    } else if (user.roles?.some((r: string) => r.toLowerCase().includes('readonly'))) {
      highestPrivilege = 'Read-Only'
    } else if (user.roles?.length > 0) {
      highestPrivilege = 'Limited'
    }

    return [
      escapeCSV(user.displayName),
      escapeCSV(user.userPrincipalName),
      escapeCSV(user.jobTitle || ''),
      escapeCSV(user.department || ''),
      escapeCSV(user.awsAccounts?.length || 0),
      escapeCSV(user.roles?.length || 0),
      escapeCSV(highestPrivilege),
      escapeCSV(tags),
      escapeCSV(awsAccountNames)
    ]
  })

  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n')

  // Create and download file
  downloadCSV(csvContent, filename)
}

/**
 * Export filtered users to CSV with additional details
 */
export const exportFilteredUsersToCSV = (users: any[], filters: any = {}, filename = 'filtered-users.csv') => {
  // Add filter information to filename
  const filterParts = []
  if (filters.role) filterParts.push(`role-${filters.role}`)
  if (filters.account) filterParts.push(`account-${filters.account}`)
  if (filters.awsOnly) filterParts.push('aws-only')
  
  const enhancedFilename = filterParts.length > 0 
    ? `users-${filterParts.join('-')}.csv`
    : filename

  exportUsersToCSV(users, enhancedFilename)
}

/**
 * Export enhanced user access data with account details
 */
export const exportEnhancedUserAccessToCSV = (userData: any, filename = 'user-access-details.csv') => {
  const headers = [
    'User',
    'Email',
    'Account ID',
    'Account Name',
    'Environment',
    'Role',
    'Access Level',
    'Department',
    'Line of Business'
  ]

  const rows: string[][] = []

  // Flatten user access data
  if (userData.awsAccounts && Array.isArray(userData.awsAccounts)) {
    userData.awsAccounts.forEach((account: any) => {
      (account.roles || []).forEach((role: string) => {
        rows.push([
          escapeCSV(userData.displayName),
          escapeCSV(userData.userPrincipalName),
          escapeCSV(account.accountId),
          escapeCSV(account.accountName),
          escapeCSV(account.isGovCloud ? 'GovCloud' : 'Commercial'),
          escapeCSV(role),
          escapeCSV(getAccessLevel(role)),
          escapeCSV(userData.department || ''),
          escapeCSV(account.linesOfBusiness || '')
        ])
      })
    })
  }

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n')

  downloadCSV(csvContent, filename)
}

/**
 * Export flattened user access data
 */
export const exportFlattenedUserAccessToCSV = (userData: any, accounts: any[], filename?: string) => {
  const userName = userData.displayName || userData.userPrincipalName
  const defaultFilename = `${userName.replace(/[^a-z0-9]/gi, '-')}-access.csv`
  
  exportEnhancedUserAccessToCSV(userData, filename || defaultFilename)
}

/**
 * Helper to determine access level from role name
 */
const getAccessLevel = (role: string): string => {
  const roleLower = role.toLowerCase()
  
  if (roleLower.includes('admin')) return 'Administrative'
  if (roleLower.includes('power')) return 'Power User'
  if (roleLower.includes('developer')) return 'Developer'
  if (roleLower.includes('readwrite')) return 'Read-Write'
  if (roleLower.includes('readonly')) return 'Read-Only'
  if (roleLower.includes('limited')) return 'Limited'
  
  return 'Custom'
}

/**
 * Download CSV file
 */
const downloadCSV = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  URL.revokeObjectURL(url)
}

/**
 * Export user access data to JSON
 */
export const exportUserAccessToJSON = (usersData: any[], accountInfo: any, options: {
  filename?: string
  pretty?: boolean
  includeMetadata?: boolean
} = {}) => {
  const { filename = 'user-access.json', pretty = true, includeMetadata = true } = options

  const data = {
    ...(includeMetadata && {
      metadata: {
        exportedAt: new Date().toISOString(),
        totalUsers: usersData.length,
        account: accountInfo
      }
    }),
    users: usersData
  }

  const jsonContent = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)
  downloadJSON(jsonContent, filename)
}

/**
 * Download JSON file
 */
const downloadJSON = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  URL.revokeObjectURL(url)
}

/**
 * Transform user access data for export
 */
export const transformUserAccessDataForExport = (userData: any, userProfile: any, accounts: any[]) => {
  return {
    ...userData,
    profile: userProfile,
    accounts: accounts.map(account => ({
      ...account,
      lastUpdated: new Date().toISOString()
    }))
  }
}

/**
 * Export access history events to CSV
 */
export const exportAccessHistoryToCSV = (events: any[], userInfo: any, filename?: string) => {
  const headers = [
    'Timestamp',
    'Event Name',
    'Service',
    'Account',
    'Region',
    'Source IP',
    'User Agent',
    'Success',
    'Error Code',
    'Resources'
  ]

  const rows = events.map(event => [
    escapeCSV(event.eventTime),
    escapeCSV(event.eventName),
    escapeCSV(event.eventSource?.split('.')[0] || ''),
    escapeCSV(event.recipientAccountId),
    escapeCSV(event.awsRegion),
    escapeCSV(event.sourceIPAddress),
    escapeCSV(event.userAgent?.split('/')[0] || event.userAgent),
    escapeCSV(event.errorCode ? 'No' : 'Yes'),
    escapeCSV(event.errorCode || ''),
    escapeCSV(event.resources?.map((r: any) => r.ARN || r.resourceName).join('; ') || '')
  ])

  const csvContent = [
    `# Access History for ${userInfo.displayName || userInfo.userPrincipalName}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Total Events: ${events.length}`,
    '',
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n')

  const defaultFilename = `access-history-${userInfo.userPrincipalName.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.csv`
  downloadCSV(csvContent, filename || defaultFilename)
}