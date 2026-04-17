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
  | 'over-provisioned'
  | 'under-provisioned'
  | 'optimized'
  | 'no-data'

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
  overProvisioned: number
  underProvisioned: number
  optimized: number
  noData: number
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
    classification: 'no-data',
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
      recommendedType: optimizerRec.recommendationOptions
        ?.slice().sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0]
        ?.configuration?.instanceType
    }
  }

  if (apiActivity && apiActivity.meaningfulCalls >= 0) {
    result.apiActivity = {
      meaningfulCalls: apiActivity.meaningfulCalls,
      topEvents: apiActivity.topEvents
    }
  }

  const costStr = result.monthlyEstimate ? `${result.monthlyEstimate.toFixed(0)}/month` : null
  const annualStr = result.monthlyEstimate ? `${(result.monthlyEstimate * 12).toLocaleString()}/year` : null

  // --- Compute Optimizer only classification ---
  if (!optimizerRec) {
    result.classification = 'no-data'
    result.classificationReasons.push('No Compute Optimizer analysis available')
    result.explanation = 'AWS Compute Optimizer has not analyzed this instance yet. It can take up to 12 hours after an instance starts for recommendations to appear.'
    result.evidence = [
      `State: ${instance.instanceState || 'Unknown'}`,
      'Compute Optimizer: No analysis available',
      ...(costStr ? [`Estimated cost: ${costStr} (${annualStr})`] : [])
    ]
    result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
    return result
  }

  const savings = optimizerRec.estimatedMonthlySavings || 0
  const recommended = optimizerRec.recommendationOptions
    ?.slice().sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))[0]
    ?.configuration?.instanceType
  const hasCpuMetrics = metrics && metrics.maxCpuPercent != null
  const peakStr = hasCpuMetrics ? (metrics!.maxCpuPercent?.toFixed(1) ?? 'N/A') : null
  const avgStr = hasCpuMetrics ? metrics!.avgCpuPercent?.toFixed(1) ?? 'N/A' : null

  if (optimizerRec.finding === 'OVER_PROVISIONED') {
    result.classification = 'over-provisioned'
    result.classificationReasons.push('Compute Optimizer: OVER_PROVISIONED')
    if (savings > 0) result.classificationReasons.push(`Potential savings: ${savings.toFixed(2)}/month`)
    result.explanation = 'AWS Compute Optimizer determined this instance is over-provisioned'
      + (recommended ? ` \u2014 a ${recommended} would handle the current workload` : '')
      + '.'
      + (hasCpuMetrics ? ` Peak CPU was ${peakStr}% (avg ${avgStr}%).` : '')
    result.evidence = [
      `State: ${instance.instanceState || 'Unknown'}`,
      `Current type: ${instance.instanceType}`,
      'AWS Compute Optimizer finding: Over-provisioned',
      ...(recommended ? [`Recommended type: ${recommended}`] : []),
      ...(savings > 0 ? [`Estimated savings: ${savings.toFixed(0)}/month (${(savings * 12).toLocaleString()}/year)`] : []),
      ...(hasCpuMetrics ? [`Peak CPU: ${peakStr}%`, `Average CPU: ${avgStr}%`] : []),
      ...(costStr ? [`Current cost: ${costStr} (${annualStr})`] : [])
    ]
  } else if (optimizerRec.finding === 'UNDER_PROVISIONED') {
    result.classification = 'under-provisioned'
    result.classificationReasons.push('Compute Optimizer: UNDER_PROVISIONED')
    const reasons = optimizerRec.findingReasonCodes || []
    result.explanation = 'AWS Compute Optimizer determined this instance is under-provisioned — it needs more resources than its current type provides.'
      + (recommended ? ` Consider upgrading to ${recommended}.` : '')
      + (reasons.length > 0 ? ` Reasons: ${reasons.join(', ')}.` : '')
    result.evidence = [
      `State: ${instance.instanceState || 'Unknown'}`,
      `Current type: ${instance.instanceType}`,
      'AWS Compute Optimizer finding: Under-provisioned',
      ...(reasons.length > 0 ? [`Finding reasons: ${reasons.join(', ')}`] : []),
      ...(recommended ? [`Recommended type: ${recommended}`] : []),
      ...(hasCpuMetrics ? [`Peak CPU: ${peakStr}%`, `Average CPU: ${avgStr}%`] : []),
      ...(costStr ? [`Current cost: ${costStr} (${annualStr})`] : [])
    ]
  } else if (optimizerRec.finding === 'OPTIMIZED') {
    result.classification = 'optimized'
    result.classificationReasons.push('Compute Optimizer: OPTIMIZED')
    result.explanation = 'AWS Compute Optimizer has confirmed this instance is appropriately sized for its workload.'
    result.evidence = [
      'AWS Compute Optimizer finding: Optimized',
      ...(hasCpuMetrics ? [`Peak CPU: ${peakStr}%`, `Average CPU: ${avgStr}%`] : []),
      ...(costStr ? [`Current cost: ${costStr} (${annualStr})`] : [])
    ]
  } else {
    // Unknown finding — treat as no-data
    result.classification = 'no-data'
    result.classificationReasons.push(`Compute Optimizer finding: ${optimizerRec.finding}`)
    result.explanation = `AWS Compute Optimizer returned an unrecognized finding: ${optimizerRec.finding}.`
    result.evidence = [`Compute Optimizer finding: ${optimizerRec.finding}`]
  }

  result.utilizationScore = computeUtilizationScore(metrics, apiActivity, optimizerRec, instance, thresholds)
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
    'over-provisioned': 0,
    'under-provisioned': 1,
    'optimized': 2,
    'no-data': 3
  }
  classified.sort((a, b) => order[a.classification] - order[b.classification])

  const summary: ClassificationSummary = {
    totalInstances: classified.length,
    overProvisioned: 0,
    underProvisioned: 0,
    optimized: 0,
    noData: 0,
    totalPotentialMonthlySavings: 0,
    runtimeSummary: { usuallyRunning: 0, usuallyStopped: 0, noData: 0 }
  }

  for (const inst of classified) {
    switch (inst.classification) {
      case 'over-provisioned':
        summary.overProvisioned++
        if (inst.optimization?.estimatedMonthlySavings) {
          summary.totalPotentialMonthlySavings += inst.optimization.estimatedMonthlySavings
        } else if (inst.monthlyEstimate) {
          // Compute Optimizer didn't provide a savings estimate — use 50% of current cost as conservative fallback
          summary.totalPotentialMonthlySavings += inst.monthlyEstimate * 0.5
        }
        break
      case 'under-provisioned':
        summary.underProvisioned++
        break
      case 'optimized':
        summary.optimized++
        break
      case 'no-data':
        summary.noData++
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
