/**
 * POST /api/volumes/pricing
 *
 * Calculate pricing for EBS volumes
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { batchGetEBSVolumePricing } from '../../utils/aws-pricing'
import type { AWSEnvironmentType } from '../../types'

export default defineEventHandler(handleAsync(async (event) => {
  try {
    const body = await readBody(event)
    const { volumes, environment = 'govcloud' } = body as {
      volumes: Array<{ volumeType: string; sizeGB: number; region: string; volumeId?: string }>
      environment?: AWSEnvironmentType
    }

    if (!volumes || !Array.isArray(volumes)) {
      return errors.validationError(event, 'volumes array is required')
    }

    console.log(`[Volumes Pricing API] Calculating pricing for ${volumes.length} volumes in ${environment}`)

    // Fetch pricing data
    const pricingMap = await batchGetEBSVolumePricing(volumes, environment)

    // Build response with pricing data matched to volumes
    const volumesWithPricing = volumes.map(volume => {
      const pricingKey = `${volume.region}-${volume.volumeType}-${volume.sizeGB}`
      const pricing = pricingMap.get(pricingKey)

      return {
        volumeId: volume.volumeId,
        volumeType: volume.volumeType,
        sizeGB: volume.sizeGB,
        region: volume.region,
        pricing: pricing || null
      }
    })

    // Calculate totals
    const totalCost = volumesWithPricing.reduce((sum, vol) => {
      return sum + (vol.pricing?.monthlyEstimate || 0)
    }, 0)

    const volumesWithPricingCount = volumesWithPricing.filter(v => v.pricing).length

    return sendSuccess(event, {
      volumes: volumesWithPricing,
      summary: {
        totalVolumes: volumes.length,
        volumesWithPricing: volumesWithPricingCount,
        totalMonthlyCost: totalCost,
        currency: 'USD'
      }
    })
  } catch (error) {
    console.error('[Volumes Pricing API] Error:', error)
    return errors.serverError(event, `Failed to calculate volume pricing: ${error.message}`)
  }
}))
