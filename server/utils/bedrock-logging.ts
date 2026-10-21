/**
 * Logging helpers for Bedrock invocations.
 *
 * Kept free of AWS SDK imports so the completion-record contract can be unit
 * tested in isolation, and so the single structured completion log emitted by
 * `invokeBedrock` has a stable, greppable shape.
 */

/**
 * Stable, greppable event name for the single info-level record emitted after a
 * Bedrock invocation completes successfully. Downstream log queries key on this.
 */
export const BEDROCK_COMPLETION_EVENT = 'bedrock_invocation_complete'

/**
 * Build the fields for the completion record. Pure function so the "only safe,
 * non-sensitive fields" contract can be asserted in tests: it carries model
 * identifiers, timing and token counts ONLY — never the prompt, generated
 * content, credentials, or any user data.
 */
export function buildBedrockCompletionLog(params: {
  requestedModel: string
  actualModel: string
  processingTimeMs: number
  inputTokens?: number
  outputTokens?: number
}): Record<string, unknown> {
  return {
    event: BEDROCK_COMPLETION_EVENT,
    requestedModel: params.requestedModel,
    model: params.actualModel,
    processingTimeMs: params.processingTimeMs,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens
  }
}
