import { ref, computed } from 'vue'

export type ComparisonPeriod = 'lastYear' | 'ytd' | 'thisMonth' | 'lastMonth' | 'last12months'

export interface PeriodData {
  period: string
  totalCost: number
  totalCostFormatted: string
  accountCount: number
  monthlyBreakdown: { month: string; cost: number; costFormatted: string }[]
  topServices?: { service: string; cost: number }[]
}

export interface PeriodDeltas {
  absoluteDiff: number
  percentChange: number | null
  direction: 'increase' | 'decrease' | 'unchanged'
}

const PERIOD_OPTIONS = [
  { label: 'This Month', value: 'thisMonth' as ComparisonPeriod },
  { label: 'Last Month', value: 'lastMonth' as ComparisonPeriod },
  { label: 'Year to Date', value: 'ytd' as ComparisonPeriod },
  { label: 'Last 12 Months', value: 'last12months' as ComparisonPeriod },
  { label: 'Last Year', value: 'lastYear' as ComparisonPeriod },
]

export function useCostComparison() {
  const selectedPeriodA = ref<ComparisonPeriod>('lastMonth')
  const selectedPeriodB = ref<ComparisonPeriod>('thisMonth')

  const periodAData = ref<PeriodData | null>(null)
  const periodBData = ref<PeriodData | null>(null)

  const loadingA = ref(false)
  const loadingB = ref(false)
  const errorA = ref<string | null>(null)
  const errorB = ref<string | null>(null)

  const loading = computed(() => loadingA.value || loadingB.value)
  const error = computed(() => errorA.value || errorB.value)

  // Map 'thisMonth' -> nearest supported historical period for the endpoint
  const toHistoricalPeriod = (period: ComparisonPeriod): string => {
    if (period === 'thisMonth') return 'last30days'
    return period
  }

  const fetchPeriod = async (period: ComparisonPeriod): Promise<PeriodData | null> => {
    const historicalPeriod = toHistoricalPeriod(period)
    const res = await $fetch<{ success: boolean; data: any }>('/api/costs/historical', {
      query: { period: historicalPeriod }
    })
    if (!res.success || !res.data) return null
    const raw = res.data
    return {
      period,
      totalCost: raw.totalCost ?? 0,
      totalCostFormatted: raw.totalCostFormatted ?? '$0.00',
      accountCount: raw.accountCount ?? 0,
      monthlyBreakdown: raw.monthlyBreakdown ?? [],
      topServices: raw.topServices ?? []
    }
  }

  const fetchComparison = async () => {
    // Fetch both periods concurrently
    loadingA.value = true
    loadingB.value = true
    errorA.value = null
    errorB.value = null

    const [resultA, resultB] = await Promise.allSettled([
      fetchPeriod(selectedPeriodA.value),
      fetchPeriod(selectedPeriodB.value)
    ])

    loadingA.value = false
    loadingB.value = false

    if (resultA.status === 'fulfilled') {
      periodAData.value = resultA.value
    } else {
      errorA.value = (resultA.reason as Error)?.message ?? 'Failed to load period A'
    }

    if (resultB.status === 'fulfilled') {
      periodBData.value = resultB.value
    } else {
      errorB.value = (resultB.reason as Error)?.message ?? 'Failed to load period B'
    }
  }

  // Compute deltas: how period B compares to period A (B - A)
  const deltas = computed<PeriodDeltas | null>(() => {
    if (!periodAData.value || !periodBData.value) return null

    const a = periodAData.value.totalCost
    const b = periodBData.value.totalCost
    const absoluteDiff = b - a
    const percentChange = a !== 0 ? ((b - a) / a) * 100 : null
    const direction = absoluteDiff > 0 ? 'increase' : absoluteDiff < 0 ? 'decrease' : 'unchanged'

    return { absoluteDiff, percentChange, direction }
  })

  return {
    selectedPeriodA,
    selectedPeriodB,
    periodA: periodAData,
    periodB: periodBData,
    deltas,
    loading,
    loadingA,
    loadingB,
    error,
    errorA,
    errorB,
    periodOptions: PERIOD_OPTIONS,
    fetchComparison
  }
}
