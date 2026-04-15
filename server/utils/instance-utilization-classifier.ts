/**
 * Instance Utilization Classifier
 *
 * Pure classification logic that combines instance state, tags,
 * CloudWatch metrics, and Compute Optimizer findings to determine
 * whether instances are unused, underutilized, or right-sized.
 *
 * Idle criteria aligned with AWS Compute Optimizer:
 * - Peak CPU < 5% AND network I/O < 5 MB/day over 14-day lookback
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
  | 'under-provisioned'
  | 'right-sized'
  | 'insufficient-data'

export type RuntimeClassification =
  | 'usually-running'
  | 'usually-stopped'
  | 'no-data'

export interface InstanceApiActivity {
  instanceId: string
  totalCalls: number
  meaningfulCalls: number
  topEvents: Array<{ eventName: string; eventSource: string; count: number }>
}

/**
 * Centralized configuration for all classification and scoring parameters.
 * Modify these values to tune how instances are classified and scored.
 */
export interface UtilizationConfig {
  // --- Classification thresholds ---
  /** Peak CPU below this = idle/unused (default 5%, per AWS Compute Optimizer) */
  idlePeakCpuPercent: number
  /** Network below this per day = idle/unused (default 5 MB/day) */
  idleNetworkBytesPerDay: number
  /** Stopped longer than this (days) = unused (default 14) */
  stoppedDaysThreshold: number
  /** Daily max CPU% above this counts as an "active" day (default 1%) */
  activeDayCpuThreshold: number
  /** Network bytes/day above this counts as an "active" day when CPU is missing (default 1 MB) */
  activeDayNetworkThreshold: number
  /** Network bytes/day above this = right-sized even without CPU data (default 50 MB) */
  networkOnlyRightSizedThreshold: number
  /** Instance age below this (hours) = new instance, skip classification (default 24) */
  newInstanceGraceHours: number
  /** Hours running over last 7 days above this = "Usually Running" (default 1) */
  usuallyRunningHoursThreshold: number

  // --- Utilization score weights (should sum to ~100 max) ---
  score: {
    /** Compute Optimizer: OPTIMIZED or UNDER_PROVISIONED */
    optimizerOptimized: number
    /** Compute Optimizer: OVER_PROVISIONED (active but wasteful) */
    optimizerOverProvisioned: number

    /** API activity tiers: [calls >= threshold, score] pairs, evaluated high-to-low */
    apiActivityTiers: Array<{ minCalls: number; points: number }>

    /** Network traffic tiers: [bytes/day >= threshold, score] pairs, evaluated high-to-low */
    networkTiers: Array<{ minBytesPerDay: number; points: number }>

    /** CPU peak tiers: [peak% >= threshold, score] pairs, evaluated high-to-low */
    cpuPeakTiers: Array<{ minPercent: number; points: number }>

    /** CPU volatility bonus: coefficient of variation thresholds */
    cpuVolatilityTiers: Array<{ minCV: number; points: number }>

    /** Disk I/O: points if ops/day > 0 */
    diskIoActive: number

    /** Grace period bonus for instances < graceAgeDays old */
    newInstanceGrace: number
    /** Max instance age (days) to receive grace bonus */
    graceAgeDays: number
  }
}

export const DEFAULT_CONFIG: UtilizationConfig = {
  // Classification thresholds
  idlePeakCpuPercent: 5,
  idleNetworkBytesPerDay: 5_000_000,       // 5 MB/day per AWS Compute Optimizer
  stoppedDaysThreshold: 14,
  activeDayCpuThreshold: 1,                // 1% daily max CPU
  activeDayNetworkThreshold: 1_000_000,    // 1 MB/day
  networkOnlyRightSizedThreshold: 50_000_000, // 50 MB/day
  newInstanceGraceHours: 24,
  usuallyRunningHoursThreshold: 1,

  // Scoring weights
  score: {
    optimizerOptimized: 25,
    optimizerOverProvisioned: 20,

    apiActivityTiers: [
      { minCalls: 100, points: 15 },
      { minCalls: 10,  points: 10 },
      { minCalls: 1,   points: 5 }
    ],

    networkTiers: [
      { minBytesPerDay: 5_000_000_000, points: 20 },  // >5 GB/day
      { minBytesPerDay: 500_000_000,   points: 15 },   // >500 MB/day
      { minBytesPerDay: 50_000_000,    points: 10 },    // >50 MB/day
      { minBytesPerDay: 5_000_000,     points: 5 }      // >5 MB/day
    ],

    cpuPeakTiers: [
      { minPercent: 50, points: 15 },
      { minPercent: 20, points: 10 },
      { minPercent: 5,  points: 5 }
    ],

    cpuVolatilityTiers: [
      { minCV: 1.0, points: 10 },   // Highly variable
      { minCV: 0.5, points: 5 }     // Bursty
    ],

    diskIoActive: 5,
    newInstanceGrace: 10,
    graceAgeDays: 7
  }
}

// Backwards-compatible alias
export type UtilizationThresholds = UtilizationConfig
export const DEFAULT_THRESHOLDS = DEFAULT_CONFIG

export interface InstanceClassification {
  instanceId: string
  instanceName?: string
  instanceType?: string
  instanceState?: string
  region: string
  classification: UtilizationClassification
  classificationReasons: string[]
  runtimeClassification: RuntimeClassification
  hoursRunningLast7Days: number | null
  explanation: string
  evidence: string[]
  cpuDailyValues: number[]
  cpuDailyTimestamps: string[]
  maxCpuDailyValues: number[]
  networkDailyValues: number[]
  networkDailyTimestamps: string[]
  lastActiveDate?: string
  activeDaysCount: number
  totalDaysMonitored: number
  launchTime?: string
  owner?: string
  project?: string
  schedule?: string
  patchGroup?: string
  metrics?: {
    avgCpuPercent: number | null
    maxCpuPercent: number | null
    totalNetworkBytes: number | null
    networkBytesPerDay: number | null
    diskReadOps: number | null
    diskWriteOps: number | null
    diskOpsPerDay: number | null
    hoursRunningLast7Days: number | null
    lookbackDays: number
  }
  optimization?: {
    finding: string
    estimatedMonthlySavings: number
    recommendedType?: string
  }
  apiActivity?: {
    meaningfulCalls: number
    topEvents: Array<{ eventName: string; eventSource: string; count: number }>
  }
  utilizationScore: number
  monthlyEstimate?: number
}

export interface ClassificationSummary {
  totalInstances: number
  unused: number
  patchingOnly: number
  underutilized: number
  underProvisioned: number
  rightSized: number
  insufficientData: number
  totalPotentialMonthlySavings: number
  runtimeSummary: {
    usuallyRunning: number
    usuallyStopped: number
    noData: number
  }
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
  apiActivity: InstanceApiActivity | null,
  thresholds: UtilizationThresholds = DEFAULT_THRESHOLDS
): InstanceClassification {
  // Derive activity metrics from daily max CPU data (peak-based, aligned with idle criteria)
  // Falls back to network data when CPU is unavailable
  const cpuValues = metrics?.cpuDailyValues || []
  const cpuTimestamps = metrics?.cpuDailyTimestamps || []
  const maxCpuDailyValues = metrics?.maxCpuDailyValues || []
  const networkDailyValues = metrics?.networkDailyValues || []
  const networkDailyTimestamps = metrics?.networkDailyTimestamps || []
  const activeDayThreshold = thresholds.activeDayCpuThreshold
  const networkActiveDayThreshold = thresholds.activeDayNetworkThreshold
  let lastActiveDate: string | undefined
  let activeDaysCount = 0

  // Primary: use CPU daily max values
  for (let i = 0; i < maxCpuDailyValues.length; i++) {
    if (maxCpuDailyValues[i] > activeDayThreshold) {
      activeDaysCount++
      const ts = cpuTimestamps[i]
      if (ts && (!lastActiveDate || ts > lastActiveDate)) {
        lastActiveDate = ts
      }
    }
  }

  // Fallback: if no CPU data, use network daily values to determine activity
  if (maxCpuDailyValues.length === 0 && networkDailyValues.length > 0) {
    for (let i = 0; i < networkDailyValues.length; i++) {
      if (networkDailyValues[i] > networkActiveDayThreshold) {
        activeDaysCount++
        const ts = networkDailyTimestamps[i]
        if (ts && (!lastActiveDate || ts > lastActiveDate)) {
          lastActiveDate = ts
        }
      }
    }
  }

  // Total days monitored = whichever source has more data points
  const totalDaysMonitored = Math.max(maxCpuDailyValues.length, cpuValues.length, networkDailyValues.length)

  const result: InstanceClassification = {
    instanceId: instance.resourceId,
    instanceName: instance.instanceName,
    instanceType: instance.instanceType,
    instanceState: instance.instanceState,
    region: instance.region,
    classification: 'insufficient-data',
    classificationReasons: [],
    runtimeClassification: classifyRuntime(metrics?.hoursRunningLast7Days ?? null, thresholds),
    hoursRunningLast7Days: metrics?.hoursRunningLast7Days ?? null,
    explanation: '',
    evidence: [],
    cpuDailyValues: cpuValues,
    cpuDailyTimestamps: cpuTimestamps,
    maxCpuDailyValues,
    networkDailyValues,
    networkDailyTimestamps,
    lastActiveDate,
    activeDaysCount,
    totalDaysMonitored,
    launchTime: instance.launchTime,
    owner: instance.metadata?.owner,
    project: instance.metadata?.project,
    schedule: instance.schedulingInfo?.scheduleName,
    patchGroup: instance.patchingInfo?.patchGroup,
    utilizationScore: 0,
    monthlyEstimate: instance.pricingInfo?.monthlyEstimate
  }

  if (metrics) {
    result.metrics = {
      avgCpuPercent: metrics.avgCpuPercent,
      maxCpuPercent: metrics.maxCpuPercent,
      totalNetworkBytes: metrics.totalNetworkBytes,
      networkBytesPerDay: metrics.networkBytesPerDay,
      diskReadOps: (metrics as any).diskReadOps ?? null,
      diskWriteOps: (metrics as any).diskWriteOps ?? null,
      diskOpsPerDay: (metrics as any).diskOpsPerDay ?? null,
      hoursRunningLast7Days: metrics.hoursRunningLast7Days ?? null,
      lookbackDays: metrics.lookbackDays
    }
  }

  if (optimizerRec) {
    result.optimization = {
      finding: optimizerRec.finding,
      estimatedMonthlySavings: optimizerRec.estimatedMonthlySavings || 0,
      recommendedType: optimizerRec.recommendationOptions?.[0]?.configuration?.instanceType
    }
  }

  if (apiActivity && apiActivity.meaningfulCalls >= 0) {
    result.apiActivity = {
      meaningfulCalls: apiActivity.meaningfulCalls,
      topEvents: apiActivity.topEvents
    }
  }

  const isStopped = instance.instanceState === 'stopped'
  const hasSchedule = instance.schedulingInfo?.hasSchedule === true
  const hasPatchGroup = !!instance.patchingInfo?.patchGroup
  const costStr = result.monthlyEstimate ? `${result.monthlyEstimate.toFixed(0)}/month` : null
  const annualStr = result.monthlyEstimate ? `${(result.monthlyEstimate * 12).toLocaleString()}/year` : null
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

  const activityEvidence: string[] = []
  if (activeDaysCount > 0 && lastActiveDate) {
    const daysAgo = Math.floor((Date.now() - new Date(lastActiveDate).getTime()) / (1000 * 60 * 60 * 24))
    activityEvidence.push(`Last active: ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`)
    activityEvidence.push(`Active ${activeDaysCount} of ${totalDaysMonitored} monitored days`)
  } else if (totalDaysMonitored > 0) {
    activityEvidence.push(`No activity detected in ${totalDaysMonitored} days of monitoring`)
  }

  // --- Stopped instance classification ---
  // Enhanced: check historical metrics/optimizer/API activity before falling back to tag-only
  if (isStopped) {
    const hasHistoricalMetrics = metrics && (metrics.maxCpuPercent != null && metrics.maxCpuPercent > 0)
    const hasHistoricalActivity = apiActivity && apiActivity.meaningfulCalls > 0
    const hasHistoricalOptimizer = optimizerRec && ['OPTIMIZED', 'UNDER_PROVISIONED', 'OVER_PROVISIONED'].includes(optimizerRec.finding)

    // Determine how long ago the instance was last active
    const stoppedDaysAgo = instance.launchTime
      ? Math.floor((Date.now() - new Date(instance.launchTime).getTime()) / (1000 * 60 * 60 * 24))
      : null

    // If stopped but has RECENT historical evidence of real usage, flag as underutilized (not unused)
    // This catches instances stopped recently that were actively used
    if (!hasSchedule && !hasPatchGroup && (hasHistoricalMetrics || hasHistoricalActivity || hasHistoricalOptimizer)) {
      const historicalEvidence: string[] = ['State: Stopped']
      if (hasHistoricalMetrics) {
        historicalEvidence.push(`Historical peak CPU: ${metrics!.maxCpuPercent!.toFixed(1)}% (from when running)`)
      }
      if (hasHistoricalActivity) {
        const topStr = apiActivity!.topEvents.slice(0, 3).map(e => `${e.eventName}(${e.count})`).join(', ')
        historicalEvidence.push(`Historical API activity: ${apiActivity!.meaningfulCalls} meaningful calls (${topStr})`)
      }
      if (hasHistoricalOptimizer) {
        historicalEvidence.push(`Compute Optimizer finding (historical): ${optimizerRec!.finding}`)
      }
      if (stoppedDaysAgo != null) {
        historicalEvidence.push(`Last started: ${stoppedDaysAgo} days ago`)
      }

      // Recently active but now stopped = underutilized (someone should decide if it should be terminated)
      result.classification = 'underutilized'
      result.classificationReasons.push('Instance is stopped but has historical evidence of usage')
      if (stoppedDaysAgo != null && stoppedDaysAgo > thresholds.stoppedDaysThreshold) {
        result.classificationReasons.push(`Stopped for ${stoppedDaysAgo} days (exceeds ${thresholds.stoppedDaysThreshold}-day threshold)`)
      }
      result.explanation = `This instance is stopped and has no schedule or patch group, but historical data shows it was actively used. ${stoppedDaysAgo != null && stoppedDaysAgo > thresholds.stoppedDaysThreshold ? `It has been stopped for ${stoppedDaysAgo} days — consider whether it should be terminated or restarted.` : 'Review whether it should be restarted or terminated.'}`
      result.evidence = [
        ...historicalEvidence,
        'Schedule: None configured',
        'Patch Group: None configured',
        ...tagEvidence,
        ...(costStr ? [`Estimated cost (if running): ${costStr} (${annualStr})`] : [])
      ]
      result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
      return result
    }

    if (!hasSchedule && !hasPatchGroup) {
      result.classification = 'unused'
      result.classificationReasons.push('Instance is stopped with no schedule, patch group, or historical activity')
      result.explanation = 'This instance is stopped with no schedule or patch group configured, and no historical evidence of active usage was found. There is no automation that would restart it.'
      result.evidence = [
        'State: Stopped',
        ...activityEvidence,
        ...(hasHistoricalActivity === false ? ['CloudTrail API activity: None detected'] : []),
        'Schedule: None configured',
        'Patch Group: None configured',
        ...tagEvidence,
        ...(costStr ? [`Estimated cost (if running): ${costStr} (${annualStr})`] : [])
      ]
      result.utilizationScore = 0
      return result
    }

    if (hasPatchGroup && !hasSchedule) {
      result.classification = 'patching-only'
      result.classificationReasons.push(`Stopped with Patch Group "${instance.patchingInfo!.patchGroup}" but no schedule`)
      result.explanation = `This instance is stopped and has a patch group ("${instance.patchingInfo!.patchGroup}") but no schedule to run workloads. It appears to only be started during patching windows.`
      result.evidence = [
        'State: Stopped',
        `Patch Group: ${instance.patchingInfo!.patchGroup}`,
        'Schedule: None configured',
        ...tagEvidence,
        ...(costStr ? [`Estimated cost: ${costStr} (${annualStr})`] : [])
      ]
      result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
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
      result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
      return result
    }
  }

  // --- Running instance classification ---
  const hasCpuMetrics = metrics && metrics.avgCpuPercent != null
  const hasNetworkMetrics = metrics && metrics.networkBytesPerDay != null
  const hasMetrics = hasCpuMetrics || hasNetworkMetrics
  const hasOptimizer = optimizerRec != null

  if (!hasMetrics && !hasOptimizer) {
    result.classification = 'insufficient-data'
    // Check if instance is brand new (launched within last 24 hours)
    const isNewInstance = instance.launchTime &&
      (Date.now() - new Date(instance.launchTime).getTime()) < thresholds.newInstanceGraceHours * 60 * 60 * 1000
    if (isNewInstance) {
      result.classificationReasons.push('Instance launched less than 24 hours ago')
      result.explanation = 'This instance was launched recently and does not yet have enough CloudWatch data for classification. It typically takes at least 24 hours for daily metrics to become available.'
    } else {
      result.classificationReasons.push('No CloudWatch metrics or Compute Optimizer data available')
      result.explanation = 'No monitoring data is available for this instance. CloudWatch metrics may not be enabled, or Compute Optimizer has not yet analyzed it.'
    }
    result.evidence = [
      'State: Running',
      'CloudWatch CPU data: Not available',
      'Compute Optimizer: No analysis available',
      ...tagEvidence,
      ...(costStr ? [`Estimated cost: ${costStr} (${annualStr})`] : [])
    ]
    result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
    return result
  }

  // --- API activity evidence (appended to all running classifications) ---
  const apiActivityEvidence: string[] = []
  const hasApiActivity = apiActivity && apiActivity.meaningfulCalls > 0
  if (apiActivity) {
    if (apiActivity.meaningfulCalls > 0) {
      const topStr = apiActivity.topEvents.slice(0, 3).map(e => `${e.eventName}(${e.count})`).join(', ')
      apiActivityEvidence.push(`API activity: ${apiActivity.meaningfulCalls} meaningful calls (${topStr})`)
    } else {
      apiActivityEvidence.push('API activity: No meaningful calls detected (SSM agent noise only or none)')
    }
  }

  // --- Disk I/O evidence ---
  const diskOpsPerDay = result.metrics?.diskOpsPerDay
  const diskEvidence: string[] = []
  if (diskOpsPerDay != null && diskOpsPerDay > 0) {
    diskEvidence.push(`Disk I/O: ${Math.round(diskOpsPerDay)} ops/day`)
  }

  // Check for idle/unused — aligned with AWS Compute Optimizer idle criteria:
  // Peak CPU < 5% AND network I/O < 5 MB/day over the lookback period
  // BUT: if instance has meaningful API calls, it's NOT unused (safety net)
  if (hasMetrics) {
    const peakCpu = metrics!.maxCpuPercent
    const networkPerDay = metrics!.networkBytesPerDay
    const days = metrics!.lookbackDays

    if (peakCpu != null && peakCpu < thresholds.idlePeakCpuPercent &&
        networkPerDay != null && networkPerDay < thresholds.idleNetworkBytesPerDay) {

      // API activity safety net: if instance has meaningful API calls, it's actively used
      // despite low CPU/network (e.g., polling SQS, reading S3, calling DynamoDB)
      if (hasApiActivity) {
        result.classification = 'right-sized'
        result.classificationReasons.push(
          `CPU/network below idle thresholds but instance has ${apiActivity!.meaningfulCalls} meaningful API calls`
        )
        result.explanation = `This instance has low CPU (${peakCpu.toFixed(1)}% peak) and network (${formatBytes(networkPerDay)}/day), but is actively making AWS API calls — it may be running a lightweight workload that polls queues, reads from S3, or calls other services.`
        result.evidence = [
          'State: Running',
          ...activityEvidence,
          ...apiActivityEvidence,
          `Peak CPU: ${peakCpu.toFixed(1)}% over ${days} days`,
          `Network traffic: ${formatBytes(networkPerDay)}/day`,
          ...diskEvidence,
          ...tagEvidence,
          ...(costStr ? [`Estimated cost: ${costStr} (${annualStr})`] : [])
        ]
        result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
        return result
      }

      result.classification = 'unused'
      result.classificationReasons.push(
        `Peak CPU ${peakCpu.toFixed(1)}% over ${days} days (below ${thresholds.idlePeakCpuPercent}% threshold)`,
        `Network traffic ${formatBytes(networkPerDay)}/day over ${days} days (below ${formatBytes(thresholds.idleNetworkBytesPerDay)}/day threshold)`
      )
      const avgStr = metrics!.avgCpuPercent?.toFixed(1) ?? 'N/A'
      result.explanation = `This instance is running but its peak CPU never exceeded ${peakCpu.toFixed(1)}% and network traffic averaged only ${formatBytes(networkPerDay)}/day over the last ${days} days. This matches AWS Compute Optimizer idle criteria.${activeDaysCount === 0 ? ' It had zero days of meaningful activity during the monitoring period.' : ''}${apiActivity ? ' No meaningful AWS API calls were detected either.' : ''}`
      result.evidence = [
        'State: Running',
        ...activityEvidence,
        ...apiActivityEvidence,
        `Peak CPU: ${peakCpu.toFixed(1)}% over ${days} days (threshold: <${thresholds.idlePeakCpuPercent}%)`,
        `Average CPU: ${avgStr}% over ${days} days`,
        `Network traffic: ${formatBytes(networkPerDay)}/day (threshold: <${formatBytes(thresholds.idleNetworkBytesPerDay)}/day)`,
        ...diskEvidence,
        ...tagEvidence,
        ...(costStr ? [`Estimated cost: ${costStr} (${annualStr})`] : [])
      ]
      result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
      return result
    }
  }

  // Compute Optimizer findings
  if (hasOptimizer) {
    // OVER_PROVISIONED = underutilized (instance is used but wastefully sized)
    if (optimizerRec!.finding === 'OVER_PROVISIONED') {
      result.classification = 'underutilized'
      result.classificationReasons.push('Compute Optimizer: OVER_PROVISIONED')
      const savings = optimizerRec!.estimatedMonthlySavings || 0
      if (savings > 0) {
        result.classificationReasons.push(`Potential savings: ${savings.toFixed(2)}/month`)
      }
      const recommended = optimizerRec!.recommendationOptions?.[0]?.configuration?.instanceType
      const peakStr = hasCpuMetrics ? (metrics!.maxCpuPercent?.toFixed(1) ?? 'N/A') : null
      const avgStr = hasCpuMetrics ? metrics!.avgCpuPercent!.toFixed(1) : null
      result.explanation = 'AWS Compute Optimizer analyzed this instance and determined it is over-provisioned'
        + (recommended ? ` \u2014 a ${recommended} would handle the current workload` : '')
        + '.'
        + (hasCpuMetrics ? ` Peak CPU over ${metrics!.lookbackDays} days was ${peakStr}% (avg ${avgStr}%).` : '')
      result.evidence = [
        'State: Running',
        ...activityEvidence,
        ...apiActivityEvidence,
        `Current type: ${instance.instanceType}`,
        'AWS Compute Optimizer finding: Over-provisioned',
        ...(recommended ? [`Recommended type: ${recommended}`] : []),
        ...(savings > 0 ? [`Estimated savings: ${savings.toFixed(0)}/month (${(savings * 12).toLocaleString()}/year)`] : []),
        ...(hasCpuMetrics ? [
          `Peak CPU: ${peakStr}% over ${metrics!.lookbackDays} days`,
          `Average CPU: ${avgStr}% over ${metrics!.lookbackDays} days`
        ] : []),
        ...diskEvidence,
        ...tagEvidence,
        ...(costStr ? [`Current cost: ${costStr} (${annualStr})`] : [])
      ]
      result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
      return result
    }

    // UNDER_PROVISIONED = needs MORE resources (distinct actionable insight)
    if (optimizerRec!.finding === 'UNDER_PROVISIONED') {
      result.classification = 'under-provisioned'
      result.classificationReasons.push('Compute Optimizer: UNDER_PROVISIONED')
      const recommended = optimizerRec!.recommendationOptions?.[0]?.configuration?.instanceType
      const reasons = optimizerRec!.findingReasonCodes || []
      const peakStr = hasCpuMetrics ? (metrics!.maxCpuPercent?.toFixed(1) ?? 'N/A') : null
      const avgStr = hasCpuMetrics ? metrics!.avgCpuPercent!.toFixed(1) : null
      result.explanation = 'AWS Compute Optimizer determined this instance is under-provisioned — it needs more resources than its current instance type provides.'
        + (recommended ? ` Consider upgrading to ${recommended}.` : '')
        + (reasons.length > 0 ? ` Reasons: ${reasons.join(', ')}.` : '')
        + (hasCpuMetrics ? ` Peak CPU over ${metrics!.lookbackDays} days was ${peakStr}% (avg ${avgStr}%).` : '')
      result.evidence = [
        'State: Running',
        ...activityEvidence,
        ...apiActivityEvidence,
        `Current type: ${instance.instanceType}`,
        'AWS Compute Optimizer finding: Under-provisioned',
        ...(reasons.length > 0 ? [`Finding reasons: ${reasons.join(', ')}`] : []),
        ...(recommended ? [`Recommended type: ${recommended}`] : []),
        ...(hasCpuMetrics ? [
          `Peak CPU: ${peakStr}% over ${metrics!.lookbackDays} days`,
          `Average CPU: ${avgStr}% over ${metrics!.lookbackDays} days`
        ] : []),
        ...diskEvidence,
        ...tagEvidence,
        ...(costStr ? [`Current cost: ${costStr} (${annualStr})`] : [])
      ]
      result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
      return result
    }

    if (optimizerRec!.finding === 'OPTIMIZED') {
      result.classification = 'right-sized'
      result.classificationReasons.push('Compute Optimizer: OPTIMIZED')
      result.explanation = 'AWS Compute Optimizer has confirmed this instance is appropriately sized for its workload.'
      const peakStr = hasCpuMetrics ? (metrics!.maxCpuPercent?.toFixed(1) ?? 'N/A') : null
      const avgStr = hasCpuMetrics ? metrics!.avgCpuPercent!.toFixed(1) : null
      result.evidence = [
        'Compute Optimizer finding: Optimized',
        ...apiActivityEvidence,
        ...(hasCpuMetrics ? [
          `Peak CPU: ${peakStr}% over ${metrics!.lookbackDays} days`,
          `Average CPU: ${avgStr}% over ${metrics!.lookbackDays} days`
        ] : []),
        ...diskEvidence,
        ...tagEvidence
      ]
      result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
      return result
    }
  }

  // If we had metrics but didn't qualify as idle, and no Compute Optimizer concern, it's right-sized
  if (hasMetrics) {
    const peakStr = metrics!.maxCpuPercent?.toFixed(1) ?? 'N/A'
    const avgStr = metrics!.avgCpuPercent?.toFixed(1) ?? 'N/A'
    const netPerDayStr = metrics!.networkBytesPerDay != null ? formatBytes(metrics!.networkBytesPerDay) + '/day' : 'N/A'

    if (hasCpuMetrics) {
      result.classification = 'right-sized'
      result.classificationReasons.push(`Peak CPU ${peakStr}% \u2014 above idle threshold`)
      result.explanation = 'This instance shows active usage above the idle threshold.'
      result.evidence = [
        `Peak CPU: ${peakStr}% over ${metrics!.lookbackDays} days`,
        `Average CPU: ${avgStr}% over ${metrics!.lookbackDays} days`,
        ...(hasNetworkMetrics ? [`Network traffic: ${netPerDayStr}`] : []),
        ...apiActivityEvidence,
        ...diskEvidence,
        ...tagEvidence
      ]
      result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
    } else if (hasNetworkMetrics) {
      const netPerDay = metrics!.networkBytesPerDay!
      // Substantial network traffic = clearly active, classify as right-sized even without CPU
      if (netPerDay > thresholds.networkOnlyRightSizedThreshold) {
        result.classification = 'right-sized'
        result.classificationReasons.push(`Network traffic ${netPerDayStr} — substantial activity without CPU metrics`)
        result.explanation = `This instance has significant network traffic (${netPerDayStr}) indicating active usage, though CPU metrics are not available. CloudWatch basic monitoring may not be enabled.`
        result.evidence = [
          'State: Running',
          ...activityEvidence,
          'CloudWatch CPU data: Not available',
          `Network traffic: ${netPerDayStr} (above 50 MB/day activity threshold)`,
          ...apiActivityEvidence,
          ...diskEvidence,
          ...tagEvidence,
          ...(costStr ? [`Estimated cost: ${costStr} (${annualStr})`] : [])
        ]
        result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
      } else {
        // Low network, no CPU — insufficient data to make a confident call
        result.classification = 'insufficient-data'
        result.classificationReasons.push('Network data available but low, and no CPU metrics')
        const isNewInstance = instance.launchTime &&
          (Date.now() - new Date(instance.launchTime).getTime()) < thresholds.newInstanceGraceHours * 60 * 60 * 1000
        result.explanation = isNewInstance
          ? 'This instance was launched recently. Network data is available but CPU metrics have not yet accumulated for a full daily period.'
          : `Network data is available (${netPerDayStr}) but CPU metrics are missing. CloudWatch basic monitoring may not be enabled or the CloudWatch agent may not be installed.`
        result.evidence = [
          'State: Running',
          'CloudWatch CPU data: Not available',
          `Network traffic: ${netPerDayStr}`,
          ...apiActivityEvidence,
          ...diskEvidence,
          ...tagEvidence,
          ...(costStr ? [`Estimated cost: ${costStr} (${annualStr})`] : [])
        ]
        result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
      }
    }
  }

  // Final fallback — set score if not already set
  if (result.utilizationScore === undefined) {
    result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
  }

  return result
}

/**
 * Classify runtime behavior based on hours running over the last 7 days.
 * Uses hourly CloudWatch CPU data point count as a proxy for hours running.
 */
export function classifyRuntime(
  hoursRunning: number | null,
  thresholds: UtilizationThresholds = DEFAULT_THRESHOLDS
): RuntimeClassification {
  if (hoursRunning === null) return 'no-data'
  return hoursRunning > thresholds.usuallyRunningHoursThreshold ? 'usually-running' : 'usually-stopped'
}

/**
 * Classify all instances and produce a summary
 */
export function classifyInstances(
  instances: EnrichedInstanceData[],
  metricsMap: Map<string, InstanceMetrics>,
  optimizerMap: Map<string, ComputeOptimizerRecommendation>,
  activityMap: Map<string, InstanceApiActivity> = new Map(),
  thresholds: UtilizationThresholds = DEFAULT_THRESHOLDS
): ClassificationResult {
  const classified = instances.map(instance => {
    const metrics = metricsMap.get(instance.resourceId) || null
    const optimizer = optimizerMap.get(instance.resourceId) || null
    const activity = activityMap.get(instance.resourceId) || null
    return classifyInstance(instance, metrics, optimizer, activity, thresholds)
  })

  const order: Record<UtilizationClassification, number> = {
    'unused': 0,
    'patching-only': 1,
    'underutilized': 2,
    'under-provisioned': 3,
    'insufficient-data': 4,
    'right-sized': 5
  }
  classified.sort((a, b) => order[a.classification] - order[b.classification])

  const summary: ClassificationSummary = {
    totalInstances: classified.length,
    unused: 0,
    patchingOnly: 0,
    underutilized: 0,
    underProvisioned: 0,
    rightSized: 0,
    insufficientData: 0,
    totalPotentialMonthlySavings: 0,
    runtimeSummary: { usuallyRunning: 0, usuallyStopped: 0, noData: 0 }
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
      case 'under-provisioned':
        summary.underProvisioned++
        break
      case 'right-sized':
        summary.rightSized++
        break
      case 'insufficient-data':
        summary.insufficientData++
        break
    }
    // Runtime dimension
    switch (inst.runtimeClassification) {
      case 'usually-running': summary.runtimeSummary.usuallyRunning++; break
      case 'usually-stopped': summary.runtimeSummary.usuallyStopped++; break
      case 'no-data': summary.runtimeSummary.noData++; break
    }
  }

  summary.totalPotentialMonthlySavings = Math.round(summary.totalPotentialMonthlySavings * 100) / 100

  return { summary, instances: classified }
}

/**
 * Compute a 0-100 utilization score combining all available signals.
 *
 * Weight distribution (max 100):
 *   Compute Optimizer finding:                     up to +25
 *   Meaningful API calls (CloudTrail):             up to +15
 *   Network (scaled by volume):                    up to +20
 *   CPU (scaled by peak + volatility bonus):       up to +25
 *   Disk I/O:                                      up to +5
 *   Instance age < 7 days (grace period):          up to +10
 */
function computeUtilizationScore(
  metrics: InstanceMetrics | null,
  apiActivity: InstanceApiActivity | null,
  optimizerRec: ComputeOptimizerRecommendation | null,
  instance: EnrichedInstanceData,
  thresholds: UtilizationThresholds
): number {
  let score = 0

  const sc = thresholds.score

  // Compute Optimizer signal
  if (optimizerRec) {
    const finding = optimizerRec.finding
    if (finding === 'UNDER_PROVISIONED' || finding === 'OPTIMIZED') {
      score += sc.optimizerOptimized
    } else if (finding === 'OVER_PROVISIONED') {
      score += sc.optimizerOverProvisioned
    }
  }

  // API activity signal — tiered by call count
  if (apiActivity && apiActivity.meaningfulCalls > 0) {
    for (const tier of sc.apiActivityTiers) {
      if (apiActivity.meaningfulCalls >= tier.minCalls) {
        score += tier.points
        break
      }
    }
  }

  // Network signal — tiered by traffic volume
  if (metrics && metrics.networkBytesPerDay != null) {
    for (const tier of sc.networkTiers) {
      if (metrics.networkBytesPerDay >= tier.minBytesPerDay) {
        score += tier.points
        break
      }
    }
  }

  // CPU signal — tiered by peak value
  if (metrics && metrics.maxCpuPercent != null) {
    for (const tier of sc.cpuPeakTiers) {
      if (metrics.maxCpuPercent >= tier.minPercent) {
        score += tier.points
        break
      }
    }

    // Volatility bonus — spiky workloads indicate real usage patterns
    const dailyValues = metrics.maxCpuDailyValues || []
    if (dailyValues.length >= 3) {
      const mean = dailyValues.reduce((s, v) => s + v, 0) / dailyValues.length
      if (mean > 0) {
        const variance = dailyValues.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / dailyValues.length
        const cv = Math.sqrt(variance) / mean
        for (const tier of sc.cpuVolatilityTiers) {
          if (cv >= tier.minCV) {
            score += tier.points
            break
          }
        }
      }
    }
  }

  // Disk I/O signal
  const diskOpsPerDay = (metrics as any)?.diskOpsPerDay
  if (diskOpsPerDay != null && diskOpsPerDay > 0) {
    score += sc.diskIoActive
  }

  // Grace period for new instances
  if (instance.launchTime) {
    const ageDays = Math.floor((Date.now() - new Date(instance.launchTime).getTime()) / (1000 * 60 * 60 * 24))
    if (ageDays < sc.graceAgeDays) {
      score += sc.newInstanceGrace
    }
  }

  return Math.min(score, 100)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`
}
