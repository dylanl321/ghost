import { ListBillingViewsCommand } from '@aws-sdk/client-billing'
import { getBillingClient } from '../lib/aws-client-factory'
import { logger } from './logger'

const PAYER_ACCOUNT_ID = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
const viewArnCache = new Map<string, string | null>()

export async function getBillingViewArn(nameFragment: string): Promise<string | null> {
  const cacheKey = nameFragment.toLowerCase()
  if (viewArnCache.has(cacheKey)) return viewArnCache.get(cacheKey) || null

  try {
    const client = await getBillingClient('commercial', 'us-east-1', PAYER_ACCOUNT_ID)
    const response = await client.send(new ListBillingViewsCommand({}))
    const match = (response.billingViews || []).find(view => view.name?.toLowerCase().includes(cacheKey))
    const arn = match?.arn || null
    viewArnCache.set(cacheKey, arn)
    if (!arn) logger.warn(`[BillingViews] No billing view matched "${nameFragment}"`)
    return arn
  } catch (error) {
    logger.warn(`[BillingViews] Could not resolve billing view "${nameFragment}":`, error)
    viewArnCache.set(cacheKey, null)
    return null
  }
}
