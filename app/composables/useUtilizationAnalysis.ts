/**
 * Composable for managing instance utilization analysis.
 * Supports both synchronous (small accounts) and background (large accounts) modes.
 */
export function useUtilizationAnalysis(accountId: Ref<string>, environment: Ref<string>, expectedInstanceCount?: Ref<number | undefined>) {
  const toast = useToast()
  const status = ref<any>(null)
  const data = ref<any>(null)
  const loading = ref(false)
  const analyzing = ref(false)
  const retrying = ref(false)
  const error = ref(false)
  const staleData = ref(false)
  const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)

  /**
   * Check if loaded data appears stale by comparing analyzed count vs expected.
   * If analyzed count is less than 50% of expected, data is likely from an old run.
   */
  function checkStaleData(): boolean {
    const expected = expectedInstanceCount?.value
    const analyzed = data.value?.summary?.totalInstances
    if (expected && analyzed && expected > 10 && analyzed < expected * 0.5) {
      staleData.value = true
      return true
    }
    staleData.value = false
    return false
  }

  /**
   * Fetch current analysis status from the status endpoint
   */
  async function fetchStatus() {
    try {
      const response = await fetch(`/api/instances/utilization/status?environment=${environment.value}&accountIds=${accountId.value}`)
      const json = await response.json()
      if (json.success) {
        status.value = json.data
        analyzing.value = json.data.currentJob?.status === 'running' || json.data.currentJob?.status === 'pending'

        // If there's a completed analysis and we don't have data yet, load it
        if (json.data.hasResults && !data.value) {
          await fetchSyncResults()
        }

        // If a job just completed, refresh data
        if (json.data.hasResults && json.data.currentJob === null && analyzing.value === false) {
          stopPolling()
        }
      }
    } catch {
      // Status endpoint failure is non-fatal
    }
  }

  /**
   * Fetch results using the existing sync endpoint (uses DynamoDB cache on backend)
   */
  async function fetchSyncResults() {
    loading.value = true
    error.value = false
    try {
      const response = await fetch(`/api/instances/utilization?environment=${environment.value}&accountIds=${accountId.value}`)
      const json = await response.json()
      if (json.success && json.data) {
        data.value = json.data
        // Track if results are partial (incomplete metrics) for auto-trigger logic
        if (json.metadata?.partial) {
          data.value._partial = true
        }
        // Check if data looks stale compared to expected instance count
        checkStaleData()
      } else {
        error.value = true
      }
    } catch {
      error.value = true
    } finally {
      loading.value = false
    }
  }

  /**
   * Count running instances that are missing CPU metrics
   */
  function countMissingMetrics(): number {
    if (!data.value?.instances) return 0
    return data.value.instances.filter((inst: any) =>
      inst.metrics?.avgCpuPercent == null &&
      inst.metrics?.maxCpuPercent == null
    ).length
  }

  /**
   * Retry CloudWatch metrics for instances that are missing data.
   * Uses a dedicated endpoint with smaller batch sizes to avoid throttling.
   */
  async function retryMissing() {
    const missing = countMissingMetrics()
    if (missing === 0) return

    retrying.value = true
    try {
      const response = await fetch(
        `/api/instances/utilization/retry-metrics?environment=${environment.value}&accountIds=${accountId.value}`
      )
      const json = await response.json()
      if (json.success && json.data) {
        const previousMissing = missing
        data.value = json.data
        const nowMissing = countMissingMetrics()
        const filled = previousMissing - nowMissing
        if (filled > 0) {
          toast.add({
            title: 'Metrics updated',
            description: `Filled in data for ${filled} instance${filled !== 1 ? 's' : ''}.${nowMissing > 0 ? ` ${nowMissing} still missing.` : ''}`,
            icon: 'i-heroicons-arrow-path',
            color: 'blue'
          })
        }
      }
    } catch {
      // Retry failure is non-fatal
    } finally {
      retrying.value = false
    }
  }

  /**
   * Trigger a background analysis
   */
  async function triggerAnalysis(lookbackDays: number = 14) {
    analyzing.value = true
    staleData.value = false
    try {
      const response = await fetch(`/api/instances/utilization/analyze?environment=${environment.value}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountIds: accountId.value,
          lookbackDays
        })
      })
      const json = await response.json()
      if (json.success) {
        if (json.data?.status === 'already-running') {
          toast.add({ title: 'Analysis in progress', description: 'A utilization analysis is already running for this account.', icon: 'i-heroicons-information-circle', color: 'blue' })
        } else {
          toast.add({ title: 'Analysis started', description: 'Utilization analysis is running in the background. You will be notified when it completes.', icon: 'i-heroicons-arrow-path', color: 'blue' })
        }
        startPolling()
      }
    } catch {
      analyzing.value = false
      toast.add({ title: 'Analysis failed to start', description: 'Could not trigger utilization analysis. Please try again.', icon: 'i-heroicons-exclamation-triangle', color: 'red' })
    }
  }

  /**
   * Start polling for analysis status every 3 seconds
   */
  function startPolling() {
    stopPolling()
    pollTimer.value = setInterval(async () => {
      await fetchStatus()
      // Stop polling when job completes (success or failure) or disappears
      const jobStatus = status.value?.currentJob?.status
      const jobDone = !status.value?.currentJob || jobStatus === 'failed' || jobStatus === 'completed'
      if (jobDone) {
        stopPolling()
        analyzing.value = false
        if (status.value?.hasResults) {
          await fetchSyncResults()
          // Auto-retry missing metrics after background analysis completes
          if (data.value && countMissingMetrics() > 0) {
            retryMissing()
          }
          const summary = data.value?.summary
          if (summary) {
          const flagged = (summary.overProvisioned || 0) + (summary.underProvisioned || 0)
            toast.add({
              title: 'Utilization analysis complete',
              description: `${summary.totalInstances} instances analyzed. ${flagged > 0 ? `${flagged} flagged for optimization.` : 'All instances are right-sized.'}`,
              icon: 'i-heroicons-check-circle',
              color: flagged > 0 ? 'yellow' : 'green'
            })
          }
        } else if (jobStatus === 'failed') {
          toast.add({
            title: 'Analysis failed',
            description: 'The utilization analysis encountered an error. Try running it again.',
            icon: 'i-heroicons-exclamation-triangle',
            color: 'red'
          })
        }
      }
    }, 3000)
  }

  function stopPolling() {
    if (pollTimer.value) {
      clearInterval(pollTimer.value)
      pollTimer.value = null
    }
  }

  /**
   * Build utilization map for InstancesTable badge display
   */
  const utilizationMap = computed(() => {
    if (!data.value?.instances) return {}
    const map: Record<string, any> = {}
    for (const inst of data.value.instances) {
      map[inst.instanceId] = {
        classification: inst.classification,
        reasons: inst.classificationReasons || []
      }
    }
    return map
  })

  /**
   * Initialize: check status first, then load data.
   * For large accounts where sync results are incomplete, auto-trigger background analysis.
   */
  async function init() {
    loading.value = true
    staleData.value = false
    try {
      await fetchStatus()

      // If a job is running, start polling
      if (analyzing.value) {
        startPolling()
        return
      }

      // If we have DynamoDB results from status check, check if they are stale
      if (data.value) {
        if (checkStaleData()) {
          // Data is stale (instance count mismatch) - auto-trigger fresh analysis
          await triggerAnalysis()
        }
        return
      }

      // Try sync fetch - works well for small accounts
      await fetchSyncResults()

      // If sync results are partial, stale, or errored, auto-trigger background analysis
      if (data.value?._partial || staleData.value || error.value) {
        await triggerAnalysis()
      } else if (data.value && countMissingMetrics() > 0) {
        // Data loaded but some instances missing CloudWatch metrics - retry in background
        retryMissing()
      }
    } finally {
      loading.value = false
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    stopPolling()
  })

  return {
    status,
    data,
    loading,
    analyzing,
    retrying,
    error,
    staleData,
    utilizationMap,
    fetchStatus,
    fetchSyncResults,
    triggerAnalysis,
    retryMissing,
    init,
    startPolling,
    stopPolling
  }
}
