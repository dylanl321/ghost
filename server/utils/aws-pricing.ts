/**
 * AWS Pricing Utilities
 *
 * Helper functions for fetching AWS EC2 pricing data from the AWS Price List API
 */

import { getPricingClient } from '../lib/aws-client-factory'
import { GetProductsCommand } from '@aws-sdk/client-pricing'
import type { AWSEnvironmentType } from '../types/aws'

// Cache for pricing data with expiration
interface PricingCacheEntry {
  hourlyRate: number
  currency: string
  timestamp: number
}

const pricingCache = new Map<string, PricingCacheEntry>()
const PRICING_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

// Region mapping for AWS Pricing API
// Pricing API uses different region names than the actual AWS regions
const REGION_NAME_MAP: Record<string, string> = {
  // Commercial regions
  'us-east-1': 'US East (N. Virginia)',
  'us-east-2': 'US East (Ohio)',
  'us-west-1': 'US West (N. California)',
  'us-west-2': 'US West (Oregon)',
  'ca-central-1': 'Canada (Central)',
  'eu-central-1': 'Europe (Frankfurt)',
  'eu-west-1': 'Europe (Ireland)',
  'eu-west-2': 'Europe (London)',
  'eu-west-3': 'Europe (Paris)',
  'eu-north-1': 'Europe (Stockholm)',
  'ap-northeast-1': 'Asia Pacific (Tokyo)',
  'ap-northeast-2': 'Asia Pacific (Seoul)',
  'ap-southeast-1': 'Asia Pacific (Singapore)',
  'ap-southeast-2': 'Asia Pacific (Sydney)',
  'ap-south-1': 'Asia Pacific (Mumbai)',
  'sa-east-1': 'South America (Sao Paulo)',

  // GovCloud regions
  'us-gov-west-1': 'AWS GovCloud (US-West)',
  'us-gov-east-1': 'AWS GovCloud (US-East)'
}

/**
 * Get pricing for an EC2 instance type
 */
export async function getEC2InstancePricing(
  instanceType: string,
  region: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<{ hourlyRate: number; monthlyEstimate: number; currency: string; pricingRegion: string } | null> {
  try {
    // Check cache first
    const cacheKey = `${environment}-${region}-${instanceType}`
    const cached = pricingCache.get(cacheKey)

    if (cached && Date.now() - cached.timestamp < PRICING_CACHE_TTL) {
      return {
        hourlyRate: cached.hourlyRate,
        monthlyEstimate: cached.hourlyRate * 730, // Average hours per month
        currency: cached.currency,
        pricingRegion: region
      }
    }

    // Get the pricing region name for the API
    const pricingRegionName = REGION_NAME_MAP[region]
    if (!pricingRegionName) {
      console.warn(`[AWS Pricing] No pricing region mapping found for ${region}`)
      return null
    }

    // AWS Pricing API is only available in us-east-1 for commercial
    // For GovCloud, we'll use commercial pricing as an estimate since GovCloud pricing isn't available via API
    const pricingClient = await getPricingClient(environment === 'govcloud' ? 'commercial' : environment)

    // Build filter for the pricing query
    const filters = [
      { Type: 'TERM_MATCH', Field: 'instanceType', Value: instanceType },
      { Type: 'TERM_MATCH', Field: 'location', Value: pricingRegionName },
      { Type: 'TERM_MATCH', Field: 'operatingSystem', Value: 'Linux' }, // Default to Linux pricing
      { Type: 'TERM_MATCH', Field: 'tenancy', Value: 'Shared' },
      { Type: 'TERM_MATCH', Field: 'capacitystatus', Value: 'Used' },
      { Type: 'TERM_MATCH', Field: 'preInstalledSw', Value: 'NA' }
    ]

    const command = new GetProductsCommand({
      ServiceCode: 'AmazonEC2',
      Filters: filters,
      MaxResults: 1
    })

    const response = await pricingClient.send(command)

    if (!response.PriceList || response.PriceList.length === 0) {
      console.warn(`[AWS Pricing] No pricing found for ${instanceType} in ${region}`)
      return null
    }

    // Parse the pricing data (it comes as a JSON string)
    const priceData = JSON.parse(response.PriceList[0])
    const terms = priceData.terms?.OnDemand

    if (!terms) {
      console.warn(`[AWS Pricing] No OnDemand pricing found for ${instanceType}`)
      return null
    }

    // Extract the hourly rate from the nested pricing structure
    const termKey = Object.keys(terms)[0]
    const priceDimensions = terms[termKey]?.priceDimensions

    if (!priceDimensions) {
      console.warn(`[AWS Pricing] No price dimensions found for ${instanceType}`)
      return null
    }

    const dimensionKey = Object.keys(priceDimensions)[0]
    const pricePerUnit = priceDimensions[dimensionKey]?.pricePerUnit
    const currency = Object.keys(pricePerUnit)[0]
    const hourlyRate = parseFloat(pricePerUnit[currency])

    // Cache the result
    pricingCache.set(cacheKey, {
      hourlyRate,
      currency,
      timestamp: Date.now()
    })

    return {
      hourlyRate,
      monthlyEstimate: hourlyRate * 730, // Average hours per month
      currency,
      pricingRegion: region
    }
  } catch (error) {
    console.error(`[AWS Pricing] Error fetching pricing for ${instanceType} in ${region}:`, error.message)
    return null
  }
}

/**
 * Batch fetch pricing for multiple instance types
 * This is optimized to reduce API calls by deduplicating instance types
 */
export async function batchGetEC2InstancePricing(
  instances: Array<{ instanceType: string; region: string }>,
  environment: AWSEnvironmentType = 'commercial'
): Promise<Map<string, { hourlyRate: number; monthlyEstimate: number; currency: string; pricingRegion: string }>> {
  const pricingMap = new Map<string, { hourlyRate: number; monthlyEstimate: number; currency: string; pricingRegion: string }>()

  // Deduplicate by instanceType + region combination
  const uniqueCombinations = new Map<string, { instanceType: string; region: string }>()

  instances.forEach(instance => {
    const key = `${instance.region}-${instance.instanceType}`
    if (!uniqueCombinations.has(key)) {
      uniqueCombinations.set(key, instance)
    }
  })

  console.log(`[AWS Pricing] Fetching pricing for ${uniqueCombinations.size} unique instance type/region combinations`)

  // Fetch pricing for each unique combination (with rate limiting to avoid API throttling)
  const entries = Array.from(uniqueCombinations.entries())

  for (let i = 0; i < entries.length; i++) {
    const [key, instance] = entries[i]

    try {
      const pricing = await getEC2InstancePricing(instance.instanceType, instance.region, environment)

      if (pricing) {
        pricingMap.set(key, pricing)
      }

      // Rate limit: Wait 100ms between API calls to avoid throttling
      if (i < entries.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    } catch (error) {
      console.error(`[AWS Pricing] Failed to fetch pricing for ${key}:`, error.message)
    }
  }

  console.log(`[AWS Pricing] Successfully fetched ${pricingMap.size} pricing entries`)

  return pricingMap
}

/**
 * Clear pricing cache
 */
export function clearPricingCache(): void {
  pricingCache.clear()
  console.log('[AWS Pricing] Pricing cache cleared')
}

/**
 * Get cache statistics
 */
export function getPricingCacheStats(): { size: number; entries: string[] } {
  return {
    size: pricingCache.size,
    entries: Array.from(pricingCache.keys())
  }
}
