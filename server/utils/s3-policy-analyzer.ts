/**
 * S3 Bucket Policy Analyzer
 * Analyzes S3 bucket policies to identify security risks and cross-account access
 */

export interface BucketPolicyStatement {
  Sid?: string
  Effect: 'Allow' | 'Deny'
  Principal?: any
  NotPrincipal?: any
  Action?: string | string[]
  NotAction?: string | string[]
  Resource?: string | string[]
  Condition?: Record<string, any>
}

export interface BucketPolicy {
  Version: string
  /** A single statement object is valid policy JSON too */
  Statement: BucketPolicyStatement[] | BucketPolicyStatement
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
  /** Set when the policy could not be read; the other fields then say nothing about the bucket */
  error?: string
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

/** IAM action patterns are case-insensitive and use * and ? wildcards */
function actionPatternMatches(pattern: string, action: string): boolean {
  const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i')
  return regex.test(action)
}

/**
 * Whether a statement grants any of the given actions. Handles wildcard
 * patterns ("*", "s3:Get*") and NotAction, which grants everything except
 * the listed patterns.
 */
function grantsAnyAction(statement: BucketPolicyStatement, sensitive: string[]): boolean {
  if (statement.NotAction !== undefined) {
    const excluded = toArray(statement.NotAction)
    return sensitive.some(action => !excluded.some(pattern => actionPatternMatches(pattern, action)))
  }
  const patterns = toArray(statement.Action)
  return sensitive.some(action => patterns.some(pattern => actionPatternMatches(pattern, action)))
}

/** Principal "*" or {"AWS": "*"}; NotPrincipal on an Allow also opens access to everyone else */
function isPrincipalPublic(statement: BucketPolicyStatement): boolean {
  if (statement.NotPrincipal !== undefined) return true
  const principal = statement.Principal
  if (!principal) return false
  if (principal === '*') return true
  return toArray(principal.AWS).includes('*')
}

/** Account IDs named by ARN or as bare 12-digit IDs */
function extractAccountIds(principal: any): string[] {
  if (!principal || principal === '*') return []
  const values = typeof principal === 'string' ? [principal] : toArray(principal.AWS)
  const accountIds: string[] = []
  for (const value of values) {
    if (typeof value !== 'string' || value === '*') continue
    const match = value.match(/^arn:aws[^:]*:(?:iam|sts)::(\d{12}):/) || value.match(/^(\d{12})$/)
    if (match) accountIds.push(match[1])
  }
  return [...new Set(accountIds)]
}

const READ_ACTIONS = ['s3:GetObject', 's3:GetObjectVersion']
const WRITE_ACTIONS = ['s3:PutObject', 's3:DeleteObject', 's3:DeleteObjectVersion', 's3:PutBucketPolicy', 's3:PutBucketAcl']
const LIST_ACTIONS = ['s3:ListBucket', 's3:ListBucketVersions']

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

  const statements = toArray(policy.Statement)

  for (const statement of statements) {
    // Deny statements only restrict access
    if (statement.Effect !== 'Allow') continue

    toArray(statement.Action).forEach(action => allowedActions.add(action))
    if (statement.NotAction !== undefined) {
      allowedActions.add(`NotAction: ${toArray(statement.NotAction).join(', ')}`)
    }

    if (isPrincipalPublic(statement)) {
      const grantsRead = grantsAnyAction(statement, READ_ACTIONS)
      const grantsWrite = grantsAnyAction(statement, WRITE_ACTIONS)
      const grantsList = grantsAnyAction(statement, LIST_ACTIONS)

      // Conditions (source VPC, org ID, IP range) usually scope a wildcard
      // principal down; flag it for review rather than as public.
      if (statement.Condition) {
        if (grantsRead || grantsWrite || grantsList) {
          risks.push({
            severity: 'medium',
            finding: 'Wildcard principal limited by conditions; confirm the conditions restrict access',
            statement
          })
        }
        continue
      }

      isPublic = true
      if (grantsRead) {
        allowsPublicRead = true
        risks.push({ severity: 'critical', finding: 'Bucket allows public read access', statement })
      }
      if (grantsWrite) {
        allowsPublicWrite = true
        risks.push({ severity: 'critical', finding: 'Bucket allows public write access', statement })
      }
      if (grantsList) {
        allowsPublicList = true
        risks.push({ severity: 'high', finding: 'Bucket allows public list access', statement })
      }
    } else {
      for (const accountId of extractAccountIds(statement.Principal)) {
        if (accountId === bucketAccountId) continue
        allowsCrossAccount = true
        crossAccountPrincipals.push(accountId)

        const unrestricted = statement.NotAction !== undefined ||
          toArray(statement.Action).some(action => action === '*' || action.toLowerCase() === 's3:*')
        if (!statement.Condition && unrestricted) {
          risks.push({ severity: 'high', finding: `Grants unrestricted access to account ${accountId}`, statement })
        } else if (!statement.Condition) {
          risks.push({ severity: 'medium', finding: `Grants access to account ${accountId}`, statement })
        } else {
          risks.push({ severity: 'low', finding: `Grants conditional access to account ${accountId}`, statement })
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
    statements
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
