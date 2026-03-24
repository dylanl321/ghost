/**
 * Instance Utilization Classifier
 *
 * Pure classification logic that combines instance state, tags,
 * CloudWatch metrics, and Compute Optimizer findings to determine
 * whether instances are unused, underutilized, or right-sized.
 *
 * Generates admin-friendly explanations and verification steps
 * so non-technical users can confidently act on recommendations.
 */

import type { EnrichedInstanceData } from './instance-enrichment'
import type { ComputeOptimizerRecommendation } from './compute-optimizer'
import type { InstanceMetrics } from './cloudwatch-metrics'

export type UtilizationClassification =
  | 'unused'
  | 'patching-only'
  | 'underutilized'
  | 'right-sized'
  | 'insufficient-data'

export interface UtilizationThresholds {
  unusedCpuPercent: number       // Below this = unused (default 1%)
  underutilizedCpuPercent: number // Below this = underutilized (default 5%)
  unusedNetworkBytes: number     // Below this total bytes = unused (default 1MB)
  stoppedDaysThreshold: number   // Stopped longer than this = unused (default 14)
}

export const DEFAULT_THRESHOLDS: UtilizationThresholds = {
  unusedCpuPercent: 1,
  underutilizedCpuPercent: 5,
  unusedNetworkBytes: 1_000_000, // 1 MB
  stoppedDaysThreshold: 14
}

export interface InstanceClassification {
  instanceId: string
  instanceName?: string
  instanceType?: string
  instanceState?: string
  region: string
  classification: UtilizationClassification
  classificationReasons: string[]
  // What the data shows, in plain language
  explanation: string
  // Key facts/evidence supporting the classification
  evidence: string[]
  // CPU sparkline data
  cpuDailyValues: number[]
  cpuDailyTimestamps: string[]
  // Derived activity metrics
  lastActiveDate?: string        // Last day with CPU > 1%, ISO date string
  activeDaysCount: number        // Days with meaningful CPU activity out of monitoring period
  totalDaysMonitored: number     // Total days of CloudWatch data
  launchTime?: string            // When the instance was first launched
  // Ownership context
  owner?: string
  project?: string
  schedule?: string
  patchGroup?: string
  metrics?: {
    avgCpuPercent: number | null
    totalNetworkBytes: number | null
    lookbackDays: number
  }
  optimization?: {
    finding: string
    estimatedMonthlySavings: number
    recommendedType?: string
  }
  monthlyEstimate?: number
}

export interface ClassificationSummary {
  totalInstances: number
  unused: number
  patchingOnly: number
  underutilized: number
  rightSized: number
  insufficientData: number
  totalPotentialMonthlySavings: number
}

export interface ClassificationResult {
  summary: ClassificationSummary
  instances: InstanceClassification[]
}

/**
 * Classify a single instance based on all available data
 */
export function classifyInstance(
  instance: EnrichedInstanceData,
  metrics: InstanceMetrics | null,
  optimizerRec: ComputeOptimizerRecommendation | null,
  thresholds: UtilizationThresholds = DEFAULT_THRESHOLDS
): InstanceClassification {
  // Derive activity metrics from daily CPU data
  const cpuValues = metrics?.cpuDailyValues || []
  const cpuTimestamps = metrics?.cpuDailyTimestamps || []
  const activeDayThreshold = 1 // CPU% above this counts as "active"
  let lastActiveDate: string | undefined
  let activeDaysCount = 0

  for (let i = 0; i < cpuValues.length; i++) {
    if (cpuValues[i] > activeDayThreshold) {
      activeDaysCount++
      // Track the most recent active date
      if (!lastActiveDate || cpuTimestamps[i] > lastActiveDate) {
        lastActiveDate = cpuTimestamps[i]
      }
    }
  }

  const result: InstanceClassification = {
    instanceId: instance.resourceId,
    instanceName: instance.instanceName,
    instanceType: instance.instanceType,
    instanceState: instance.instanceState,
    region: instance.region,
    classification: 'insufficient-data',
    classificationReasons: [],
    explanation: '',
    evidence: [],
    cpuDailyValues: cpuValues,
    cpuDailyTimestamps: cpuTimestamps,
    lastActiveDate,
    activeDaysCount,
    totalDaysMonitored: cpuValues.length,
    launchTime: instance.launchTime,
    owner: instance.metadata?.owner,
    project: instance.metadata?.project,
    schedule: instance.schedulingInfo?.scheduleName,
    patchGroup: instance.patchingInfo?.patchGroup,
    monthlyEstimate: instance.pricingInfo?.monthlyEstimate
  }

  // Add metrics if available
  if (metrics) {
    result.metrics = {
      avgCpuPercent: metrics.avgCpuPercent,
      totalNetworkBytes: metrics.totalNetworkBytes,
      lookbackDays: metrics.lookbackDays
    }
  }

  // Add optimizer data if available
  if (optimizerRec) {
    result.optimization = {
      finding: optimizerRec.finding,
      estimatedMonthlySavings: optimizerRec.estimatedMonthlySavings || 0,
      recommendedType: optimizerRec.recommendationOptions?.[0]?.configuration?.instanceType
    }
  }

  const isStopped = instance.instanceState === 'stopped'
  const hasSchedule = instance.schedulingInfo?.hasSchedule === true
  const hasPatchGroup = !!instance.patchingInfo?.patchGroup
  const costStr = result.monthlyEstimate ? `$${result.monthlyEstimate.toFixed(0)}/month` : null
  const annualStr = result.monthlyEstimate ? `$${(result.monthlyEstimate * 12).toLocaleString()}/year` : null
  const ownerTag = instance.metadata?.owner
  const projectTag = instance.metadata?.project

  // Build common evidence items
  const tagEvidence: string[] = []
  if (instance.launchTime) tagEvidence.push(`Launched: ${new Date(instance.launchTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`)
  if (ownerTag) tagEvidence.push(`Owner: ${ownerTag}`)
  if (projectTag) tagEvidence.push(`Project: ${projectTag}`)
  if (instance.schedulingInfo?.scheduleName) tagEvidence.push(`Schedule: ${instance.schedulingInfo.scheduleName}`)
  if (instance.patchingInfo?.patchGroup) tagEvidence.push(`Patch Group: ${instance.patchingInfo.patchGroup}`)
  if (instance.managementInfo?.isGDMSManaged) tagEvidence.push('GDMS Managed: Yes')

  // Activity summary for evidence
  const activityEvidence: string[] = []
  if (activeDaysCount > 0 && lastActiveDate) {
    const daysAgo = Math.floor((Date.now() - new Date(lastActiveDate).getTime()) / (1000 * 60 * 60 * 24))
    activityEvidence.push(`Last active: ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`)
    activityEvidence.push(`Active ${activeDaysCount} of ${cpuValues.length} monitored days`)
  } else if (cpuValues.length > 0) {
    activityEvidence.push(`No activity detected in ${cpuValues.length} days of monitoring`)
  }

  // --- Stopped instance classification ---
  if (isStopped) {
    if (!hasSchedule && !hasPatchGroup) {
      result.classification = 'unused'
      result.classificationReasons.push('Instance is stopped with no schedule or patch group')
      result.explanation = 'This instance is stopped and has no schedule or patch group configured. There is no automation that would restart it.'
      result.evidence = [
        'State: Stopped',
        ...activityEvidence,
        'Schedule: None configured',
        'Patch Group: None configured',
        ...tagEvidence,
        ...(costStr ? [`Estimated cost: ${costStr} (${annualStr}) — EBS volumes may still incur charges`] : [])
      ]
      return result
    }

    if (hasPatchGroup && !hasSchedule) {
      result.classification = 'patching-only'
      result.classificationReasons.push(`Stopped with Patch Group "${instance.patchingInfo!.patchGroup}" but no schedule`)
      result.explanation = `This instance is stopped and has a patch group ("${instance.patchingInfo!.patchGroup}") but no schedule to run workloads. It appears to only be started during patching windows.`
      result.evidence = [
        'State: Stopped',
        `Patch Group: ${instance.patchingInfo!.patchGroup}`,
        'Schedule: None configured — no scheduled workload runtime',
        ...tagEvidence,
        ...(costStr ? [`Estimated cost: ${costStr} (${annualStr})`] : [])
      ]
      return result
    }

    if (hasSchedule) {
      result.classification = 'right-sized'
      result.classificationReasons.push('Instance is on a schedule (currently stopped)')
      result.explanation = 'This instance is currently stopped as part of its configured schedule.'
      result.evidence = [
        'State: Stopped (scheduled)',
        `Schedule: ${instance.schedulingInfo?.scheduleName || 'Configured'}`,
        ...tagEvidence
      ]
      return result
    }
  }

  // --- Running instance classification ---
  const hasMetrics = metrics && metrics.avgCpuPercent != null
  const hasOptimizer = optimizerRec != null

  if (!hasMetrics && !hasOptimizer) {
    result.classification = 'insufficient-data'
    result.classificationReasons.push('No CloudWatch metrics or Compute Optimizer data available')
    result.explanation = 'No monitoring data is available for this instance. CloudWatch metrics may not be enabled, or Compute Optimizer has not yet analyzed it.'
    result.evidence = [
      'State: Running',
      'CloudWatch CPU data: Not available',
      'Compute Optimizer: No analysis available',
      ...tagEvidence,
      ...(costStr ? [`Estimated cost: ${costStr} (${annualStr})`] : [])
    ]
    return result
  }

  // Check for unused (running but no activity)
  if (hasMetrics) {
    const cpu = metrics!.avgCpuPercent!
    const network = metrics!.totalNetworkBytes
    const days = metrics!.lookbackDays

    if (cpu < thresholds.unusedCpuPercent && network != null && network < thresholds.unusedNetworkBytes) {
      result.classification = 'unused'
      result.classificationReasons.push(
        `Avg CPU ${cpu.toFixed(1)}% over ${days} days`,
        `Total network traffic ${formatBytes(network)} over ${days} days`
      )
      result.explanation = `This instance is running but showed near-zero CPU usage (${cpu.toFixed(1)}% average) and minimal network traffic (${formatBytes(network)} total) over the last ${days} days.${activeDaysCount === 0 ? ' It had zero days of meaningful activity during the monitoring period.' : ''}`
      result.evidence = [
        'State: Running',
        ...activityEvidence,
        `Average CPU: ${cpu.toFixed(1)}% over ${days} days`,
        `Network traffic: ${formatBytes(network)} total over ${days} days`,
        ...tagEvidence,
        ...(costStr ? [`Estimated cost: ${costStr} (${annualStr})`] : [])
      ]
      return result
    }

    if (cpu < thresholds.underutilizedCpuPercent) {
      result.classification = 'underutilized'
      result.classificationReasons.push(
        `Avg CPU ${cpu.toFixed(1)}% over ${days} days`
      )
    }
  }

  // Check Compute Optimizer findings
  if (hasOptimizer) {
    if (optimizerRec!.finding === 'OVER_PROVISIONED') {
      if (result.classification !== 'unused') {
        result.classification = 'underutilized'
      }
      result.classificationReasons.push('Compute Optimizer: OVER_PROVISIONED')
      const savings = optimizerRec!.estimatedMonthlySavings || 0
      if (savings > 0) {
        result.classificationReasons.push(`Potential savings: $${savings.toFixed(2)}/month`)
      }
      const recommended = optimizerRec!.recommendationOptions?.[0]?.configuration?.instanceType
      result.explanation = `AWS Compute Optimizer analyzed this instance's usage pattern and determined it is over-provisioned${recommended ? ` — a ${recommended} would handle the current workload` : ''}.${hasMetrics ? ` Average CPU over ${metrics!.lookbackDays} days was ${metrics!.avgCpuPercent!.toFixed(1)}%.` : ''}`
      result.evidence = [
        'State: Running',
        ...activityEvidence,
        `Current type: ${instance.instanceType}`,
        `AWS Compute Optimizer finding: Over-provisioned`,
        ...(recommended ? [`Recommended type: ${recommended}`] : []),
        ...(savings > 0 ? [`Estimated savings: $${savings.toFixed(0)}/month ($${(savings * 12).toLocaleString()}/year)`] : []),
        ...(hasMetrics ? [`Average CPU: ${metrics!.avgCpuPercent!.toFixed(1)}% over ${metrics!.lookbackDays} days`] : []),
        ...tagEvidence,
        ...(costStr ? [`Current cost: ${costStr} (${annualStr})`] : [])
      ]
      return result
    }

    if (optimizerRec!.finding === 'OPTIMIZED') {
      if (result.classification === 'insufficient-data') {
        result.classification = 'right-sized'
        result.classificationReasons.push('Compute Optimizer: OPTIMIZED')
        result.explanation = 'AWS Compute Optimizer has confirmed this instance is appropriately sized for its workload.'
        result.evidence = ['Compute Optimizer finding: Optimized', ...tagEvidence]
        return result
      }
    }
  }

  // If we had metrics but CPU was above underutilized threshold, it's right-sized
  if (hasMetrics && result.classification === 'insufficient-data') {
    result.classification = 'right-sized'
    result.classificationReasons.push(
      `Avg CPU ${metrics!.avgCpuPercent!.toFixed(1)}% — within normal range`
    )
    result.explanation = 'This instance shows active usage within a normal range.'
    result.evidence = [
      `Average CPU: ${metrics!.avgCpuPercent!.toFixed(1)}% over ${metrics!.lookbackDays} days`,
      ...tagEvidence
    ]
  }

  return result
}

/**
 * Classify all instances and produce a summary
 */
export function classifyInstances(
  instances: EnrichedInstanceData[],
  metricsMap: Map<string, InstanceMetrics>,
  optimizerMap: Map<string, ComputeOptimizerRecommendation>,
  thresholds: UtilizationThresholds = DEFAULT_THRESHOLDS
): ClassificationResult {
  const classified = instances.map(instance => {
    const metrics = metricsMap.get(instance.resourceId) || null
    const optimizer = optimizerMap.get(instance.resourceId) || null
    return classifyInstance(instance, metrics, optimizer, thresholds)
  })

  // Sort: unused first, then patching-only, underutilized, insufficient-data, right-sized
  const order: Record<UtilizationClassification, number> = {
    'unused': 0,
    'patching-only': 1,
    'underutilized': 2,
    'insufficient-data': 3,
    'right-sized': 4
  }
  classified.sort((a, b) => order[a.classification] - order[b.classification])

  const summary: ClassificationSummary = {
    totalInstances: classified.length,
    unused: 0,
    patchingOnly: 0,
    underutilized: 0,
    rightSized: 0,
    insufficientData: 0,
    totalPotentialMonthlySavings: 0
  }

  for (const inst of classified) {
    switch (inst.classification) {
      case 'unused':
        summary.unused++
        if (inst.monthlyEstimate) summary.totalPotentialMonthlySavings += inst.monthlyEstimate
        break
      case 'patching-only':
        summary.patchingOnly++
        if (inst.monthlyEstimate) summary.totalPotentialMonthlySavings += inst.monthlyEstimate
        break
      case 'underutilized':
        summary.underutilized++
        if (inst.optimization?.estimatedMonthlySavings) {
          summary.totalPotentialMonthlySavings += inst.optimization.estimatedMonthlySavings
        } else if (inst.monthlyEstimate) {
          summary.totalPotentialMonthlySavings += inst.monthlyEstimate * 0.5
        }
        break
      case 'right-sized':
        summary.rightSized++
        break
      case 'insufficient-data':
        summary.insufficientData++
        break
    }
  }

  summary.totalPotentialMonthlySavings = Math.round(summary.totalPotentialMonthlySavings * 100) / 100

  return { summary, instances: classified }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`
}
