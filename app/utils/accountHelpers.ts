import { getMonthlyBudget } from '#shared/utils/budget-utils'

/**
 * Generate a comprehensive CSV export from account data
 * Includes all relevant fields from DynamoDB and Organizations
 */
export function exportToCSV(enclaves: AWSEnclaveData[]) {
  const headers = [
    // Basic Info
    'Project Name',
    'Request ID',
    'Commercial Account ID',
    'GovCloud Account ID',
    'Account Email',
    'Account Alias',

    // Classification
    'Line of Business',
    'Enclave Status',
    'Account Status',
    'Data Type',
    'Approved Data Type',
    'Enclave Type',

    // Technical Details
    'Platform Type',
    'Region',
    'Environment',
    'Is SAWSE',
    'Is Direct Connect',
    'Provisioned with Terraform',
    'Isolated Enclave',

    // Project Details
    'Project Type',
    'Project Number',
    'Intended Use',
    'SSP Type',
    'Task Number',

    // Personnel
    'Primary Admin Username',
    'Primary Admin Name',
    'Delegate Admin Username',
    'Delegate Admin Name',
    'Cost Manager Username',
    'Cost Manager Name',
    'Technical Contact',
    'Business Contact',
    'Authorizing Manager Username',
    'Authorizing Manager Name',
    'BA Username',
    'BA Name',
    'IA Username',
    'IA Name',
    'LaaS Site Lead Username',
    'LaaS Site Lead Name',

    // Financial
    'Cost Center',
    'Department Number',
    'Estimated Monthly Charge',
    'Effective Monthly Budget',

    // External Collaboration
    'External Collab Approved',
    'External Collab Details',

    // Networking (Direct Connect)
    'DC Region',
    'DC CIDR',
    'DC Subnet Mask',
    'DC TGW Subnet Mask',

    // StackSets
    'IAM Commercial StackSet',
    'Monitoring Commercial StackSet',

    // Organizations Data
    'Organization ARN',
    'Organizational Unit',
    'Parent ID',
    'Joined Method',
    'Joined Timestamp',

    // Metadata
    'Modified Date',
    'Comments',
    'Record Link',
    'Source'
  ]

  const rows = enclaves.map(e => [
    // Basic Info
    e.projectName || e.accountId || '',
    e.requestID || e.requestId || '',
    e.awsStandardAccountID || e.accountId || '',
    e.awsGovCloudAccountID || '',
    e.awsAccountEmail || e.accountEmail || '',
    e.accountAlias || '',

    // Classification
    e.linesOfBusiness || 'IT',
    e.enclaveStatus || '',
    e.accountStatus || e.status || '',
    e.dataType || '',
    e.approvedDataType || '',
    e.enclaveType || '',

    // Technical Details
    e.platformType || '',
    e.region || '',
    e.environment || '',
    e.isAWSStdEnv ? 'Yes' : 'No',
    e.isDirectConnect ? 'Yes' : 'No',
    e.provisionedWithTf ? 'Yes' : 'No',
    e.isolatedEnclave || '',

    // Project Details
    e.projectType || '',
    e.projectNumber || '',
    e.intendedUse || '',
    e.SSPtype || '',
    e.taskNumber || '',

    // Personnel
    e.primaryAccountAdminUsername || '',
    e.primaryAccountAdminName || '',
    e.delegateAccountAdminUsername || '',
    e.delegateAccountAdminName || '',
    e.costManagerUsername || '',
    e.costManagerName || '',
    e.technicalContact || '',
    e.businessContact || '',
    e.authorizingManagerUsername || '',
    e.authorizingManagerName || '',
    e.BAUsername || '',
    e.BAName || '',
    e.IAUsername || '',
    e.IAName || '',
    e.laaSiteLeadUsername || '',
    e.laaSiteLeadName || '',

    // Financial
    e.costCenter || '',
    e.departmentNumber || '',
    e.estimatedMonthlyCharge || '',
    getMonthlyBudget(e) || '',

    // External Collaboration
    e.extCollabApproved ? 'Yes' : 'No',
    e.extCollabDetails || '',

    // Networking (Direct Connect)
    e.dc_region || '',
    e.dc_cidr || '',
    e.dc_subnet_mask || '',
    e.dc_tgw_subnet_mask || '',

    // StackSets
    e.iamCommercialStackSet || '',
    e.monitoringCommercialStackSet || '',

    // Organizations Data
    e.organizationArn || '',
    e.organizationalUnit || '',
    e.parentId || '',
    e.joinedMethod || '',
    e.joinedTimestamp || '',

    // Metadata
    e.modifiedDate || '',
    e.comments || '',
    e.recordLink || '',
    e.source || ''
  ])

  // Escape each cell value for CSV (wrap in quotes and escape quotes)
  const escapedRows = rows.map(row =>
    row.map(v => `"${String(v).replace(/"/g, '""')}"`)
  )
  const csvRows = escapedRows.map(row => row.join(',')) // Join each row's values into a comma-separated string
  const allRows = [headers.join(','), ...csvRows] // Add headers to the top
  const csvContent = allRows.join('\n') // Join all rows into the final CSV text

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = 'enclaves.csv'
  link.click()
  URL.revokeObjectURL(link.href)
}