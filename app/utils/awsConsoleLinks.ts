/**
 * AWS Console Links Utility
 * Generates deep links to AWS console for various services via IDC (Identity Center)
 */

export interface ConsoleLink {
  label: string
  icon: string
  url: string
  description?: string
}

export interface RoleLink {
  label: string
  icon: string
  url: string
  roleName: string
  accountId: string
  isGovCloud: boolean
}

/**
 * Get the IDC (Identity Center) portal URL for the environment
 */
function getIdcPortalUrl(isGovCloud: boolean): string {
  if (isGovCloud) {
    return 'https://start.us-gov-west-1.us-gov-home.awsapps.com/directory/gd'
  }
  return 'https://gdms.awsapps.com/start'
}

/**
 * Get the switch role signin URL for the environment
 */
function getSwitchRoleBaseUrl(isGovCloud: boolean): string {
  if (isGovCloud) {
    return 'https://signin.amazonaws-us-gov.com'
  }
  return 'https://signin.aws.amazon.com'
}

/**
 * Get the base console URL for the environment
 */
function getConsoleBaseUrl(isGovCloud: boolean): string {
  if (isGovCloud) {
    return 'https://console.amazonaws-us-gov.com'
  }
  return 'https://console.aws.amazon.com'
}

/**
 * Get central auditing account ID and role for the environment
 */
function getCentralAuditingAccount(isGovCloud: boolean): { accountId: string, roleName: string } {
  if (isGovCloud) {
    return {
      accountId: '705066229423',
      roleName: 'GDSSO_CustomerSupport'
    }
  }
  return {
    accountId: '887522691420',
    roleName: 'GDSSO_VPC_Support'
  }
}

/**
 * Get default region for the environment
 */
function getDefaultRegion(isGovCloud: boolean): string {
  if (isGovCloud) {
    return 'us-gov-west-1'
  }
  return 'us-east-1'
}

/**
 * Generate IDC role-specific login link (direct account access)
 * Creates a direct link to log into a specific account with a specific role via IDC
 */
export function getIdcRoleLink(accountId: string, roleName: string, isGovCloud: boolean): RoleLink {
  const idcBaseUrl = getIdcPortalUrl(isGovCloud)
  const url = `${idcBaseUrl}#/console?account_id=${accountId}&role_name=${roleName}`

  return {
    label: roleName,
    icon: isGovCloud ? 'i-heroicons-shield-check' : 'i-heroicons-cloud',
    url,
    roleName,
    accountId,
    isGovCloud
  }
}

/**
 * Generate IDC (Identity Center) login link (portal home)
 * This is the primary way to access AWS accounts via role assumption
 */
export function getIdcLoginLink(isGovCloud: boolean = false): ConsoleLink {
  return {
    label: 'IDC Portal Home',
    icon: 'i-heroicons-home',
    url: getIdcPortalUrl(isGovCloud),
    description: `Access AWS ${isGovCloud ? 'GovCloud' : 'Commercial'} Identity Center portal`
  }
}

/**
 * Get admin support roles for central auditing accounts
 * These roles log into hub accounts and can switch to the target account
 */
export function getAdminSupportRoles(
  commercialAccountId: string,
  govCloudAccountId: string | undefined,
  accountName?: string
): RoleLink[] {
  const roles: RoleLink[] = []
  const switchRoleBaseUrl = getSwitchRoleBaseUrl(false) // Commercial
  const govSwitchRoleBaseUrl = getSwitchRoleBaseUrl(true) // GovCloud

  // Commercial VPC Support - always available
  const commercialDisplayName = accountName ? accountName.replace(/\s+/g, '-') : `Account-${commercialAccountId}`
  const commercialSwitchUrl = `${switchRoleBaseUrl}/switchrole?roleName=VPC_Support&account=${commercialAccountId}&displayName=${commercialDisplayName}`
  const commercialUrl = `${getIdcPortalUrl(false)}#/console?account_id=887522691420&role_name=GDSSO_VPC_Support&destination=${encodeURIComponent(commercialSwitchUrl)}`

  roles.push({
    label: 'VPC Support (Commercial)',
    icon: 'i-heroicons-wrench-screwdriver',
    url: commercialUrl,
    roleName: 'GDSSO_VPC_Support',
    accountId: '887522691420',
    isGovCloud: false
  })

  // GovCloud Customer Support - only if GovCloud account exists
  if (govCloudAccountId) {
    const govCloudDisplayName = accountName ? accountName.replace(/\s+/g, '-') : `Account-${govCloudAccountId}`
    const govCloudSwitchUrl = `${govSwitchRoleBaseUrl}/switchrole?roleName=CustomerSupport&account=${govCloudAccountId}&displayName=${govCloudDisplayName}`
    const govCloudUrl = `${getIdcPortalUrl(true)}#/console?account_id=705066229423&role_name=GDSSO_CustomerSupport&destination=${encodeURIComponent(govCloudSwitchUrl)}`

    roles.push({
      label: 'Customer Support (GovCloud)',
      icon: 'i-heroicons-wrench-screwdriver',
      url: govCloudUrl,
      roleName: 'GDSSO_CustomerSupport',
      accountId: '705066229423',
      isGovCloud: true
    })
  }

  return roles
}

/**
 * Generate AWS Console home link
 */
export function getConsoleHomeLink(accountId: string, isGovCloud: boolean = false): string {
  const baseUrl = getConsoleBaseUrl(isGovCloud)
  const region = getDefaultRegion(isGovCloud)
  return `${baseUrl}/console/home?region=${region}`
}

/**
 * Generate deep links to common AWS services
 */
export function getServiceLinks(accountId: string, isGovCloud: boolean = false): ConsoleLink[] {
  const baseUrl = getConsoleBaseUrl(isGovCloud)
  const region = getDefaultRegion(isGovCloud)

  const links: ConsoleLink[] = [
    {
      label: 'Console Home',
      icon: 'i-heroicons-home',
      url: `${baseUrl}/console/home?region=${region}`,
      description: 'AWS Management Console home'
    },
    {
      label: 'Billing Dashboard',
      icon: 'i-heroicons-currency-dollar',
      url: `${baseUrl}/billing/home?region=${region}#/`,
      description: 'View account billing and costs'
    },
    {
      label: 'IAM Console',
      icon: 'i-heroicons-shield-check',
      url: `${baseUrl}/iam/home?region=${region}`,
      description: 'Manage users, roles, and permissions'
    },
    {
      label: 'EC2 Dashboard',
      icon: 'i-heroicons-server',
      url: `${baseUrl}/ec2/home?region=${region}`,
      description: 'View and manage EC2 instances'
    },
    {
      label: 'S3 Console',
      icon: 'i-heroicons-circle-stack',
      url: `${baseUrl}/s3/home?region=${region}`,
      description: 'Manage S3 buckets and objects'
    },
    {
      label: 'CloudWatch',
      icon: 'i-heroicons-chart-bar',
      url: `${baseUrl}/cloudwatch/home?region=${region}`,
      description: 'Monitor resources and logs'
    },
    {
      label: 'VPC Console',
      icon: 'i-heroicons-globe-alt',
      url: `${baseUrl}/vpc/home?region=${region}`,
      description: 'Manage virtual private clouds'
    },
    {
      label: 'RDS Console',
      icon: 'i-heroicons-database',
      url: `${baseUrl}/rds/home?region=${region}`,
      description: 'Manage RDS databases'
    },
    {
      label: 'Lambda Console',
      icon: 'i-heroicons-bolt',
      url: `${baseUrl}/lambda/home?region=${region}`,
      description: 'Manage Lambda functions'
    },
    {
      label: 'CloudFormation',
      icon: 'i-heroicons-document-text',
      url: `${baseUrl}/cloudformation/home?region=${region}`,
      description: 'View infrastructure stacks'
    }
  ]

  return links
}

/**
 * Get quick access links (most common services)
 */
export function getQuickAccessLinks(accountId: string, isGovCloud: boolean = false): ConsoleLink[] {
  const allLinks = getServiceLinks(accountId, isGovCloud)
  // Return the most commonly used services
  return allLinks.filter(link => 
    ['Console Home', 'Billing Dashboard', 'EC2 Dashboard', 'S3 Console', 'CloudWatch'].includes(link.label)
  )
}

/**
 * Generate Cost Explorer link with account filter
 */
export function getCostExplorerLink(accountId: string, isGovCloud: boolean = false): string {
  const baseUrl = getConsoleBaseUrl(isGovCloud)
  const region = getDefaultRegion(isGovCloud)
  return `${baseUrl}/cost-management/home?region=${region}#/cost-explorer`
}

/**
 * Generate CloudWatch dashboard link
 */
export function getCloudWatchDashboardLink(accountId: string, isGovCloud: boolean = false, dashboardName?: string): string {
  const baseUrl = getConsoleBaseUrl(isGovCloud)
  const region = getDefaultRegion(isGovCloud)
  
  if (dashboardName) {
    return `${baseUrl}/cloudwatch/home?region=${region}#dashboards:name=${dashboardName}`
  }
  
  return `${baseUrl}/cloudwatch/home?region=${region}#dashboards:`
}

/**
 * Generate Systems Manager Session Manager link
 */
export function getSessionManagerLink(accountId: string, isGovCloud: boolean = false): string {
  const baseUrl = getConsoleBaseUrl(isGovCloud)
  const region = getDefaultRegion(isGovCloud)
  return `${baseUrl}/systems-manager/session-manager?region=${region}`
}

