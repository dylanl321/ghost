import { ListBillingViewsCommand } from '@aws-sdk/client-billing'
import { getBillingClient } from '../lib/aws-client-factory'
import { logger } from './logger'

const viewArnCache = new Map<string, string | null>()

export interface BillingViewResolution {
  arn: string | null
  availableNames: string[]
  error?: string
}

export async function resolveBillingView(nameFragment: string): Promise<BillingViewResolution> {
  const cacheKey = nameFragment.toLowerCase()
  if (viewArnCache.has(cacheKey)) {
    return { arn: viewArnCache.get(cacheKey) || null, availableNames: [] }
  }

  try {
    // Billing Conductor views are owned by the GDMS Cloud billing session.
    // Do not assume a member/payer role here: it can list no views even though
    // the direct Commercial session owns the Billing Conductor configuration.
    const client = await getBillingClient('commercial', 'us-east-1')
    const response = await client.send(new ListBillingViewsCommand({}))
    const views = response.billingViews || []
    const availableNames = views.map(view => view.name).filter((name): name is string => Boolean(name))
    const match = views.find(view => view.name?.toLowerCase().includes(cacheKey))
    const arn = match?.arn || null
    viewArnCache.set(cacheKey, arn)
    if (!arn) logger.warn(`[BillingViews] No billing view matched "${nameFragment}"`, { availableNames })
    return { arn, availableNames }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.warn(`[BillingViews] Could not resolve billing view "${nameFragment}":`, error)
    viewArnCache.set(cacheKey, null)
    return { arn: null, availableNames: [], error: message }
  }
}

export async function getBillingViewArn(nameFragment: string): Promise<string | null> {
  return (await resolveBillingView(nameFragment)).arn
}
