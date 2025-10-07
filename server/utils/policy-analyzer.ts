/**
 * AWS SCP Policy Analyzer
 * Parses and analyzes Service Control Policies to determine effective permissions
 */

export interface PolicyStatement {
  Sid?: string
  Effect: 'Allow' | 'Deny'
  Action: string | string[]
  NotAction?: string | string[]
  Resource?: string | string[]
  NotResource?: string | string[]
  Condition?: Record<string, any>
  Principal?: any
}

export interface PolicyDocument {
  Version: string
  Statement: PolicyStatement[]
  Id?: string
}

export interface ParsedPolicy {
  id: string
  name: string
  description?: string
  statements: PolicyStatement[]
  source: 'direct' | 'inherited'
  attachedAt: string
}

export interface ServiceRestriction {
  service: string
  deniedActions: Array<{
    action: string
    hasConditions: boolean
    conditions: any[]
    statements: Array<{
      policyId: string
      policyName: string
      statement: PolicyStatement
    }>
  }>
  conditionalActions: Array<{
    action: string
    conditions: any[]
    statements: Array<{
      policyId: string
      policyName: string
      statement: PolicyStatement
    }>
  }>
  restrictedBy: string[] // Policy names
}

export interface PolicyAnalysisResult {
  services: Record<string, ServiceRestriction>
  summary: {
    totalPolicies: number
    totalStatements: number
    totalDenials: number
    totalConditionalDenials: number
    totalConditional: number
    mostRestrictedServices: string[]
    hasFullAccess: boolean
  }
  allStatements: Array<{
    policyId: string
    policyName: string
    statement: PolicyStatement
  }>
}

/**
 * Normalize action to array format
 */
function normalizeActions(action: string | string[] | undefined): string[] {
  if (!action) return []
  return Array.isArray(action) ? action : [action]
}

/**
 * Extract service name from action (e.g., "s3:PutObject" -> "s3")
 */
function extractService(action: string): string {
  const parts = action.split(':')
  return parts[0]?.toLowerCase() || 'unknown'
}

/**
 * Check if action matches pattern (supports wildcards)
 */
function matchesPattern(action: string, pattern: string): boolean {
  // Convert wildcard pattern to regex
  const regexPattern = pattern
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')

  const regex = new RegExp(`^${regexPattern}$`, 'i')
  return regex.test(action)
}

/**
 * Parse policy document and extract statements
 */
export function parsePolicyDocument(
  policyId: string,
  policyName: string,
  description: string | undefined,
  content: PolicyDocument,
  source: 'direct' | 'inherited',
  attachedAt: string
): ParsedPolicy {
  return {
    id: policyId,
    name: policyName,
    description,
    statements: content.Statement || [],
    source,
    attachedAt
  }
}

/**
 * Analyze multiple SCPs to determine effective permissions
 *
 * SCP Logic:
 * - Multiple SCPs are combined with AND logic
 * - If ANY SCP has a Deny, the action is denied
 * - Default is deny unless explicitly allowed
 * - FullAWSAccess policy allows everything (unless overridden by Deny)
 */
export function analyzePolicies(policies: ParsedPolicy[]): PolicyAnalysisResult {
  const services: Record<string, ServiceRestriction> = {}
  const allStatements: Array<{
    policyId: string
    policyName: string
    statement: PolicyStatement
  }> = []

  let totalDenials = 0
  let totalConditional = 0
  let hasFullAccess = false

  // Check if FullAWSAccess policy exists
  hasFullAccess = policies.some(p => p.name === 'FullAWSAccess')

  // Process each policy
  for (const policy of policies) {
    for (const statement of policy.statements) {
      allStatements.push({
        policyId: policy.id,
        policyName: policy.name,
        statement
      })

      const actions = normalizeActions(statement.Action)
      const notActions = normalizeActions(statement.NotAction)

      // Process regular actions
      for (const action of actions) {
        const service = extractService(action)

        // Initialize service if needed
        if (!services[service]) {
          services[service] = {
            service,
            deniedActions: [],
            conditionalActions: [],
            restrictedBy: []
          }
        }

        // Track which policies restrict this service
        if (!services[service].restrictedBy.includes(policy.name)) {
          services[service].restrictedBy.push(policy.name)
        }

        // Process Deny statements
        if (statement.Effect === 'Deny') {
          totalDenials++

          // Check if this action is already in deniedActions
          let existingDenial = services[service].deniedActions.find(d => d.action === action)

          if (!existingDenial) {
            existingDenial = {
              action,
              hasConditions: false,
              conditions: [],
              statements: []
            }
            services[service].deniedActions.push(existingDenial)
          }

          // Track conditions for Deny statements
          if (statement.Condition) {
            existingDenial.hasConditions = true
            existingDenial.conditions.push(statement.Condition)
          }

          existingDenial.statements.push({
            policyId: policy.id,
            policyName: policy.name,
            statement
          })
        }

        // Process Allow statements with conditions
        if (statement.Effect === 'Allow' && statement.Condition) {
          totalConditional++

          let existingConditional = services[service].conditionalActions.find(
            c => c.action === action
          )

          if (!existingConditional) {
            existingConditional = {
              action,
              conditions: [],
              statements: []
            }
            services[service].conditionalActions.push(existingConditional)
          }

          existingConditional.conditions.push(statement.Condition)
          existingConditional.statements.push({
            policyId: policy.id,
            policyName: policy.name,
            statement
          })
        }
      }

      // Process NotAction (everything EXCEPT these actions)
      if (notActions.length > 0 && statement.Effect === 'Deny') {
        // NotAction with Deny means "deny everything except these"
        // This is complex - we'll just note it exists
        for (const notAction of notActions) {
          const service = extractService(notAction)
          if (!services[service]) {
            services[service] = {
              service,
              deniedActions: [],
              conditionalActions: [],
              restrictedBy: []
            }
          }
          if (!services[service].restrictedBy.includes(policy.name)) {
            services[service].restrictedBy.push(policy.name)
          }
        }
      }
    }
  }

  // Calculate conditional denials
  let totalConditionalDenials = 0
  for (const service of Object.values(services)) {
    for (const denial of service.deniedActions) {
      if (denial.hasConditions) {
        totalConditionalDenials++
      }
    }
  }

  // Calculate most restricted services (by number of denials)
  const serviceEntries = Object.entries(services)
  const mostRestrictedServices = serviceEntries
    .sort((a, b) => b[1].deniedActions.length - a[1].deniedActions.length)
    .slice(0, 5)
    .map(([service]) => service)

  return {
    services,
    summary: {
      totalPolicies: policies.length,
      totalStatements: allStatements.length,
      totalDenials,
      totalConditionalDenials,
      totalConditional,
      mostRestrictedServices,
      hasFullAccess
    },
    allStatements
  }
}

/**
 * Search for specific action across all policies
 */
export function searchAction(
  analysis: PolicyAnalysisResult,
  searchAction: string
): {
  isDenied: boolean
  isConditional: boolean
  matchingDenials: any[]
  matchingConditionals: any[]
} {
  const matchingDenials: any[] = []
  const matchingConditionals: any[] = []

  const service = extractService(searchAction)
  const serviceRestrictions = analysis.services[service]

  if (serviceRestrictions) {
    // Check denials
    for (const denial of serviceRestrictions.deniedActions) {
      if (matchesPattern(searchAction, denial.action)) {
        matchingDenials.push(denial)
      }
    }

    // Check conditionals
    for (const conditional of serviceRestrictions.conditionalActions) {
      if (matchesPattern(searchAction, conditional.action)) {
        matchingConditionals.push(conditional)
      }
    }
  }

  return {
    isDenied: matchingDenials.length > 0,
    isConditional: matchingConditionals.length > 0,
    matchingDenials,
    matchingConditionals
  }
}

/**
 * Get human-readable description of a condition
 */
export function describeCondition(condition: Record<string, any>): string[] {
  const descriptions: string[] = []

  for (const [operator, values] of Object.entries(condition)) {
    for (const [key, value] of Object.entries(values as Record<string, any>)) {
      const valueStr = Array.isArray(value) ? value.join(', ') : String(value)
      descriptions.push(`${operator}: ${key} = ${valueStr}`)
    }
  }

  return descriptions
}

/**
 * Translate IAM conditions to plain English
 */
export function translateConditionToEnglish(condition: Record<string, any>): string[] {
  const translations: string[] = []

  const conditionTranslations: Record<string, string> = {
    'StringEquals': 'must equal',
    'StringNotEquals': 'must not equal',
    'StringLike': 'must match',
    'StringNotLike': 'must not match',
    'NumericEquals': 'must equal',
    'NumericLessThan': 'must be less than',
    'NumericGreaterThan': 'must be greater than',
    'Bool': 'must be',
    'IpAddress': 'must be from IP address',
    'NotIpAddress': 'must NOT be from IP address',
    'DateLessThan': 'must be before',
    'DateGreaterThan': 'must be after',
    'ArnEquals': 'ARN must equal',
    'ArnLike': 'ARN must match'
  }

  const keyTranslations: Record<string, string> = {
    'aws:MultiFactorAuthPresent': 'Multi-factor authentication (MFA)',
    'aws:MultiFactorAuthAge': 'MFA authentication age',
    'aws:SourceIp': 'Source IP address',
    'aws:SourceVpc': 'Source VPC',
    'aws:RequestedRegion': 'AWS Region',
    'aws:SecureTransport': 'Secure transport (HTTPS)',
    'aws:CurrentTime': 'Current time',
    'aws:PrincipalOrgID': 'Organization ID',
    'aws:PrincipalAccount': 'Account ID',
    'aws:userid': 'User ID',
    'aws:username': 'Username'
  }

  for (const [operator, conditionValues] of Object.entries(condition)) {
    const operatorText = conditionTranslations[operator] || operator.toLowerCase()

    for (const [key, value] of Object.entries(conditionValues as Record<string, any>)) {
      const keyText = keyTranslations[key] || key
      const values = Array.isArray(value) ? value : [value]

      // Special handling for booleans
      if (operator === 'Bool') {
        const boolValue = String(values[0]).toLowerCase() === 'true' ? 'enabled' : 'disabled'
        translations.push(`${keyText} must be ${boolValue}`)
      }
      // Special handling for IP addresses
      else if (operator.includes('IpAddress')) {
        const ipList = values.length > 1 ? values.join(' or ') : values[0]
        translations.push(`${keyText} ${operatorText} ${ipList} (typically corporate network)`)
      }
      // Special handling for regions
      else if (key === 'aws:RequestedRegion') {
        const regionList = values.length > 1 ? values.join(', ') : values[0]
        translations.push(`Actions ${operatorText} region: ${regionList}`)
      }
      // Default handling
      else {
        const valueList = values.length > 1 ? values.join(' or ') : values[0]
        translations.push(`${keyText} ${operatorText} ${valueList}`)
      }
    }
  }

  return translations
}

/**
 * Generate plain language summary for a policy statement
 */
export function generatePlainLanguageSummary(
  statement: PolicyStatement,
  policyName: string
): string {
  const actions = normalizeActions(statement.Action)
  const services = [...new Set(actions.map(extractService))]

  let summary = ''

  // Effect description - frame Deny with conditions as security controls
  if (statement.Effect === 'Deny') {
    if (statement.Condition) {
      // Deny with conditions = "Requires X to be true" (security control)
      summary = `This security policy requires `
    } else {
      // Deny without conditions = actually blocked
      summary = `This policy blocks `
    }
  } else {
    summary = `This policy allows `
  }

  // Actions description
  if (actions.length === 1) {
    summary += `the action "${actions[0]}"`
  } else if (actions.some(a => a.includes('*'))) {
    summary += `multiple ${services.join(', ')} actions`
  } else {
    summary += `${actions.length} actions across ${services.join(', ')}`
  }

  // Conditions
  if (statement.Condition) {
    const conditions = translateConditionToEnglish(statement.Condition)
    if (statement.Effect === 'Deny') {
      // Deny with conditions means "you must meet these requirements"
      summary += ` to meet these security requirements: ${conditions.join('; ')}`
    } else {
      summary += ` only when: ${conditions.join('; ')}`
    }
  } else if (statement.Effect === 'Deny') {
    summary += ` unconditionally`
  }

  return summary
}

/**
 * Generate remediation steps for a denied action
 */
export function generateRemediationSteps(
  action: string,
  denyingStatements: Array<{ policyName: string; statement: PolicyStatement; source: string; attachedAt: string }>
): string[] {
  const steps: string[] = []

  for (const { policyName, statement, source, attachedAt } of denyingStatements) {
    if (statement.Condition) {
      const conditions = translateConditionToEnglish(statement.Condition)

      // Analyze conditions and provide specific remediation
      for (const [operator, conditionValues] of Object.entries(statement.Condition)) {
        for (const [key, value] of Object.entries(conditionValues as Record<string, any>)) {
          // MFA-related remediation
          if (key === 'aws:MultiFactorAuthPresent') {
            const needsMFA = String(value).toLowerCase() === 'false'
            if (needsMFA) {
              steps.push('Enable Multi-Factor Authentication (MFA) on your IAM user account')
              steps.push('Contact your administrator to enable MFA if you cannot do so yourself')
            }
          }

          // IP restriction remediation
          if (key === 'aws:SourceIp') {
            if (operator.includes('Not')) {
              steps.push('Access AWS from an allowed IP address/network')
              steps.push(`Connect to the corporate VPN to access from whitelisted IPs`)
            }
          }

          // Region restriction remediation
          if (key === 'aws:RequestedRegion') {
            const regions = Array.isArray(value) ? value : [value]
            if (operator === 'StringNotEquals') {
              steps.push(`Use one of the allowed regions: ${regions.join(', ')}`)
            }
          }

          // Secure transport remediation
          if (key === 'aws:SecureTransport' && String(value).toLowerCase() === 'false') {
            steps.push('Use HTTPS instead of HTTP to access AWS services')
          }
        }
      }
    } else {
      // Unconditional deny
      if (source === 'inherited') {
        steps.push(`This action is blocked by an organizational policy "${policyName}" inherited from ${attachedAt}`)
        steps.push('Contact your AWS organization administrator to request an exception or policy change')
      } else {
        steps.push(`This action is blocked by the directly attached policy "${policyName}"`)
        steps.push('Contact your account administrator to modify or remove this policy')
      }
    }
  }

  // Add general remediation if no specific steps were identified
  if (steps.length === 0) {
    steps.push('This action is blocked by Service Control Policies')
    steps.push('Contact your AWS organization administrator for assistance')
  }

  return [...new Set(steps)] // Remove duplicates
}

/**
 * Calculate service impact - what percentage of common actions are restricted
 */
export function calculateServiceImpact(
  serviceRestrictions: ServiceRestriction,
  commonActions: Record<string, string[]>
): {
  totalRestricted: number
  totalConditional: number
  percentRestricted: number
  impactLevel: 'low' | 'medium' | 'high' | 'critical'
} {
  const service = serviceRestrictions.service
  const serviceCommonActions = commonActions[service] || []

  if (serviceCommonActions.length === 0) {
    // Fallback: use count of denied actions
    const totalRestricted = serviceRestrictions.deniedActions.length
    const totalConditional = serviceRestrictions.conditionalActions.length

    let impactLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
    if (totalRestricted > 50) impactLevel = 'critical'
    else if (totalRestricted > 20) impactLevel = 'high'
    else if (totalRestricted > 5) impactLevel = 'medium'

    return {
      totalRestricted,
      totalConditional,
      percentRestricted: 0,
      impactLevel
    }
  }

  // Calculate how many common actions are affected
  let restricted = 0
  let conditional = 0

  for (const commonAction of serviceCommonActions) {
    // Check if denied
    const isDenied = serviceRestrictions.deniedActions.some(d =>
      matchesPattern(commonAction, d.action)
    )
    if (isDenied) {
      restricted++
      continue
    }

    // Check if conditional
    const isConditional = serviceRestrictions.conditionalActions.some(c =>
      matchesPattern(commonAction, c.action)
    )
    if (isConditional) {
      conditional++
    }
  }

  const percentRestricted = Math.round((restricted / serviceCommonActions.length) * 100)

  let impactLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
  if (percentRestricted >= 75) impactLevel = 'critical'
  else if (percentRestricted >= 50) impactLevel = 'high'
  else if (percentRestricted >= 25) impactLevel = 'medium'

  return {
    totalRestricted: restricted,
    totalConditional: conditional,
    percentRestricted,
    impactLevel
  }
}

/**
 * Common AWS actions by service for impact calculation
 */
export const COMMON_AWS_ACTIONS: Record<string, string[]> = {
  ec2: [
    'ec2:RunInstances',
    'ec2:StartInstances',
    'ec2:StopInstances',
    'ec2:TerminateInstances',
    'ec2:DescribeInstances',
    'ec2:CreateSecurityGroup',
    'ec2:AuthorizeSecurityGroupIngress',
    'ec2:CreateVolume',
    'ec2:AttachVolume'
  ],
  s3: [
    's3:CreateBucket',
    's3:DeleteBucket',
    's3:PutObject',
    's3:GetObject',
    's3:DeleteObject',
    's3:ListBucket',
    's3:PutBucketPolicy'
  ],
  iam: [
    'iam:CreateUser',
    'iam:DeleteUser',
    'iam:CreateRole',
    'iam:DeleteRole',
    'iam:AttachRolePolicy',
    'iam:CreateAccessKey',
    'iam:PutUserPolicy'
  ],
  lambda: [
    'lambda:CreateFunction',
    'lambda:DeleteFunction',
    'lambda:InvokeFunction',
    'lambda:UpdateFunctionCode',
    'lambda:GetFunction'
  ],
  rds: [
    'rds:CreateDBInstance',
    'rds:DeleteDBInstance',
    'rds:ModifyDBInstance',
    'rds:CreateDBSnapshot',
    'rds:DescribeDBInstances'
  ]
}

/**
 * Determine policy evaluation order and precedence
 */
export function determinePolicyEvaluationOrder(
  policies: ParsedPolicy[]
): Array<{
  policy: ParsedPolicy
  order: number
  precedence: 'critical' | 'high' | 'normal'
  reasoning: string
}> {
  return policies.map((policy, index) => {
    let precedence: 'critical' | 'high' | 'normal' = 'normal'
    let reasoning = ''

    // Check for explicit denies
    const hasDeny = policy.statements.some(s => s.Effect === 'Deny')
    const hasFullAccess = policy.name === 'FullAWSAccess'

    if (hasDeny) {
      precedence = 'critical'
      reasoning = 'Contains Deny statements - these always take precedence and cannot be overridden'
    } else if (hasFullAccess) {
      precedence = 'high'
      reasoning = 'Grants broad access to all AWS services'
    } else {
      reasoning = 'Standard policy evaluation'
    }

    return {
      policy,
      order: index + 1,
      precedence,
      reasoning
    }
  }).sort((a, b) => {
    // Sort by precedence: critical > high > normal
    const precedenceOrder = { critical: 0, high: 1, normal: 2 }
    return precedenceOrder[a.precedence] - precedenceOrder[b.precedence]
  })
}

/**
 * Generate AI-powered policy analysis using AWS Bedrock
 * This function analyzes SCPs and provides intelligent insights
 */
export async function generateAIPolicyAnalysis(
  analysis: PolicyAnalysisResult,
  policies: ParsedPolicy[],
  accountContext?: { name: string; id: string; environment: string }
): Promise<{
  summary: string
  keyFindings: string[]
  riskAssessment: {
    level: 'low' | 'medium' | 'high' | 'critical'
    concerns: string[]
  }
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low'
    action: string
    rationale: string
  }>
  commonScenarios: Array<{
    scenario: string
    result: 'allowed' | 'denied' | 'conditional'
    explanation: string
  }>
}> {
  // Import invokeBedrock dynamically to avoid circular dependencies
  const { invokeBedrock } = await import('./bedrock-client')

  // Prepare structured data for AI analysis
  const policyData = {
    account: accountContext,
    summary: {
      totalPolicies: analysis.summary.totalPolicies,
      totalDenials: analysis.summary.totalDenials,
      totalConditionalDenials: analysis.summary.totalConditionalDenials,
      hasFullAccess: analysis.summary.hasFullAccess,
      mostRestrictedServices: analysis.summary.mostRestrictedServices
    },
    policies: policies.map(p => ({
      name: p.name,
      source: p.source,
      attachedAt: p.attachedAt,
      statementCount: p.statements.length,
      hasDeny: p.statements.some(s => s.Effect === 'Deny'),
      hasConditions: p.statements.some(s => s.Condition)
    })),
    topRestrictions: Object.entries(analysis.services)
      .map(([service, data]) => ({
        service,
        deniedCount: data.deniedActions.length,
        conditionalCount: data.conditionalActions.length,
        sampleDenials: data.deniedActions.slice(0, 3).map(d => d.action)
      }))
      .sort((a, b) => b.deniedCount - a.deniedCount)
      .slice(0, 5)
  }

  const systemPrompt = `You are an AWS security and compliance expert analyzing Service Control Policies (SCPs). SCPs are security guardrails that protect AWS accounts by enforcing security requirements.

IMPORTANT CONTEXT:
- These policies are SECURITY CONTROLS that protect the account, not arbitrary restrictions
- A "Deny" statement with conditions is a SECURITY REQUIREMENT (e.g., "must have MFA enabled")
- These policies prevent security incidents, data breaches, and compliance violations
- Support staff need to help users understand WHY these controls exist and HOW to comply

Your role is to:
1. Explain the security protections these policies provide
2. Identify where users might struggle to meet security requirements
3. Frame "restrictions" as "security best practices" that are enabled
4. Help support staff explain compliance requirements to users
5. Suggest how users can successfully operate within these security guardrails

CRITICAL: Respond ONLY with valid JSON. No markdown, no code blocks, no explanations outside the JSON structure.`

  const prompt = `Analyze these AWS Service Control Policies and provide comprehensive insights for support troubleshooting:

${JSON.stringify(policyData, null, 2)}

Return your analysis as a JSON object with this EXACT structure:
{
  "summary": "2-3 sentence executive summary of the overall policy posture and key concerns",
  "keyFindings": [
    "Most important finding 1",
    "Most important finding 2",
    "Most important finding 3"
  ],
  "riskAssessment": {
    "level": "low|medium|high|critical",
    "concerns": [
      "Specific security or compliance concern 1",
      "Specific security or compliance concern 2"
    ]
  },
  "recommendations": [
    {
      "priority": "high|medium|low",
      "action": "Specific actionable recommendation",
      "rationale": "Why this is important and what it addresses"
    }
  ],
  "commonScenarios": [
    {
      "scenario": "Launching an EC2 instance",
      "result": "allowed|denied|conditional",
      "explanation": "Plain English explanation of why and under what conditions"
    },
    {
      "scenario": "Creating an S3 bucket",
      "result": "allowed|denied|conditional",
      "explanation": "Plain English explanation"
    },
    {
      "scenario": "Managing IAM users",
      "result": "allowed|denied|conditional",
      "explanation": "Plain English explanation"
    }
  ]
}`

  try {
    const response = await invokeBedrock({
      prompt,
      systemPrompt,
      model: 'claude-sonnet',
      temperature: 0.2,
      maxTokens: 3000
    })

    if (!response.success || !response.content) {
      // Return fallback analysis if AI fails
      return generateFallbackAnalysis(analysis, policies)
    }

    // Parse the JSON response
    try {
      const aiAnalysis = JSON.parse(response.content)
      return aiAnalysis
    } catch (parseError) {
      console.error('[AI Policy Analysis] Failed to parse AI response:', parseError)
      return generateFallbackAnalysis(analysis, policies)
    }
  } catch (error) {
    console.error('[AI Policy Analysis] Error:', error)
    return generateFallbackAnalysis(analysis, policies)
  }
}

/**
 * Generate fallback analysis if AI is unavailable
 */
function generateFallbackAnalysis(
  analysis: PolicyAnalysisResult,
  policies: ParsedPolicy[]
): {
  summary: string
  keyFindings: string[]
  riskAssessment: { level: 'low' | 'medium' | 'high' | 'critical'; concerns: string[] }
  recommendations: Array<{ priority: 'high' | 'medium' | 'low'; action: string; rationale: string }>
  commonScenarios: Array<{ scenario: string; result: 'allowed' | 'denied' | 'conditional'; explanation: string }>
} {
  const totalRestrictions = analysis.summary.totalDenials + analysis.summary.totalConditionalDenials
  const hasDenyPolicies = policies.some(p => p.statements.some(s => s.Effect === 'Deny'))

  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
  if (totalRestrictions > 50) riskLevel = 'high'
  else if (totalRestrictions > 20) riskLevel = 'medium'

  return {
    summary: `This account has ${analysis.summary.totalPolicies} ${analysis.summary.totalPolicies === 1 ? 'policy' : 'policies'} applied with ${totalRestrictions} total restrictions. ${analysis.summary.hasFullAccess ? 'FullAWSAccess policy grants broad permissions, but Deny statements take precedence.' : 'No FullAWSAccess policy - all actions must be explicitly allowed.'}`,
    keyFindings: [
      `${analysis.summary.mostRestrictedServices.length} services have significant restrictions`,
      `${analysis.summary.totalDenials} actions are explicitly denied`,
      hasDenyPolicies ? 'Deny policies are in effect - these cannot be overridden' : 'No explicit Deny policies found'
    ],
    riskAssessment: {
      level: riskLevel,
      concerns: analysis.summary.mostRestrictedServices.length > 0
        ? [`Services with most restrictions: ${analysis.summary.mostRestrictedServices.join(', ')}`]
        : ['No major concerns identified']
    },
    recommendations: [
      {
        priority: 'high',
        action: 'Review denied actions to ensure they align with security requirements',
        rationale: 'Overly restrictive policies can block legitimate operations'
      }
    ],
    commonScenarios: [
      {
        scenario: 'General AWS operations',
        result: analysis.summary.hasFullAccess ? 'allowed' : 'conditional',
        explanation: analysis.summary.hasFullAccess
          ? 'Most operations are allowed unless specifically denied'
          : 'Operations require explicit permissions'
      }
    ]
  }
}
