/**
 * S3 Bucket Policy Analyzer
 * Analyzes S3 bucket policies to identify security risks and cross-account access
 */

export interface BucketPolicyStatement {
  Sid?: string
  Effect: 'Allow' | 'Deny'
  Principal: any
  Action: string | string[]
  Resource: string | string[]
  Condition?: Record<string, any>
}

export interface BucketPolicy {
  Version: string
  Statement: BucketPolicyStatement[]
  Id?: string
}

export interface BucketPolicyAnalysis {
  bucketName: string
  hasPolicy: boolean
  isPublic: boolean
  allowsCrossAccount: boolean
  crossAccountPrincipals: string[]
  publicAccess: {
    allowsPublicRead: boolean
    allowsPublicWrite: boolean
    allowsPublicList: boolean
  }
  risks: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low'
    finding: string
    statement: BucketPolicyStatement
  }>
  allowedActions: string[]
  statements: BucketPolicyStatement[]
}

/**
 * Normalize actions to array format
 */
function normalizeActions(action: string | string[] | undefined): string[] {
  if (!action) return []
  return Array.isArray(action) ? action : [action]
}

/**
 * Check if principal allows public access
 */
function isPrincipalPublic(principal: any): boolean {
  if (!principal) return false

  // Check for wildcard principals
  if (principal === '*') return true
  if (principal.AWS === '*') return true
  if (Array.isArray(principal.AWS) && principal.AWS.includes('*')) return true

  return false
}

/**
 * Extract account IDs from principals
 */
function extractAccountIds(principal: any): string[] {
  const accountIds: string[] = []

  if (!principal || principal === '*') return accountIds

  if (typeof principal === 'string') {
    // Extract account ID from ARN
    const match = principal.match(/arn:aws[^:]*::(\d{12}):/)
    if (match) accountIds.push(match[1])
  } else if (principal.AWS) {
    const awsPrincipals = Array.isArray(principal.AWS) ? principal.AWS : [principal.AWS]
    for (const arn of awsPrincipals) {
      if (typeof arn === 'string' && arn !== '*') {
        const match = arn.match(/arn:aws[^:]*::(\d{12}):/)
        if (match) accountIds.push(match[1])
      }
    }
  } else if (principal.Service) {
    // AWS service principals (not cross-account)
    return []
  }

  return [...new Set(accountIds)]
}

/**
 * Check if actions allow read access
 */
function allowsReadAccess(actions: string[]): boolean {
  const readActions = ['s3:GetObject', 's3:GetObjectVersion', 's3:ListBucket', 's3:*']
  return actions.some(action =>
    readActions.some(readAction =>
      action === readAction || action.match(new RegExp(readAction.replace('*', '.*')))
    )
  )
}

/**
 * Check if actions allow write access
 */
function allowsWriteAccess(actions: string[]): boolean {
  const writeActions = ['s3:PutObject', 's3:DeleteObject', 's3:*']
  return actions.some(action =>
    writeActions.some(writeAction =>
      action === writeAction || action.match(new RegExp(writeAction.replace('*', '.*')))
    )
  )
}

/**
 * Check if actions allow list access
 */
function allowsListAccess(actions: string[]): boolean {
  const listActions = ['s3:ListBucket', 's3:ListBucketVersions', 's3:*']
  return actions.some(action =>
    listActions.some(listAction =>
      action === listAction || action.match(new RegExp(listAction.replace('*', '.*')))
    )
  )
}

/**
 * Analyze a bucket policy
 */
export function analyzeBucketPolicy(
  bucketName: string,
  policy: BucketPolicy | null,
  bucketAccountId: string
): BucketPolicyAnalysis {
  if (!policy) {
    return {
      bucketName,
      hasPolicy: false,
      isPublic: false,
      allowsCrossAccount: false,
      crossAccountPrincipals: [],
      publicAccess: {
        allowsPublicRead: false,
        allowsPublicWrite: false,
        allowsPublicList: false
      },
      risks: [],
      allowedActions: [],
      statements: []
    }
  }

  const risks: Array<{
    severity: 'critical' | 'high' | 'medium' | 'low'
    finding: string
    statement: BucketPolicyStatement
  }> = []
  const crossAccountPrincipals: string[] = []
  const allowedActions = new Set<string>()

  let isPublic = false
  let allowsPublicRead = false
  let allowsPublicWrite = false
  let allowsPublicList = false
  let allowsCrossAccount = false

  for (const statement of policy.Statement) {
    // Skip Deny statements for now (they restrict access)
    if (statement.Effect === 'Deny') continue

    const actions = normalizeActions(statement.Action)
    actions.forEach(action => allowedActions.add(action))

    // Check for public access
    if (isPrincipalPublic(statement.Principal)) {
      isPublic = true

      if (allowsReadAccess(actions)) {
        allowsPublicRead = true
        risks.push({
          severity: 'critical',
          finding: 'Bucket allows public read access',
          statement
        })
      }

      if (allowsWriteAccess(actions)) {
        allowsPublicWrite = true
        risks.push({
          severity: 'critical',
          finding: 'Bucket allows public write access',
          statement
        })
      }

      if (allowsListAccess(actions)) {
        allowsPublicList = true
        risks.push({
          severity: 'high',
          finding: 'Bucket allows public list access',
          statement
        })
      }
    } else {
      // Check for cross-account access
      const principalAccountIds = extractAccountIds(statement.Principal)

      for (const accountId of principalAccountIds) {
        if (accountId !== bucketAccountId) {
          allowsCrossAccount = true
          crossAccountPrincipals.push(accountId)

          // Check if it's intentional (has conditions or limited actions)
          if (!statement.Condition && actions.includes('s3:*')) {
            risks.push({
              severity: 'high',
              finding: `Grants unrestricted access to account ${accountId}`,
              statement
            })
          } else if (!statement.Condition) {
            risks.push({
              severity: 'medium',
              finding: `Grants access to account ${accountId}`,
              statement
            })
          } else {
            risks.push({
              severity: 'low',
              finding: `Grants conditional access to account ${accountId}`,
              statement
            })
          }
        }
      }
    }
  }

  return {
    bucketName,
    hasPolicy: true,
    isPublic,
    allowsCrossAccount,
    crossAccountPrincipals: [...new Set(crossAccountPrincipals)],
    publicAccess: {
      allowsPublicRead,
      allowsPublicWrite,
      allowsPublicList
    },
    risks,
    allowedActions: Array.from(allowedActions),
    statements: policy.Statement
  }
}

/**
 * Analyze multiple bucket policies
 */
export function analyzeBucketPolicies(
  buckets: Array<{ name: string; policy: BucketPolicy | null; accountId: string }>
): Map<string, BucketPolicyAnalysis> {
  const analyses = new Map<string, BucketPolicyAnalysis>()

  for (const bucket of buckets) {
    const analysis = analyzeBucketPolicy(bucket.name, bucket.policy, bucket.accountId)
    analyses.set(bucket.name, analysis)
  }

  return analyses
}

/**
 * Generate summary statistics for bucket policy analysis
 */
export function generatePolicySummary(analyses: BucketPolicyAnalysis[]): {
  totalBuckets: number
  bucketsWithPolicies: number
  publicBuckets: number
  crossAccountBuckets: number
  criticalRisks: number
  highRisks: number
  mediumRisks: number
  lowRisks: number
} {
  return {
    totalBuckets: analyses.length,
    bucketsWithPolicies: analyses.filter(a => a.hasPolicy).length,
    publicBuckets: analyses.filter(a => a.isPublic).length,
    crossAccountBuckets: analyses.filter(a => a.allowsCrossAccount).length,
    criticalRisks: analyses.reduce((sum, a) => sum + a.risks.filter(r => r.severity === 'critical').length, 0),
    highRisks: analyses.reduce((sum, a) => sum + a.risks.filter(r => r.severity === 'high').length, 0),
    mediumRisks: analyses.reduce((sum, a) => sum + a.risks.filter(r => r.severity === 'medium').length, 0),
    lowRisks: analyses.reduce((sum, a) => sum + a.risks.filter(r => r.severity === 'low').length, 0)
  }
}
