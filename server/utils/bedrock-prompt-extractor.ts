/**
 * Bedrock Prompt Extractor
 * Uses AWS Bedrock to intelligently extract follow-up prompts from AI responses
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { getBedrockRuntimeClient } from '../lib/aws-client-factory'
import { logger } from './logger'

export interface SuggestedPrompt {
  text: string
  type: 'question' | 'action' | 'clarification'
  priority: number
}

/**
 * Extract follow-up prompts from an AI response using Bedrock
 * Uses Claude Haiku for fast, cost-effective analysis
 */
export async function extractFollowUpPrompts(
  responseText: string,
  maxPrompts: number = 3
): Promise<SuggestedPrompt[]> {
  // Quick check - if response is too short or has no questions, skip Bedrock call
  if (responseText.length < 50 || !responseText.includes('?')) {
    return []
  }

  try {
    // Get Bedrock client (uses commercial AWS)
    const bedrock = await getBedrockRuntimeClient('commercial')

    const prompt = `Analyze this AI assistant response and extract up to ${maxPrompts} follow-up prompts or questions that the user might want to ask next.

AI Response:
"""
${responseText}
"""

Instructions:
- Extract explicit questions the AI asks the user (e.g., "Would you like me to...", "Should I...")
- Identify implicit follow-up actions mentioned (e.g., if AI mentions "drilling down", suggest "Drill down into findings")
- Keep prompts concise (max 60 characters)
- Return ONLY a JSON array, no other text
- If no good prompts found, return empty array []

Format:
[
  {"text": "prompt text here", "type": "question", "priority": 1},
  {"text": "another prompt", "type": "action", "priority": 2}
]

Types: "question" (asks for clarification), "action" (suggests next step), "clarification" (helps narrow scope)
Priority: 1 (highest) to 3 (lowest)

JSON array:`

    const payload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 500,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    }

    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0', // Fast and cheap
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload)
    })

    const response = await bedrock.send(command)
    const responseBody = JSON.parse(new TextDecoder().decode(response.body))

    // Extract the text content from Claude's response
    const textContent = responseBody.content?.[0]?.text || ''

    // Parse the JSON array from the response
    const jsonMatch = textContent.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      logger.warn('[Bedrock Prompt Extractor] No JSON array found in response')
      return []
    }

    const prompts = JSON.parse(jsonMatch[0]) as SuggestedPrompt[]

    // Validate and filter prompts
    const validPrompts = prompts
      .filter(p => p.text && p.text.length > 0 && p.text.length <= 80)
      .slice(0, maxPrompts)

    logger.info('[Bedrock Prompt Extractor] Extracted prompts:', {
      count: validPrompts.length,
      prompts: validPrompts.map(p => p.text)
    })

    return validPrompts

  } catch (error) {
    // Don't fail the whole request if prompt extraction fails
    logger.error('[Bedrock Prompt Extractor] Error:', error)
    return []
  }
}

/**
 * Simple fallback: Extract questions using regex (no Bedrock call)
 * Used if Bedrock is unavailable or as a backup
 */
export function extractQuestionsSimple(responseText: string): SuggestedPrompt[] {
  const prompts: SuggestedPrompt[] = []

  // Find sentences ending with '?'
  const questionRegex = /([^.!?]+\?)/g
  const matches = responseText.match(questionRegex)

  if (!matches) return []

  for (const match of matches.slice(0, 3)) {
    const text = match.trim()

    // Skip if too long or too short
    if (text.length < 10 || text.length > 80) continue

    // Try to extract the actual question part
    let cleanText = text

    // Handle "Would you like..." patterns
    if (text.toLowerCase().includes('would you like')) {
      cleanText = text.replace(/.*would you like (me )?to /i, '').replace(/\?$/, '')
      cleanText = cleanText.charAt(0).toUpperCase() + cleanText.slice(1)
    }
    // Handle "Should I..." patterns
    else if (text.toLowerCase().includes('should i')) {
      cleanText = text.replace(/.*should i /i, '').replace(/\?$/, '')
      cleanText = cleanText.charAt(0).toUpperCase() + cleanText.slice(1)
    }

    prompts.push({
      text: cleanText,
      type: 'question',
      priority: prompts.length + 1
    })
  }

  return prompts
}
