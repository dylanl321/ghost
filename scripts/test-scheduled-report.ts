#!/usr/bin/env tsx
/**
 * Create a test scheduled report for development
 * Usage: npm run test:scheduled-report <your-email@example.com>
 */

import { createReport } from '../server/utils/scheduled-reports'
import type { CreateReportRequest } from '../shared/types/scheduled-reports'

const USER_EMAIL = process.argv[2]

if (!USER_EMAIL) {
  console.error('❌ Error: Email address required')
  console.error('')
  console.error('Usage: npm run test:scheduled-report <your-email@example.com>')
  console.error('Example: npm run test:scheduled-report john@example.com')
  process.exit(1)
}

async function createTestReport() {
  console.log(`📊 Creating test scheduled report for ${USER_EMAIL}...`)
  console.log('')

  const reportRequest: CreateReportRequest = {
    reportName: 'Test Weekly Cost Report',
    description: 'Automated test report for development and testing',
    reportConfig: {
      accounts: [], // Empty = org-wide
      timeframe: 'lastMonth',
      dataMode: 'billable',
      viewType: 'summary',
      format: 'pdf',
      includeServices: true,
      includeHistorical: true,
      includeForecast: false
    },
    schedule: {
      frequency: 'weekly',
      dayOfWeek: 1, // Monday
      time: '09:00', // 9 AM
      timezone: 'America/New_York'
    },
    recipients: [USER_EMAIL],
    emailTemplate: {
      subject: 'Weekly AWS Cost Report - {{reportName}}',
      body: '', // Will use default template
      isCustom: false
    }
  }

  try {
    const report = await createReport(reportRequest, USER_EMAIL, false)

    console.log('✅ Test report created successfully!')
    console.log('')
    console.log('📋 Report Details:')
    console.log(`   ID: ${report.reportId}`)
    console.log(`   Name: ${report.reportName}`)
    console.log(`   Frequency: ${report.schedule.frequency}`)
    console.log(`   Next Run: ${new Date(report.nextRunTime).toLocaleString()}`)
    console.log(`   Recipients: ${report.recipients.join(', ')}`)
    console.log(`   Status: ${report.status}`)
    console.log('')
    console.log('🎯 Next Steps:')
    console.log('  1. View in UI: http://localhost:3000/reports/scheduled')
    console.log(`  2. Test immediately: curl -X POST http://localhost:3000/api/scheduled-reports/${report.reportId}/test`)
    console.log('  3. Wait for next scheduled run')
    console.log('')
    console.log('💡 Tip: The scheduler runs every minute and checks for due reports')

  } catch (error: any) {
    console.error('❌ Failed to create test report:', error.message)
    console.error('')
    console.error('Troubleshooting:')
    console.error('  • Ensure DynamoDB tables exist (run Terraform)')
    console.error('  • Check environment variables in .env')
    console.error('  • Verify AWS credentials and permissions')
    console.error('')
    console.error('Stack trace:', error.stack)
    process.exit(1)
  }
}

createTestReport()
