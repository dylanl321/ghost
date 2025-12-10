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

  const strandsUrl = 'http://internal-lz-mcp-servers-dev-alb-1428009891.us-gov-west-1.elb.amazonaws.com:80'

  const results = {
    timestamp: new Date().toISOString(),
    strandsUrl,
    health: {
      alb: { reachable: false, status: null, latency: null, error: null },
      service: { reachable: false, status: null, latency: null, error: null }
    }
  }

  // Test 1: Can we reach the ALB at all?
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

  // Test 2: Can we reach the /query/stream endpoint?
  try {
    const serviceStart = Date.now()
    const serviceResponse = await fetch(`${strandsUrl}/query/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        message: 'health check'
      }),
      signal: AbortSignal.timeout(10000) // 10 second timeout
    })
    results.health.service.latency = Date.now() - serviceStart
    results.health.service.reachable = true
    results.health.service.status = serviceResponse.status

    if (serviceResponse.status === 503) {
      results.health.service.error = 'Service unavailable - ECS tasks not running or failing'
    } else if (serviceResponse.status === 200) {
      results.health.service.error = null // Success
    }
  } catch (error: any) {
    results.health.service.error = error.message || 'Failed to connect to service'
    logger.error('[Strands Health] Service check failed:', error)
  }

  // Determine overall health
  const isHealthy = results.health.service.reachable &&
                   results.health.service.status === 200

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
    recommendations.push('⚠️ Cannot reach ALB - Check network connectivity and security groups')
    recommendations.push('   - Verify GHOST can access internal-lz-mcp-servers-dev-alb')
    recommendations.push('   - Check VPC peering or network routing')
  }

  if (results.health.alb.status === 503) {
    recommendations.push('⚠️ ALB has no healthy targets')
    recommendations.push('   - Check ECS service: aws ecs describe-services --cluster lz-mcp-servers-dev --services lz-mcp-servers-dev')
    recommendations.push('   - Check ECS tasks: aws ecs list-tasks --cluster lz-mcp-servers-dev')
    recommendations.push('   - View CloudWatch logs for task failures')
  }

  if (results.health.alb.status === 504) {
    recommendations.push('⚠️ ALB gateway timeout - ECS tasks not responding')
    recommendations.push('   - Check ECS task health checks')
    recommendations.push('   - Review CloudWatch logs for application errors')
  }

  if (results.health.service.status === 503) {
    recommendations.push('⚠️ Service returned 503 - Application-level issue')
    recommendations.push('   - Check ECS task logs in CloudWatch')
    recommendations.push('   - Verify MCP server dependencies are healthy')
  }

  if (!results.health.service.reachable && results.health.alb.reachable) {
    recommendations.push('⚠️ ALB reachable but /query/stream endpoint failing')
    recommendations.push('   - Check ECS target group health')
    recommendations.push('   - Verify Strands agent is listening on correct port')
    recommendations.push('   - Check CloudWatch logs for application errors')
  }

  if (results.health.service.status === 200) {
    recommendations.push('✅ Service is healthy - If you see 503 errors, they may be intermittent')
    recommendations.push('   - Check CloudWatch metrics for request rate and errors')
    recommendations.push('   - Consider scaling up ECS tasks if load is high')
  }

  return recommendations
}
