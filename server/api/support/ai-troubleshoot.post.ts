/**
 * POST /api/support/ai-troubleshoot
 * AI-powered troubleshooting assistant
 *
 * Takes a problem description and generates an investigation plan with
 * specific diagnostic steps and recommended tools to use.
 */

import { defineEventHandler, readBody } from 'h3'
import { invokeBedrock, parseModelJson } from '../../utils/bedrock-client'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'

interface TroubleshootRequest {
  problem: string
  context?: {
    environment?: 'commercial' | 'govcloud'
    accountId?: string
    accountName?: string
    instanceId?: string
    service?: string
  }
}

interface DiagnosticStep {
  order: number
  tool: string
  action: string
  description: string
  params: Record<string, string>
  expectedOutcome: string
}

interface TroubleshootResponse {
  summary: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  category: string
  diagnosticSteps: DiagnosticStep[]
  possibleCauses: string[]
  immediateActions: string[]
  escalationPath: string
  relatedAwsDocs: string[]
}

registerEndpoint('/api/support/ai-troubleshoot', 'POST', {
  summary: 'AI-powered troubleshooting assistant',
  description: 'Analyze a problem description and generate an investigation plan with diagnostic steps',
  tags: ['Support Tools', 'AI'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['problem'],
          properties: {
            problem: { type: 'string', description: 'Description of the problem', maxLength: 2000 },
            context: {
              type: 'object',
              properties: {
                environment: { type: 'string', enum: ['commercial', 'govcloud'] },
                accountId: { type: 'string' },
                accountName: { type: 'string' },
                instanceId: { type: 'string' },
                service: { type: 'string' }
              }
            }
          }
        }
      }
    }
  },
  responses: {
    200: { description: 'Troubleshooting plan' },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

const TROUBLESHOOT_SYSTEM_PROMPT = `You are an AWS troubleshooting expert integrated into a support dashboard called GHOST. You help administrators diagnose and resolve AWS issues.

Available tools in the dashboard that you can reference:
- ip-lookup: Find which account owns an IP address
- instance-lookup: Get full EC2 instance details by ID, name, or IP
- resource-search: Search any AWS resource (EC2, S3, IAM, Lambda, RDS, etc.)
- cloudwatch-logs: Search CloudWatch log groups with filter patterns
- smart-discovery: AI-powered natural language resource search
- security-posture: Security Hub + Inspector findings analysis
- patch-compliance: SSM patch compliance status
- cost-anomalies: Detect unusual spending patterns
- access-audit: CloudTrail activity analysis
- instance-health: Comprehensive EC2 instance health dashboard

When generating diagnostic steps, reference these tools by name and provide specific parameters.

Respond with a JSON object:
{
  "summary": "Brief assessment of the problem",
  "severity": "low|medium|high|critical",
  "category": "networking|security|performance|cost|access|configuration|availability",
  "diagnosticSteps": [
    {
      "order": 1,
      "tool": "tool-name from the list above",
      "action": "what to do with the tool",
      "description": "why this step helps",
      "params": {"key": "value to search for"},
      "expectedOutcome": "what to look for in results"
    }
  ],
  "possibleCauses": ["cause 1", "cause 2"],
  "immediateActions": ["action that can be taken right now"],
  "escalationPath": "when/how to escalate if not resolved",
  "relatedAwsDocs": ["brief description of relevant AWS documentation topic"]
}

IMPORTANT: Return ONLY valid JSON. Be specific and actionable. Reference the dashboard tools with exact names.`

export default defineEventHandler(handleAsync(async (event) => {
  const body = await readBody(event) as TroubleshootRequest

  if (!body.problem || typeof body.problem !== 'string') {
    return errors.badRequest(event, 'Problem description is required')
  }

  if (body.problem.length > 2000) {
    return errors.badRequest(event, 'Problem description exceeds maximum length of 2000 characters')
  }

  let contextInfo = ''
  if (body.context) {
    const parts: string[] = []
    if (body.context.environment) parts.push(`Environment: ${body.context.environment}`)
    if (body.context.accountId) parts.push(`Account ID: ${body.context.accountId}`)
    if (body.context.accountName) parts.push(`Account Name: ${body.context.accountName}`)
    if (body.context.instanceId) parts.push(`Instance ID: ${body.context.instanceId}`)
    if (body.context.service) parts.push(`AWS Service: ${body.context.service}`)
    if (parts.length > 0) contextInfo = `\n\nKnown context:\n${parts.join('\n')}`
  }

  const prompt = `Diagnose this AWS problem and create a troubleshooting plan:

"${body.problem}"${contextInfo}

Generate a step-by-step diagnostic plan using the available dashboard tools.`

  logger.info(`[AI Troubleshoot] Problem: "${body.problem.substring(0, 100)}..."`)

  try {
    const response = await invokeBedrock({
      prompt,
      systemPrompt: TROUBLESHOOT_SYSTEM_PROMPT,
      model: 'claude-sonnet',
      maxTokens: 2048,
      temperature: 0.3
    })

    if (!response.success || !response.content) {
      throw new Error(response.error?.message || 'Failed to generate troubleshooting plan')
    }

    const parsed = parseModelJson(response.content) as TroubleshootResponse

    logger.info(`[AI Troubleshoot] Generated plan with ${parsed.diagnosticSteps?.length || 0} steps, severity: ${parsed.severity}`)

    return sendSuccess(event, parsed)
  } catch (error: any) {
    logger.error('[AI Troubleshoot] Error:', error)
    return errors.serverError(event, error.message || 'Failed to generate troubleshooting plan')
  }
}))
