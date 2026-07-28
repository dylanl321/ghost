import type {
  AccountDisambiguation,
  AccountDisambiguationOption,
  AccountSelectionRequest,
  AccountSelectionResponse
} from '../types/strands'

type SelectionInput = Partial<AccountSelectionRequest> & {
  session_id?: string
  request_id?: string
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

function normalizeMatch(value: Record<string, any>): AccountDisambiguationOption | null {
  const requestId = firstString(value.request_id, value.requestId)
  if (!requestId) return null

  return {
    request_id: requestId,
    account_alias: firstString(value.account_alias, value.accountAlias, value.display_name, value.displayName) || requestId,
    display_name: firstString(value.display_name, value.displayName, value.account_alias, value.accountAlias) || requestId,
    match_score: Number(value.match_score ?? value.matchScore ?? 0),
    match_reason: firstString(value.match_reason, value.matchReason) || 'Account match',
    govcloud_account_id: firstString(value.govcloud_account_id, value.govcloudAccountId),
    commercial_account_id: firstString(value.commercial_account_id, value.commercialAccountId)
  }
}

export function normalizeStrandsDisambiguation(
  payload: Record<string, any>,
  fallbackSessionId: string
): AccountDisambiguation & { sessionId: string } {
  const envelope = (payload.data || payload) as Record<string, any>
  const source = (envelope.disambiguation || envelope) as Record<string, any>
  const matches = (Array.isArray(source.matches) ? source.matches : [])
    .map(match => normalizeMatch(match as Record<string, any>))
    .filter((match): match is AccountDisambiguationOption => !!match)

  return {
    sessionId: firstString(
      source.sessionId,
      source.session_id,
      envelope.sessionId,
      envelope.session_id,
      payload.sessionId,
      payload.session_id,
      fallbackSessionId
    )!,
    search_term: firstString(source.search_term, source.searchTerm) || 'account',
    message: firstString(source.message) || `Found ${matches.length} accounts. Please select one.`,
    matches
  }
}

export function normalizeAccountSelectionRequest(body: SelectionInput): AccountSelectionRequest | null {
  const sessionId = firstString(body.sessionId, body.session_id)
  const requestId = firstString(body.requestId, body.request_id)
  return sessionId && requestId ? { sessionId, requestId } : null
}

export function getAccountSelectionPayloads(request: AccountSelectionRequest): Record<string, string>[] {
  return [
    { sessionId: request.sessionId, requestId: request.requestId },
    { session_id: request.sessionId, request_id: request.requestId }
  ]
}

export function normalizeAccountSelectionResponse(value: any): AccountSelectionResponse {
  const source = value?.data || value
  const account = source?.account ? normalizeMatch(source.account) : null
  return {
    ...source,
    account: account || source?.account
  } as AccountSelectionResponse
}
