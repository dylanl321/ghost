/**
 * Generate a CSV export from account data
 */
export function exportToCSV(enclaves: AWSEnclaveData[]) {
  const headers = [
    'Project Name',
    'requestID',
    'Comm ID', 
    'Gov ID', 
    'LOB', 
    'Status',
    'primaryAccountAdminUsername',
    'delegateAccountAdminUsername',
    'costManagerUsername'
  ]
  const rows = enclaves.map(e => [
    e.projectName || e.accountId,
    e.requestID || '',
    e.awsStandardAccountID || '',
    e.awsGovCloudAccountID || '',
    e.linesOfBusiness || 'IT',
    e.accountStatus || '',
    e.primaryAccountAdminUsername,
    e.delegateAccountAdminUsername,
    e.costManagerUsername
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