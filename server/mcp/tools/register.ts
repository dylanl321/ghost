import { CLIENT_INFO_META_KEY, type McpServer, type ServerContext, type StandardSchemaV1 } from '@modelcontextprotocol/server'
import { recordMcpAudit } from '../audit'
import { toolError } from '../results'
import type { GhostMcpClientAttribution, GhostMcpPrincipal, GhostMcpScope } from '../types'
import { McpInputError } from '../tool-input'

export interface GhostToolDefinition {
  name: string
  title: string
  description: string
  scope: GhostMcpScope
  inputSchema?: StandardSchemaV1
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
  getAuditTargetIds?: (args: any, result?: any) => string[] | undefined
  handler: (args: any, context: ServerContext) => Promise<any> | any
}

export function registerGhostTool(
  server: McpServer,
  principal: GhostMcpPrincipal,
  definition: GhostToolDefinition,
  requestClient: Partial<GhostMcpClientAttribution> = {}
): void {
  if (!principal.scopes.includes(definition.scope)) return

  server.registerTool(definition.name, {
    title: definition.title,
    description: definition.description,
    inputSchema: definition.inputSchema as any,
    annotations: definition.annotations
  }, async (args: any, context: ServerContext) => {
    const start = performance.now()
    try {
      const result = await definition.handler(args, context)
      const returnedError = result?.structuredContent?.error
      await recordMcpAudit({
        principal,
        tool: definition.name,
        status: result?.resultType === 'input_required' ? 'confirmation_required' : result?.isError ? 'error' : 'success',
        durationMs: performance.now() - start,
        targetIds: definition.getAuditTargetIds?.(args, result),
        errorCode: returnedError?.code,
        errorExplanation: returnedError?.message,
        retryable: returnedError?.retryable,
        result,
        rawFailure: result?.isError ? { args, result } : undefined,
        client: clientAttribution(context, requestClient),
        environment: args?.environment || 'unknown'
      })
      return result
    } catch (error: any) {
      await recordMcpAudit({
        principal,
        tool: definition.name,
        status: 'error',
        durationMs: performance.now() - start,
        errorCode: error?.code || error?.name || 'TOOL_ERROR',
        errorExplanation: error?.message,
        retryable: error?.retryable,
        rawFailure: { args, error },
        client: clientAttribution(context, requestClient),
        environment: args?.environment || 'unknown'
      })
      return toolError(
        error?.code || error?.name || 'TOOL_ERROR',
        error?.message || 'The tool failed unexpectedly',
        Boolean(error?.retryable),
        error instanceof McpInputError ? error.details : undefined
      )
    }
  })
}

function clientAttribution(context: ServerContext, requestClient: Partial<GhostMcpClientAttribution>): Partial<GhostMcpClientAttribution> {
  const clientInfo = context.mcpReq.envelope?.[CLIENT_INFO_META_KEY] as { name?: string; version?: string } | undefined
  return {
    ...requestClient,
    mcpClientName: clientInfo?.name,
    mcpClientVersion: clientInfo?.version
  }
}
