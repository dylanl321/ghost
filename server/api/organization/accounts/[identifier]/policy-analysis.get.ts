/**
 * GET /api/organization/accounts/[identifier]/policy-analysis
 * Analyze Service Control Policies to determine effective permissions and restrictions
 *
 * Returns comprehensive analysis of what actions are:
 * - Explicitly denied
 * - Conditionally allowed
 * - Restricted by specific SCPs
 */

import { defineEventHandler, getQuery, getRouterParam } from 'h3'
import { getPolicyDocument } from '../../../../utils/organizations'
import {
  parsePolicyDocument,
  analyzePolicies,
  type PolicyAnalysisResult,
  generatePlainLanguageSummary,
  generateRemediationSteps,
  translateConditionToEnglish,
  calculateServiceImpact,
  COMMON_AWS_ACTIONS,
  determinePolicyEvaluationOrder,
  generateAIPolicyAnalysis,
  type ParsedPolicy
} from '../../../../utils/policy-analyzer'
import { sendSuccess, errors, handleAsync } from '../../../../utils/api-response'
import { registerEndpoint } from '../../../../plugins/swagger'
import { logger } from '../../../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/organization/accounts/[identifier]/policy-analysis', 'GET', {
  summary: 'Analyze account SCP policies',
  description: 'Perform comprehensive analysis of Service Control Policies to determine effective permissions, denials, and restrictions. This endpoint fetches the full policy documents and analyzes statements to show which actions are denied or conditionally allowed.',
  tags: ['Organization'],
  parameters: [
    {
      name: 'identifier',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'Account identifier'
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['commercial', 'govcloud'],
        default: 'govcloud'
      },
      description: 'AWS environment to analyze'
    }
  ],
  responses: {
    200: {
      description: 'Policy analysis results'
    },
    400: { $ref: '#/components/schemas/Error' },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const identifier = getRouterParam(event, 'identifier') as string
  const query = getQuery(event)
  const environment = (query.environment as string) || 'govcloud'

  // Validate environment
  if (!['commercial', 'govcloud'].includes(environment)) {
    return errors.badRequest(event, 'Environment must be "commercial" or "govcloud"')
  }

  // First, get the governance data to find all policies
  let governanceData
  try {
    // Forward authentication headers for internal API call
    const headers: Record<string, string> = {}
    const authHeader = event.node.req.headers.authorization
    const cookieHeader = event.node.req.headers.cookie

    if (authHeader) headers['authorization'] = authHeader
    if (cookieHeader) headers['cookie'] = cookieHeader

    governanceData = await $fetch(`/api/organization/accounts/${identifier}/governance`, {
      query: { environment },
      headers
    })
  } catch (error: any) {
    logger.error('Failed to fetch governance data:', error)
    return errors.notFound(event, `Failed to fetch governance data: ${(error instanceof Error ? error.message : String(error)) || 'Unknown error'}`)
  }

  if (!governanceData.success) {
    return errors.notFound(event, `Failed to fetch governance data: ${governanceData.message}`)
  }

  const orgContext = governanceData.data.organizationalContext[environment]

  if (!orgContext) {
    return errors.notFound(event, `No organizational context found for ${environment} environment`)
  }

  // Collect all policies (direct + inherited)
  const allPolicies = orgContext.allPolicies || []

  logger.debug(`[Policy Analysis] Found ${allPolicies.length} policies for account ${identifier} in ${environment}`)

  if (allPolicies.length === 0) {
    return sendSuccess(event, {
      analysis: {
        services: {},
        summary: {
          totalPolicies: 0,
          totalStatements: 0,
          totalDenials: 0,
          totalConditionalDenials: 0,
          totalConditional: 0,
          mostRestrictedServices: [],
          hasFullAccess: false
        },
        allStatements: []
      },
      policies: [],
      account: governanceData.data.account,
      environment
    })
  }

  // Fetch full policy documents for each policy
  const parsedPolicies = []

  logger.info(`[Policy Analysis] Fetching full policy documents...`)

  for (const policy of allPolicies) {
    try {
      logger.info(`[Policy Analysis] Fetching policy: ${policy.name} (${policy.id})`)
      const policyDoc = await getPolicyDocument(policy.id, environment as any)

      if (policyDoc && policyDoc.content) {
        const parsed = parsePolicyDocument(
          policy.id,
          policy.name,
          policy.description,
          policyDoc.content,
          policy.source as 'direct' | 'inherited',
          policy.attachedAt || 'Unknown'
        )
        parsedPolicies.push(parsed)
        logger.info(`[Policy Analysis] Successfully parsed policy: ${policy.name}`)
      } else {
        logger.info(`[Policy Analysis] Policy document has no content: ${policy.name}`)
      }
    } catch (error) {
      logger.error(`[Policy Analysis] Failed to fetch policy document for ${policy.id}:`, error)
      // Continue with other policies even if one fails
    }
  }

  logger.info(`[Policy Analysis] Parsed ${parsedPolicies.length} policies, now analyzing...`)

  // Analyze all policies
  const analysis: PolicyAnalysisResult = analyzePolicies(parsedPolicies)

  logger.info(`[Policy Analysis] Analysis complete, enhancing with additional insights...`)

  // Generate policy evaluation order
  const evaluationOrder = determinePolicyEvaluationOrder(parsedPolicies)

  // Calculate service impact for each service
  const serviceImpacts: Record<string, any> = {}
  for (const [serviceName, serviceData] of Object.entries(analysis.services)) {
    serviceImpacts[serviceName] = calculateServiceImpact(serviceData, COMMON_AWS_ACTIONS)
  }

  // Generate plain language summaries for policies
  const policyEnhancements = parsedPolicies.map(policy => {
    const statements = policy.statements.map(stmt => ({
      sid: stmt.Sid,
      effect: stmt.Effect,
      plainLanguage: generatePlainLanguageSummary(stmt, policy.name),
      conditionsPlainEnglish: stmt.Condition ? translateConditionToEnglish(stmt.Condition) : []
    }))

    return {
      id: policy.id,
      name: policy.name,
      description: policy.description,
      source: policy.source,
      attachedAt: policy.attachedAt,
      statementCount: policy.statements.length,
      enhancedStatements: statements
    }
  })

  // Helper to match action against pattern with wildcard support
  const matchesActionPattern = (testAction: string, pattern: string): boolean => {
    // Convert wildcard pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    const regex = new RegExp(`^${regexPattern}$`, 'i')
    return regex.test(testAction)
  }

  // Test common actions with proper conditional logic
  const commonActionTests = [
    'ec2:RunInstances',
    'ec2:StopInstances',
    's3:CreateBucket',
    's3:PutObject',
    's3:DeleteObject',
    'iam:CreateUser',
    'iam:CreateRole',
    'lambda:CreateFunction',
    'rds:CreateDBInstance'
  ].map(action => {
    const service = action.split(':')[0]
    const serviceData = analysis.services[service]

    if (!serviceData) {
      return {
        action,
        result: analysis.summary.hasFullAccess ? 'allowed' : 'unknown',
        deniedBy: [],
        conditionalBy: [],
        explanation: analysis.summary.hasFullAccess
          ? 'Allowed by FullAWSAccess policy'
          : 'No policies found for this service'
      }
    }

    // Check for unconditional denials (no conditions = truly blocked)
    const unconditionalDenials = serviceData.deniedActions.filter(d =>
      !d.hasConditions && matchesActionPattern(action, d.action)
    )

    if (unconditionalDenials.length > 0) {
      return {
        action,
        result: 'denied',
        deniedBy: unconditionalDenials.flatMap(d =>
          d.statements.map(s => ({
            policyName: s.policyName,
            policyId: s.policyId
          }))
        ),
        conditionalBy: [],
        explanation: 'This action is unconditionally blocked by policy - no conditions will allow it'
      }
    }

    // Check for conditional denials (Deny with conditions = security requirements)
    const conditionalDenials = serviceData.deniedActions.filter(d =>
      d.hasConditions && matchesActionPattern(action, d.action)
    )

    // Check for conditional allows
    const conditionalAllows = serviceData.conditionalActions.filter(c =>
      matchesActionPattern(action, c.action)
    )

    // Conditional denials mean "allowed IF you meet security requirements"
    if (conditionalDenials.length > 0 || conditionalAllows.length > 0) {
      return {
        action,
        result: 'conditional',
        deniedBy: [],
        conditionalBy: [
          ...conditionalDenials.flatMap(d =>
            d.statements.map(s => ({
              policyName: s.policyName,
              policyId: s.policyId,
              type: 'security-requirement' as const
            }))
          ),
          ...conditionalAllows.flatMap(c =>
            c.statements.map(s => ({
              policyName: s.policyName,
              policyId: s.policyId,
              type: 'conditional-allow' as const
            }))
          )
        ],
        explanation: conditionalDenials.length > 0
          ? 'Allowed when security requirements are met (e.g., MFA enabled, approved IP, etc.)'
          : 'Allowed under specific conditions'
      }
    }

    // No denials or conditions found - allowed by FullAWSAccess
    return {
      action,
      result: analysis.summary.hasFullAccess ? 'allowed' : 'unknown',
      deniedBy: [],
      conditionalBy: [],
      explanation: analysis.summary.hasFullAccess
        ? 'Allowed by FullAWSAccess policy with no additional restrictions'
        : 'No explicit allow or deny policies found'
    }
  })

  // Generate AI analysis (async, but we'll await it)
  let aiAnalysis = null
  try {
    logger.info(`[Policy Analysis] Generating AI-powered insights...`)
    aiAnalysis = await generateAIPolicyAnalysis(
      analysis,
      parsedPolicies,
      {
        name: governanceData.data.account?.accountName || governanceData.data.account?.accountId || identifier,
        id: governanceData.data.account?.accountId || identifier,
        environment: environment
      }
    )
    logger.info(`[Policy Analysis] AI analysis complete`)
  } catch (error) {
    logger.error('[Policy Analysis] AI analysis failed:', error)
    // Continue without AI analysis if it fails
  }

  logger.info(`[Policy Analysis] All enhancements complete, returning results`)

  return sendSuccess(event, {
    analysis,
    policies: policyEnhancements,
    evaluationOrder: evaluationOrder.map(e => ({
      policyName: e.policy.name,
      policyId: e.policy.id,
      order: e.order,
      precedence: e.precedence,
      reasoning: e.reasoning,
      source: e.policy.source,
      attachedAt: e.policy.attachedAt
    })),
    serviceImpacts,
    commonActionTests,
    aiInsights: aiAnalysis,
    account: governanceData.data.account,
    environment,
    metadata: {
      analyzedPolicies: parsedPolicies.length,
      totalPolicies: allPolicies.length,
      timestamp: new Date().toISOString(),
      featuresIncluded: [
        'plainLanguageSummaries',
        'remediationSteps',
        'serviceImpact',
        'evaluationOrder',
        'commonActionTests',
        aiAnalysis ? 'aiInsights' : null
      ].filter(Boolean)
    }
  })
}))
