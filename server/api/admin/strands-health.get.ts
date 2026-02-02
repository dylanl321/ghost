/**
 * GET /api/admin/strands-health
 *
 * Check health of Strands service
 * Tests connectivity to ALB and ECS service
 */

import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../utils/user-roles'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  // Get Strands URL from runtime config (set via STRANDS_SERVER_URL env var)
  const config = useRuntimeConfig()
  const strandsUrl = config.strandsServerUrl

  if (!strandsUrl) {
    return {
      success: false,
      healthy: false,
      error: 'STRANDS_SERVER_URL not configured',
      results: null,
      recommendations: ['Configure STRANDS_SERVER_URL environment variable to enable health checks']
    }
  }

  const results = {
    timestamp: new Date().toISOString(),
    strandsUrl,
    health: {
      alb: { reachable: false, status: null as number | null, latency: null as number | null, error: null as string | null }
    }
  }

  // Test: Can we reach the ALB? Use lightweight GET to avoid triggering AI processing
  try {
    const albStart = Date.now()
    const albResponse = await fetch(`${strandsUrl}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })
    results.health.alb.latency = Date.now() - albStart
    results.health.alb.reachable = true
    results.health.alb.status = albResponse.status

    if (albResponse.status === 503) {
      results.health.alb.error = 'ALB returned 503 - No healthy targets (ECS tasks might be stopped or failing health checks)'
    } else if (albResponse.status === 504) {
      results.health.alb.error = 'ALB returned 504 - Gateway timeout (ECS tasks not responding)'
    }
  } catch (error: any) {
    results.health.alb.error = error.message || 'Failed to connect to ALB'
    logger.error('[Strands Health] ALB check failed:', error)
  }

  // Determine overall health based on ALB reachability
  // We no longer POST to /query/stream as that triggers actual AI processing
  const isHealthy = results.health.alb.reachable &&
                   results.health.alb.status !== 503 &&
                   results.health.alb.status !== 504

  return {
    success: true,
    healthy: isHealthy,
    results,
    recommendations: getRecommendations(results)
  }
})

function getRecommendations(results: any): string[] {
  const recommendations: string[] = []

  if (!results.health.alb.reachable) {
    recommendations.push('Cannot reach ALB - Check network connectivity and security groups')
    recommendations.push('- Verify GHOST can access the Strands ALB')
    recommendations.push('- Check VPC peering or network routing')
  }

  if (results.health.alb.status === 503) {
    recommendations.push('ALB has no healthy targets')
    recommendations.push('- Check ECS service status')
    recommendations.push('- Check ECS tasks are running')
    recommendations.push('- View CloudWatch logs for task failures')
  }

  if (results.health.alb.status === 504) {
    recommendations.push('ALB gateway timeout - ECS tasks not responding')
    recommendations.push('- Check ECS task health checks')
    recommendations.push('- Review CloudWatch logs for application errors')
  }

  if (results.health.alb.reachable && !results.health.alb.error) {
    recommendations.push('ALB is reachable and responding')
  }

  return recommendations
}
