/**
 * GET /api/costs/test
 * Test cost API endpoints including proforma functionality
 */

import { defineEventHandler } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'

export default defineEventHandler(handleAsync(async (event) => {
  const now = new Date() // 2025-08-13
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1) // 2025-08-01
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1) // 2025-07-01
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0) // 2025-07-31
  
  // For forecasting, we need future dates
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1) // 2025-09-01
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0) // 2025-09-30
  
  const formatDate = (date: Date) => date.toISOString().split('T')[0]
  
  const testEndpoints = [
    {
      name: 'Standard Cost Summary',
      endpoint: `/api/costs/summary?startDate=${formatDate(lastMonth)}&endDate=${formatDate(lastMonthEnd)}&granularity=MONTHLY&groupBy=SERVICE`,
      description: 'Get standard cost summary for last month'
    },
    {
      name: 'Proforma Cost Summary',
      endpoint: `/api/costs/summary?startDate=${formatDate(lastMonth)}&endDate=${formatDate(lastMonthEnd)}&granularity=MONTHLY&groupBy=SERVICE&proforma=true`,
      description: 'Get proforma cost analysis for last month'
    },
    {
      name: 'Advanced Cost Analysis',
      endpoint: `/api/costs/analysis?startDate=${formatDate(lastMonth)}&endDate=${formatDate(lastMonthEnd)}&granularity=MONTHLY&groupBy=LINKED_ACCOUNT&includeBudget=true`,
      description: 'Comprehensive analysis with budget vs actual, trends, and anomalies'
    },
    {
      name: 'Advanced Analysis with Proforma',
      endpoint: `/api/costs/analysis?startDate=${formatDate(lastMonth)}&endDate=${formatDate(lastMonthEnd)}&granularity=MONTHLY&groupBy=LINKED_ACCOUNT&proforma=true&includeBudget=true`,
      description: 'Full analysis including proforma breakdown'
    },
    {
      name: 'Cost Forecast',
      endpoint: `/api/costs/forecast?startDate=${formatDate(nextMonth)}&endDate=${formatDate(nextMonthEnd)}&metric=UNBLENDED_COST&granularity=MONTHLY`,
      description: 'Get cost forecast for next month (September 2025)'
    },
    {
      name: 'Proforma Cost Forecast', 
      endpoint: `/api/costs/forecast?startDate=${formatDate(nextMonth)}&endDate=${formatDate(nextMonthEnd)}&metric=UNBLENDED_COST&granularity=MONTHLY&proforma=true`,
      description: 'Get proforma cost forecast for next month (September 2025)'
    }
  ]
  
  const result = {
    message: 'Cost API Test Endpoints',
    timestamp: new Date().toISOString(),
    testEndpoints,
    instructions: [
      '1. Test each endpoint individually to verify functionality',
      '2. Historical cost data uses July 2025 (2025-07-01 to 2025-07-31)',
      '3. Forecast data uses September 2025 (2025-09-01 to 2025-09-30) - must be future dates',
      '4. Standard endpoints work with both commercial and govcloud environments',
      '5. Proforma endpoints only work with commercial environment (will assume role into 253821132832)',
      '6. Proforma calculations: Master Account Cost = Total - Proforma Account Cost',
      '7. Master Account ID: 205950196477, Proforma Account ID: 253821132832'
    ],
    configuration: {
      defaultProformaAccountId: '253821132832',
      defaultMasterAccountId: '205950196477',
      requiredEnvironmentVariables: [
        'AWS_COMMERCIAL_ACCESS_KEY_ID',
        'AWS_COMMERCIAL_SECRET_ACCESS_KEY',
        'AWS_COMMERCIAL_REGION (optional, defaults to us-east-1)'
      ],
      roleAssumption: {
        roleName: process.env.AWS_ASSUME_ROLE_NAME || 'GDMSOrganizationsRole',
        externalId: process.env.AWS_ASSUME_ROLE_EXTERNAL_ID || 'Not configured',
        duration: process.env.AWS_ASSUME_ROLE_DURATION || '3600'
      }
    }
  }
  
  return sendSuccess(event, result)
}))