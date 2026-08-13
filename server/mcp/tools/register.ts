import type { McpServer, ServerContext, StandardSchemaV1 } from '@modelcontextprotocol/server'
import { recordMcpAudit } from '../audit'
import { toolError } from '../results'
import type { GhostMcpPrincipal, GhostMcpScope } from '../types'

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

export function registerGhostTool(server: McpServer, principal: GhostMcpPrincipal, definition: GhostToolDefinition): void {
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
      await recordMcpAudit({
        principal,
        tool: definition.name,
        status: result?.resultType === 'input_required' ? 'confirmation_required' : result?.isError ? 'error' : 'success',
        durationMs: performance.now() - start,
        targetIds: definition.getAuditTargetIds?.(args, result),
        result,
        environment: args?.environment || 'unknown'
      })
      return result
    } catch (error: any) {
      await recordMcpAudit({
        principal,
        tool: definition.name,
        status: 'error',
        durationMs: performance.now() - start,
        errorCode: error?.name || 'TOOL_ERROR',
        environment: args?.environment || 'unknown'
      })
      return toolError(error?.name || 'TOOL_ERROR', error?.message || 'The tool failed unexpectedly', Boolean(error?.retryable))
    }
  })
}
