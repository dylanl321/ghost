/**
 * AWS Bedrock Utility for AI Analysis
 * 
 * Provides reusable Bedrock client functionality with support for:
 * - Amazon Nova Pro (amazon.nova-pro-v1:0)
 * - Anthropic Claude 3.5 Sonnet (using inference profile for GovCloud compatibility)
 * 
 * Configured specifically for GovCloud environment with proper model parameters
 * and error handling for production use.
 */

import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'
import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { getBedrockRuntimeClient } from '../lib/aws-client-factory'
import { logger } from './logger'

// Supported AI models with their configurations
export type BedrockModel = 'nova-pro' | 'claude-sonnet'

export interface BedrockModelConfig {
  modelId: string
  maxTokens: number
  temperature: number
  topP: number
  stopSequences?: string[]
  requestFormat: 'nova' | 'claude'
}

// Model configurations with fallback options for both Commercial and GovCloud environments
const MODEL_CONFIGS: Record<BedrockModel, BedrockModelConfig> = {
  'nova-pro': {
    modelId: process.env.BEDROCK_NOVA_MODEL_ID || 'amazon.nova-pro-v1:0', // Direct model ID for Nova Pro
    maxTokens: parseInt(process.env.BEDROCK_NOVA_MAX_TOKENS || '4096'),
    temperature: parseFloat(process.env.BEDROCK_NOVA_TEMPERATURE || '0.7'),
    topP: parseFloat(process.env.BEDROCK_NOVA_TOP_P || '0.9'),
    requestFormat: 'nova'
  },
  'claude-sonnet': {
    modelId: process.env.BEDROCK_CLAUDE_MODEL_ID || 'us.anthropic.claude-3-5-sonnet-20241022-v2:0', // Cross-region inference profile for Claude 3.5 Sonnet
    maxTokens: parseInt(process.env.BEDROCK_CLAUDE_MAX_TOKENS || '4096'),
    temperature: parseFloat(process.env.BEDROCK_CLAUDE_TEMPERATURE || '0.3'), // Lower temperature for more consistent analysis
    topP: parseFloat(process.env.BEDROCK_CLAUDE_TOP_P || '0.95'),
    requestFormat: 'claude'
  }
}

// Fallback model IDs to try if primary model fails
const FALLBACK_MODEL_IDS: Record<BedrockModel, string[]> = {
  'nova-pro': [
    process.env.BEDROCK_NOVA_MODEL_ID || 'amazon.nova-pro-v1:0',
    ...(process.env.BEDROCK_NOVA_FALLBACK_MODELS?.split(',') || ['amazon.nova-micro-v1:0']), // Fallback models
  ],
  'claude-sonnet': [
    process.env.BEDROCK_CLAUDE_MODEL_ID || 'us.anthropic.claude-3-5-sonnet-20241022-v2:0', // Cross-region inference profile (primary)
    ...(process.env.BEDROCK_CLAUDE_FALLBACK_MODELS?.split(',') || [
      'anthropic.claude-3-5-sonnet-20241022-v2:0',  // Direct model ID fallback
      'us.anthropic.claude-3-5-sonnet-20240620-v1:0', // Older inference profile
      'anthropic.claude-3-5-sonnet-20240620-v1:0',  // Older direct model ID
    ])
  ]
}

export interface BedrockRequest {
  prompt: string
  model?: BedrockModel
  maxTokens?: number
  temperature?: number
  systemPrompt?: string
  context?: string | Record<string, any>
}

export interface BedrockError {
  code: string
  message: string
  details?: string
  resolution?: string
  retryable: boolean
}

export interface BedrockResponse {
  success: boolean
  content?: string
  model: string
  inputTokens?: number
  outputTokens?: number
  error?: BedrockError
  processingTime: number
}

/**
 * Get Bedrock Runtime client with environment flexibility
 */
async function getBedrockClient(): Promise<BedrockRuntimeClient> {
  // Determine environment from configuration (defaults to commercial for better model availability)
  const environment = process.env.BEDROCK_ENVIRONMENT || 'commercial'
  const useEnvironment = environment === 'govcloud' ? 'govcloud' : 'commercial'
  
  // Use configured region for Bedrock operations based on environment
  const region = process.env.BEDROCK_REGION || 
    (useEnvironment === 'commercial' 
      ? process.env.AWS_COMMERCIAL_REGION || 'us-east-1'
      : process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1')
  
  // Get account ID if cross-account access is needed
  const accountId = useEnvironment === 'commercial'
    ? process.env.AWS_COMMERCIAL_BEDROCK_ACCOUNT
    : process.env.AWS_GOVCLOUD_BEDROCK_ACCOUNT
  
  logger.info(`[Bedrock] Using environment: ${useEnvironment}, region: ${region}`)
  
  return await getBedrockRuntimeClient(useEnvironment as any, region, accountId)
}

/**
 * Parse a JSON answer from a model. Models sometimes wrap JSON in a markdown
 * fence or add a sentence before it, so fall back to the outermost object or
 * array in the text.
 */
export function parseModelJson<T = any>(content: string): T {
  const cleaned = content.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    return JSON.parse(cleaned) as T
  } catch (error) {
    const start = cleaned.search(/[[{]/)
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'))
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1)) as T
    }
    throw error
  }
}

/**
 * Format request payload based on model type
 */
function formatRequest(config: BedrockModelConfig, request: BedrockRequest): Record<string, unknown> {
  const { prompt, systemPrompt, maxTokens, temperature, context } = request
  
  // Enhance prompt with context if provided
  let enhancedPrompt = prompt
  if (context) {
    if (typeof context === 'string') {
      enhancedPrompt = `Context: ${context}\n\n${prompt}`
    } else {
      enhancedPrompt = `Context: ${JSON.stringify(context, null, 2)}\n\n${prompt}`
    }
  }
  
  if (config.requestFormat === 'nova') {
    // Amazon Nova Pro format - requires messages array structure
    const messages = [
      {
        role: 'user',
        content: [
          {
            text: enhancedPrompt
          }
        ]
      }
    ]
    
    const payload: Record<string, unknown> = {
      messages,
      inferenceConfig: {
        maxTokens: maxTokens ?? config.maxTokens,
        temperature: temperature ?? config.temperature,
        topP: config.topP
      }
    }
    
    // Add system prompt if provided
    if (systemPrompt) {
      payload.system = [{ text: systemPrompt }]
    }
    
    // Add stop sequences if configured
    if (config.stopSequences && config.stopSequences.length > 0) {
      (payload.inferenceConfig as any).stopSequences = config.stopSequences
    }
    
    return payload
  } else {
    // Anthropic Claude format (with inference profile)
    const messages = [{ role: 'user', content: enhancedPrompt }]

    // Build payload without conflicting sampling parameters
    // Bedrock doesn't allow both temperature and top_p - temperature takes precedence
    const payload: Record<string, unknown> = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens ?? config.maxTokens,
      system: systemPrompt || 'You are a helpful AI assistant analyzing AWS cost and usage data.',
      messages
    }

    // Only include ONE sampling parameter - temperature takes precedence
    if (temperature !== undefined) {
      payload.temperature = temperature
    } else if (config.temperature !== undefined) {
      payload.temperature = config.temperature
    }
    // Don't include top_p when temperature is set to avoid Bedrock API conflict

    return payload
  }
}

/**
 * Parse response based on model type
 */
function parseResponse(config: BedrockModelConfig, responseBody: Record<string, unknown>): { content: string; inputTokens?: number; outputTokens?: number } {
  if (config.requestFormat === 'nova') {
    // Amazon Nova Pro response format
    // Based on AWS documentation, Nova responses contain an "output" structure
    const output = responseBody.output as Record<string, unknown>
    const message = output?.message as Record<string, unknown>
    const content = message?.content as any[]
    
    // Try multiple possible response structures
    const textContent = content?.[0]?.text || 
                       responseBody.content || 
                       responseBody.text || 
                       responseBody.outputText ||
                       'No response generated'
    
    // Token usage might be in usage object
    const usage = responseBody.usage as Record<string, number>
    
    return {
      content: textContent,
      inputTokens: usage?.inputTokens || usage?.input_tokens,
      outputTokens: usage?.outputTokens || usage?.output_tokens
    }
  } else {
    // Anthropic Claude response format
    const content = responseBody.content as any[]
    const usage = responseBody.usage as Record<string, number>
    return {
      content: content?.[0]?.text || 'No response generated',
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens
    }
  }
}

/**
 * Create structured error response
 */
function createError(code: string, message: string, details?: string, resolution?: string, retryable = false): BedrockError {
  return {
    code,
    message,
    details,
    resolution,
    retryable
  }
}

/**
 * Try invoking Bedrock with fallback model IDs
 */
async function tryInvokeWithFallbacks(
  _config: BedrockModelConfig,
  _request: BedrockRequest,
  model: BedrockModel,
  client: any,
  payload: Record<string, unknown>
): Promise<{ success: boolean; response?: any; modelUsed?: string; error?: any }> {
  const fallbackIds = FALLBACK_MODEL_IDS[model]
  
  for (const modelId of fallbackIds) {
    try {
      logger.info(`[Bedrock] Trying model ID: ${modelId}`)
      
      const command = new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify(payload)
      })

      const response = await client.send(command)
      logger.info(`[Bedrock] Successfully connected to model: ${modelId}`)
      return { success: true, response, modelUsed: modelId }
      
    } catch (error: any) {
      logger.error(`[Bedrock] Model ${modelId} failed: ${error.name} - ${error.message}`)
      
      // If it's not a model-not-found error, return the error immediately
      if (error.name !== 'ValidationException' && 
          error.name !== 'ResourceNotFoundException' &&
          !error.message?.includes('model identifier is invalid')) {
        return { success: false, error }
      }
      
      // Continue to next fallback if it's a model availability issue
      continue
    }
  }
  
  // All fallbacks failed
  return {
    success: false,
    error: {
      name: 'ModelUnavailableException',
      message: `None of the ${model} models are available in ${process.env.BEDROCK_ENVIRONMENT === 'commercial' ? 'commercial' : 'govcloud'} environment: ${fallbackIds.join(', ')}`
    }
  }
}

/**
 * Send prompt to Bedrock and get AI analysis
 */
export async function invokeBedrock(request: BedrockRequest): Promise<BedrockResponse> {
  const startTime = Date.now()
  const model = request.model || 'claude-sonnet' // Default to Claude Sonnet
  
  logger.info('[Bedrock] invokeBedrock called with model:', model, 'type:', typeof model)
  
  // Ensure model is a string and is valid
  const modelStr = String(model).trim()
  const config = MODEL_CONFIGS[modelStr as BedrockModel]
  
  if (!config) {
    logger.error('[Bedrock] Invalid model:', modelStr, 'Available:', Object.keys(MODEL_CONFIGS))
    return {
      success: false,
      error: createError(
        'INVALID_MODEL',
        `Unsupported model: ${modelStr}`,
        `Available models: ${Object.keys(MODEL_CONFIGS).join(', ')}`,
        'Please use either "nova-pro" or "claude-sonnet" as the model parameter.',
        false
      ),
      model: modelStr,
      processingTime: Date.now() - startTime
    }
  }

  try {
    logger.info(`[Bedrock] Invoking ${config.modelId} with ${request.prompt.length} character prompt`)
    
    // Get Bedrock client
    const client = await getBedrockClient()
    
    // Format request payload
    const payload = formatRequest(config, request)
    
    // Try primary model and fallbacks
    const result = await tryInvokeWithFallbacks(config, request, modelStr as BedrockModel, client, payload)
    
    if (!result.success) {
      // Handle the error from fallback attempts
      const error = result.error
      if (error.name === 'ModelUnavailableException') {
        return {
          success: false,
          error: createError(
            'MODEL_NOT_FOUND',
            `No ${modelStr} models available in ${process.env.BEDROCK_ENVIRONMENT === 'commercial' ? 'commercial' : 'govcloud'} environment`,
            error.message,
            `Contact your AWS administrator to enable Bedrock models in ${process.env.BEDROCK_REGION || (process.env.BEDROCK_ENVIRONMENT === 'commercial' ? process.env.AWS_COMMERCIAL_REGION || 'us-east-1' : process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1')}. Available fallback models for ${modelStr}: ${FALLBACK_MODEL_IDS[modelStr as BedrockModel]?.join(', ') || 'none'}`,
            false
          ),
          model: model,
          processingTime: Date.now() - startTime
        }
      }
      throw error // Re-throw for standard error handling below
    }
    
    const response = result.response!
    const actualModelUsed = result.modelUsed!
    
    logger.info(`[Bedrock] Successfully using model: ${actualModelUsed}`)
    
    if (!response.body) {
      return {
        success: false,
        error: createError(
          'EMPTY_RESPONSE',
          'No response received from Bedrock',
          'The Bedrock service returned an empty response body',
          'This may be a temporary service issue. Please try again in a moment.',
          true
        ),
        model: config.modelId,
        processingTime: Date.now() - startTime
      }
    }

    // Parse response body
    const responseBody = JSON.parse(new TextDecoder().decode(response.body))
    const { content, inputTokens, outputTokens } = parseResponse(config, responseBody)

    logger.debug(`[Bedrock] Success: ${content.length} characters generated, tokens: ${inputTokens}→${outputTokens}`)

    return {
      success: true,
      content,
      model: actualModelUsed, // Use the actual model that worked
      inputTokens,
      outputTokens,
      processingTime: Date.now() - startTime
    }

  } catch (error: any) {
    logger.error('[Bedrock] Error:', error)
    
    // Handle specific AWS Bedrock errors with detailed user guidance
    let bedrockError: BedrockError
    
    switch (error.name) {
      case 'ValidationException':
        bedrockError = createError(
          'VALIDATION_ERROR',
          'Invalid request parameters',
          error.message,
          'Check your prompt length, model parameters, and ensure they meet Bedrock requirements. Prompts should be under 20,000 characters.',
          false
        )
        break
        
      case 'ResourceNotFoundException':
        bedrockError = createError(
          'MODEL_NOT_FOUND',
          `Model ${config.modelId} is not available`,
          `The requested model is not accessible in ${process.env.BEDROCK_REGION || (process.env.BEDROCK_ENVIRONMENT === 'commercial' ? process.env.AWS_COMMERCIAL_REGION || 'us-east-1' : process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1')} region`,
          `Ensure the model is enabled in your AWS account and available in ${process.env.BEDROCK_ENVIRONMENT === 'commercial' ? 'commercial' : 'govcloud'} environment. Contact your AWS administrator if needed.`,
          false
        )
        break
        
      case 'AccessDeniedException':
        bedrockError = createError(
          'ACCESS_DENIED',
          'Insufficient permissions to access Bedrock',
          `Access denied to model: ${config.modelId}`,
          'Check that your AWS credentials have the required Bedrock permissions (bedrock:InvokeModel). Contact your AWS administrator.',
          false
        )
        break
        
      case 'ThrottlingException':
        bedrockError = createError(
          'RATE_LIMITED',
          'Too many requests to Bedrock',
          `Rate limit exceeded for model: ${config.modelId}`,
          'You are making requests too quickly. Wait a few moments and try again. Consider implementing request queuing for high-volume usage.',
          true
        )
        break
        
      case 'ModelTimeoutException':
        bedrockError = createError(
          'MODEL_TIMEOUT',
          'Bedrock request timed out',
          `Model ${config.modelId} took too long to respond`,
          'Try reducing your prompt length or complexity. Large prompts may require more processing time.',
          true
        )
        break
        
      case 'ServiceUnavailableException':
        bedrockError = createError(
          'SERVICE_UNAVAILABLE',
          'Bedrock service is temporarily unavailable',
          'The AWS Bedrock service is experiencing issues',
          'This is a temporary AWS service issue. Please try again in a few minutes.',
          true
        )
        break
        
      default:
        // Handle network, credential, and other AWS SDK errors
        if (error.message?.includes('Could not load credentials')) {
          bedrockError = createError(
            'CREDENTIALS_ERROR',
            'AWS credentials not configured',
            `Unable to load AWS credentials for ${process.env.BEDROCK_ENVIRONMENT === 'commercial' ? 'commercial' : 'govcloud'} environment`,
            `Ensure ${process.env.BEDROCK_ENVIRONMENT === 'commercial' ? 'AWS_COMMERCIAL' : 'AWS_GOVCLOUD'}_ACCESS_KEY_ID and ${process.env.BEDROCK_ENVIRONMENT === 'commercial' ? 'AWS_COMMERCIAL' : 'AWS_GOVCLOUD'}_SECRET_ACCESS_KEY environment variables are set correctly.`,
            false
          )
        } else if (error.message?.includes('getaddrinfo ENOTFOUND')) {
          bedrockError = createError(
            'NETWORK_ERROR',
            'Cannot reach Bedrock service',
            'DNS resolution failed for Bedrock endpoint',
            'Check your network connectivity and ensure you can reach AWS services. This may be a temporary network issue.',
            true
          )
        } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
          bedrockError = createError(
            'CONNECTION_ERROR',
            'Network connection to Bedrock failed',
            `Connection error: ${error.code}`,
            'This is typically a temporary network issue. Please try again in a moment.',
            true
          )
        } else {
          bedrockError = createError(
            'UNKNOWN_ERROR',
            'Unexpected error occurred',
            error.message || 'An unknown error occurred while calling Bedrock',
            'This is an unexpected error. Please try again, and if the problem persists, contact support.',
            true
          )
        }
    }

    return {
      success: false,
      error: bedrockError,
      model: config.modelId,
      processingTime: Date.now() - startTime
    }
  }
}

/**
 * Specialized function for cost data analysis with structured JSON output
 */
export async function analyzeCostData(
  data: any, 
  analysisType: string, 
  context?: string,
  model: BedrockModel = 'claude-sonnet'
): Promise<BedrockResponse> {
  
  const systemPrompt = `You are an expert AWS cloud financial analyst specializing in cost optimization. Your task is to analyze AWS cost and usage data and provide actionable insights in JSON format.

CRITICAL: You must respond ONLY with valid JSON. No explanations, no markdown, no additional text - just pure JSON.

Your analysis should be data-driven, specific, and actionable. Focus on identifying cost trends, inefficiencies, and optimization opportunities.`

  // Structure the data for efficient analysis
  const structuredData = {
    analysis_type: analysisType,
    context: context || "General cost analysis",
    metrics: {
      total_cost: data.summary?.totalCost || data.totalCost || 0,
      previous_cost: data.summary?.previousCost || data.previousCost || 0,
      account_count: data.summary?.totalAccounts || data.accountCount || 0,
      growth_rate: data.summary?.growthRate || 0
    },
    top_spenders: {
      accounts: data.topAccounts?.slice(0, 5)?.map((acc: any) => ({
        name: acc.name || acc.accountName || `Account ${acc.accountId}`,
        id: acc.accountId,
        cost: acc.cost || acc.actualCost || 0,
        budget: acc.budget || acc.estimatedBudget || 0
      })) || [],
      services: data.topServices?.slice(0, 5)?.map((svc: any) => ({
        name: svc.service || svc.serviceName,
        cost: svc.cost || 0
      })) || []
    },
    lob_performance: data.lobAnalysis?.slice(0, 5)?.map((lob: any) => ({
      name: lob.name,
      cost: lob.actualSpend || lob.cost || 0,
      budget: lob.estimatedBudget || 0,
      efficiency: lob.efficiencyScore || 0,
      accounts: lob.accountCount || 0
    })) || [],
    budget_variance: data.budgetVariance || 0,
    timeframe: data.timeframe
  }

  const prompt = `Analyze this AWS cost data and return insights as JSON:

${JSON.stringify(structuredData, null, 2)}

Return your analysis as a JSON object with this exact structure:
{
  "executive_summary": {
    "total_spend": "number with currency",
    "vs_previous": "percentage change with direction",
    "key_insight": "one sentence most important finding",
    "status": "healthy|concerning|critical"
  },
  "cost_trends": {
    "primary_trend": "increasing|decreasing|stable",
    "growth_rate": "percentage as number",
    "trend_analysis": "brief explanation of the trend",
    "forecast_concern": "potential issue to watch"
  },
  "top_concerns": [
    {
      "type": "account|service|lob",
      "name": "specific name",
      "issue": "budget_overrun|unusual_spike|inefficiency",
      "impact": "dollar amount or percentage",
      "urgency": "high|medium|low"
    }
  ],
  "opportunities": [
    {
      "area": "specific area for optimization",
      "potential_savings": "estimated dollar amount",
      "effort": "low|medium|high",
      "timeframe": "immediate|short_term|long_term"
    }
  ],
  "recommendations": [
    {
      "action": "specific action to take",
      "priority": "high|medium|low",
      "expected_impact": "estimated benefit",
      "owner": "who should handle this"
    }
  ],
  "risk_factors": {
    "budget_risk": "percentage of budget at risk",
    "growth_risk": "is growth sustainable",
    "efficiency_score": "1-10 rating of cost efficiency"
  }
}`

  return invokeBedrock({
    prompt,
    systemPrompt,
    model,
    temperature: 0.2, // Very low temperature for consistent JSON structure
    maxTokens: 2000 // Reasonable limit for structured output
  })
}

/**
 * Specialized function for budget optimization recommendations with structured JSON output
 */
export async function generateBudgetRecommendations(
  budgetData: any,
  timeframe: string,
  model: BedrockModel = 'claude-sonnet'
): Promise<BedrockResponse> {
  
  const systemPrompt = `You are an AWS cloud financial analyst specializing in budget optimization and cost control. Your task is to analyze budget performance and provide actionable recommendations in JSON format.

CRITICAL: You must respond ONLY with valid JSON. No explanations, no markdown, no additional text - just pure JSON.

Focus on budget variances, overspending patterns, and practical optimization strategies with quantified savings potential.`

  // Structure budget data for efficient analysis
  const structuredBudgetData = {
    timeframe: timeframe,
    performance: {
      total_budget: budgetData.totalBudget || 0,
      total_actual: budgetData.totalActual || budgetData.actualCost || 0,
      overall_variance: budgetData.totalVariance || budgetData.budgetVariance || 0,
      variance_percentage: budgetData.variancePercent || 0
    },
    account_performance: budgetData.byAccount?.slice(0, 10)?.map((acc: any) => ({
      name: acc.accountName || `Account ${acc.accountId}`,
      id: acc.accountId,
      budget: acc.budgetedCost || 0,
      actual: acc.actualCost || 0,
      variance: acc.variance || 0,
      variance_percent: acc.variancePercent || 0,
      status: acc.status || 'unknown'
    })) || [],
    over_budget: budgetData.overBudgetAccounts?.length || 0,
    under_budget: budgetData.underBudgetAccounts?.length || 0
  }

  const prompt = `Analyze this AWS budget performance data and provide optimization recommendations as JSON:

${JSON.stringify(structuredBudgetData, null, 2)}

Return your analysis as a JSON object with this exact structure:
{
  "budget_health": {
    "overall_status": "on_track|over_budget|under_budget",
    "variance_impact": "high|medium|low",
    "budget_utilization": "percentage as number",
    "trend_direction": "improving|worsening|stable"
  },
  "problem_accounts": [
    {
      "account_name": "specific account name",
      "budget_exceeded_by": "dollar amount or percentage",
      "primary_cause": "likely reason for overspend",
      "urgency": "immediate|soon|monitor",
      "recommended_action": "specific action to take"
    }
  ],
  "optimization_opportunities": [
    {
      "category": "rightsizing|reserved_instances|unused_resources|automation",
      "description": "specific optimization opportunity",
      "estimated_monthly_savings": "dollar amount",
      "implementation_effort": "low|medium|high",
      "risk_level": "low|medium|high",
      "affected_accounts": ["list of account names"]
    }
  ],
  "budget_adjustments": [
    {
      "account_or_service": "specific name",
      "current_budget": "current budget amount",
      "recommended_budget": "recommended budget amount",
      "justification": "reason for adjustment",
      "timeframe": "immediate|next_quarter|next_year"
    }
  ],
  "action_plan": [
    {
      "action": "specific actionable step",
      "owner": "who should do this",
      "deadline": "when to complete",
      "expected_savings": "estimated dollar impact",
      "priority": "1-5 priority ranking"
    }
  ],
  "monitoring_recommendations": {
    "key_metrics": ["list of metrics to watch"],
    "alert_thresholds": "what variance levels should trigger alerts",
    "review_frequency": "how often to review budgets"
  }
}`

  return invokeBedrock({
    prompt,
    systemPrompt,
    model,
    temperature: 0.2, // Very focused analysis for consistent structure
    maxTokens: 2500 // Allow more tokens for detailed recommendations
  })
}

/**
 * Get available models and their configurations
 */
export function getAvailableModels(): Record<BedrockModel, Omit<BedrockModelConfig, 'requestFormat'>> {
  return {
    'nova-pro': {
      modelId: MODEL_CONFIGS['nova-pro'].modelId,
      maxTokens: MODEL_CONFIGS['nova-pro'].maxTokens,
      temperature: MODEL_CONFIGS['nova-pro'].temperature,
      topP: MODEL_CONFIGS['nova-pro'].topP,
      stopSequences: MODEL_CONFIGS['nova-pro'].stopSequences
    },
    'claude-sonnet': {
      modelId: MODEL_CONFIGS['claude-sonnet'].modelId,
      maxTokens: MODEL_CONFIGS['claude-sonnet'].maxTokens,
      temperature: MODEL_CONFIGS['claude-sonnet'].temperature,
      topP: MODEL_CONFIGS['claude-sonnet'].topP,
      stopSequences: MODEL_CONFIGS['claude-sonnet'].stopSequences
    }
  }
}

/**
 * Test Bedrock connectivity and model availability
 */
export async function testBedrockConnection(model: BedrockModel = 'claude-sonnet'): Promise<BedrockResponse> {
  return invokeBedrock({
    prompt: 'Hello! Please confirm you can receive and respond to this test message. Reply with "Bedrock connection successful" and today\'s date.',
    model,
    maxTokens: 100,
    temperature: 0.1
  })
}