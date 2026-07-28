/**
 * Global Background Polling Service
 *
 * SINGLE source of truth for all async chat polling.
 * Handles polling whether user is on chat page or navigates away.
 * Uses callback pattern for live UI updates.
 *
 * Architecture:
 * - All polling goes through this service
 * - UI components register callbacks for real-time updates
 * - Saves messages directly via API (no thread switching)
 * - Toast notifications for background completions
 */

const logger = createLogger('BackgroundPolling')

// Storage key for pending jobs
const PENDING_JOBS_KEY = 'ghost-chat-pending-jobs'

/**
 * Callbacks for UI updates during polling
 */
export interface PollingJobEvent {
  jobId: string
  threadId: string
}

export interface PollingProgressEvent extends PollingJobEvent {
  progress: string
  percent: number
  tools: string[]
}

export interface PollingCompleteEvent extends PollingJobEvent {
  response: string
  metadata: any
  suggestedLinks: any[]
  suggestedPrompts: any[]
}

export interface PollingErrorEvent extends PollingJobEvent {
  error: string
  recoverable: boolean
  disambiguation?: any
}

export interface PollingDisambiguationEvent extends PollingJobEvent {
  disambiguation: any
}

export interface PollingCallbacks {
  onProgress?: (event: PollingProgressEvent) => void
  onComplete?: (event: PollingCompleteEvent) => void
  onError?: (event: PollingErrorEvent) => void
  onDisambiguation?: (event: PollingDisambiguationEvent) => void
}

export interface PendingJob {
  jobId: string
  threadId: string
  userMessage: string
  timestamp: number
  status: 'polling' | 'paused' | 'waiting_for_input' | 'complete' | 'error'
  progress?: string
  progressPercent?: number
  toolsCalled?: string[]
  statusHistory?: Array<{ text: string; timestamp: number }>
  consecutiveFailures?: number
  nextPollAt?: number
  lastError?: string
  disambiguation?: any
}

// Singleton state - shared across all instances
const activeJobs = ref<Map<string, PendingJob>>(new Map())
const jobCallbacks = new Map<string, Map<string, PollingCallbacks>>()
const recentCompletions = ref<Array<{ job: PendingJob; completedAt: number; success: boolean; response?: string }>>([])
const isPollingActive = ref(false)
const pollIntervalId = ref<NodeJS.Timeout | null>(null)
let pollCycleRunning = false
let initialized = false

// Max recent completions to keep
const MAX_RECENT_COMPLETIONS = 10
const MAX_POLL_FAILURES = 5
const MAX_JOB_AGE_MS = 15 * 60 * 1000

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (pollIntervalId.value) clearInterval(pollIntervalId.value)
    pollIntervalId.value = null
    isPollingActive.value = false
    pollCycleRunning = false
    initialized = false
  })
}

export function useBackgroundPolling() {
  const toast = useToast()
  const router = useRouter()

  // ============================================================================
  // CALLBACK MANAGEMENT
  // ============================================================================

  /**
   * Register callbacks for a job to receive live UI updates
   */
  function registerJobCallbacks(jobId: string, owner: string, callbacks: PollingCallbacks) {
    const owners = jobCallbacks.get(jobId) || new Map<string, PollingCallbacks>()
    owners.set(owner, callbacks)
    jobCallbacks.set(jobId, owners)
    logger.info('Registered callbacks for job:', jobId)
  }

  /**
   * Unregister callbacks (e.g., when switching threads)
   */
  function unregisterJobCallbacks(jobId: string, owner?: string) {
    if (!owner) {
      jobCallbacks.delete(jobId)
      return
    }
    const owners = jobCallbacks.get(jobId)
    owners?.delete(owner)
    if (owners?.size === 0) jobCallbacks.delete(jobId)
    logger.info('Unregistered callbacks for job:', jobId)
  }

  /**
   * Check if a job has callbacks registered (UI is actively watching)
   */
  function hasCallbacks(jobId: string): boolean {
    return (jobCallbacks.get(jobId)?.size || 0) > 0
  }

  // ============================================================================
  // PERSISTENCE
  // ============================================================================

  function savePendingJobs() {
    try {
      const jobs = Array.from(activeJobs.value.entries()).map(([id, job]) => ({
        ...job,
        id
      }))
      if (import.meta.client) localStorage.setItem(PENDING_JOBS_KEY, JSON.stringify(jobs))
    } catch (e) {
      logger.warn('Failed to save jobs:', e)
    }
  }

  function loadPendingJobs() {
    try {
      if (!import.meta.client) return
      const stored = localStorage.getItem(PENDING_JOBS_KEY)
      if (!stored) return

      const jobs = JSON.parse(stored) as (PendingJob & { id: string })[]
      const now = Date.now()
      const maxAge = 24 * 60 * 60 * 1000 // Match durable job TTL

      for (const job of jobs) {
        // Skip expired jobs
        if (now - job.timestamp > maxAge) continue
        // Restore jobs that can still be polled or explicitly reconnected.
        if (job.status === 'polling' || job.status === 'paused' || job.status === 'waiting_for_input') {
          activeJobs.value.set(job.jobId, job)
        }
      }

      // Clean up expired jobs from storage
      savePendingJobs()

      logger.info('Loaded', activeJobs.value.size, 'pending jobs')
    } catch (e) {
      logger.warn('Failed to load jobs:', e)
    }
  }

  // ============================================================================
  // JOB REGISTRATION
  // ============================================================================

  function registerJob(jobId: string, threadId: string, userMessage: string): PendingJob {
    const job: PendingJob = {
      jobId,
      threadId,
      userMessage,
      timestamp: Date.now(),
      status: 'polling',
      progress: 'Starting...',
      progressPercent: 0,
      toolsCalled: [],
      consecutiveFailures: 0
    }

    activeJobs.value.set(jobId, job)
    savePendingJobs()
    
    logger.info('Registered job:', jobId)

    // Show "query started" notification (only if not on chat page to avoid duplication)
    const currentPath = router.currentRoute.value.path
    if (currentPath !== '/chat') {
      const queryPreview = userMessage.length > 50 
        ? userMessage.substring(0, 50) + '...' 
        : userMessage

      toast.add({
        title: '🚀 Query Started',
        description: `"${queryPreview}"`,
        icon: 'i-heroicons-rocket-launch',
        color: 'purple',
        timeout: 4000
      })
    }

    // Ensure polling is running
    startPolling()

    return job
  }
  
  function addToRecentCompletions(job: PendingJob, success: boolean, response?: string) {
    recentCompletions.value.unshift({
      job: { ...job },
      completedAt: Date.now(),
      success,
      response: response?.substring(0, 200)
    })
    
    // Keep only the most recent completions
    if (recentCompletions.value.length > MAX_RECENT_COMPLETIONS) {
      recentCompletions.value = recentCompletions.value.slice(0, MAX_RECENT_COMPLETIONS)
    }
  }

  function unregisterJob(jobId: string) {
    activeJobs.value.delete(jobId)
    jobCallbacks.delete(jobId)
    savePendingJobs()
    if (![...activeJobs.value.values()].some(job => job.status === 'polling')) stopPolling()
  }

  // ============================================================================
  // POLLING LOOP
  // ============================================================================

  function startPolling() {
    if (isPollingActive.value) return

    isPollingActive.value = true
    logger.info('Starting background polling service')

    // Poll every 2 seconds
    pollIntervalId.value = setInterval(() => {
      pollAllJobs()
    }, 2000)

    // Run immediately
    pollAllJobs()
  }

  function stopPolling() {
    if (pollIntervalId.value) {
      clearInterval(pollIntervalId.value)
      pollIntervalId.value = null
    }
    isPollingActive.value = false
    logger.info('Stopped background polling service')
  }

  async function pollAllJobs() {
    if (pollCycleRunning) return
    pollCycleRunning = true

    try {
      for (const job of activeJobs.value.values()) {
        if (job.status !== 'polling') continue
        await pollJob(job)
      }
    } finally {
      pollCycleRunning = false
    }

    // Stop polling if no more active jobs
    if (![...activeJobs.value.values()].some(job => job.status === 'polling')) {
      stopPolling()
    }
  }

  async function pollJob(job: PendingJob) {
    // Skip if already completed or being processed
    if (job.status !== 'polling') {
      logger.info('Skipping job', job.jobId, '- status is', job.status)
      return
    }

    if (job.nextPollAt && Date.now() < job.nextPollAt) return
    if (Date.now() - job.timestamp > MAX_JOB_AGE_MS) {
      await handleJobError(job, 'Polling timed out before the job reached a terminal state')
      return
    }
    
    const pollUrl = `/api/strands/chat/async/${job.jobId}`

    try {
      const status = await $fetch(pollUrl, { method: 'GET' }) as any

      if (!status.success) {
        throw new Error(status.error || 'Failed to poll job status')
      }

      job.consecutiveFailures = 0
      job.nextPollAt = undefined
      job.lastError = undefined

      // Double-check job wasn't completed while we were fetching
      if (job.status !== 'polling') {
        logger.info('Job', job.jobId, 'status changed while polling, skipping')
        return
      }

      // Track status history before updating progress
      const newProgress = status.currentStep || 'Processing...'
      if (job.progress && newProgress !== job.progress) {
        if (!job.statusHistory) job.statusHistory = []
        job.statusHistory.push({
          text: job.progress,
          timestamp: Date.now()
        })
        // Keep only last 5
        if (job.statusHistory.length > 5) {
          job.statusHistory.shift()
        }
      }

      // Update job progress
      job.progress = newProgress
      job.progressPercent = status.progressPercent || 0
      job.toolsCalled = status.toolsCalled || []

      // Call progress callback if registered
      const callbacks = jobCallbacks.get(job.jobId)
      for (const callback of callbacks?.values() || []) {
        try {
          callback.onProgress?.({
            jobId: job.jobId,
            threadId: job.threadId,
            progress: newProgress,
            percent: status.progressPercent || 0,
            tools: status.toolsCalled || []
          })
        } catch (err) {
          logger.error('Error in onProgress callback:', err)
        }
      }

      logger.info('Job', job.jobId, 'status:', status.status, 'progress:', job.progress)

      // Check if complete
      if (status.status === 'complete') {
        // Mark as complete immediately to prevent duplicate handling
        job.status = 'complete'
        await handleJobComplete(job, status)
        return
      }

      if (status.status === 'waiting_for_input') {
        job.status = 'waiting_for_input'
        handleJobDisambiguation(job, status.disambiguation)
        return
      }

      // Check if errored
      if (status.status === 'error') {
        job.status = 'error'
        await handleJobError(job, status.errorMessage || 'Query failed', status.disambiguation)
        return
      }

      if (status.status === 'canceled') {
        job.status = 'error'
        await handleJobError(job, 'Query canceled by user')
        return
      }

    } catch (error: any) {
      logger.error('Fetch error for job:', job.jobId, error)
      job.consecutiveFailures = (job.consecutiveFailures || 0) + 1
      job.lastError = error?.message || 'Unable to reach the polling service'
      job.nextPollAt = Date.now() + Math.min(1000 * (2 ** job.consecutiveFailures), 30000)
      savePendingJobs()

      if (job.consecutiveFailures >= MAX_POLL_FAILURES) {
        job.status = 'paused'
        notifyError(job, `${job.lastError}. Polling paused after ${MAX_POLL_FAILURES} attempts.`, true)
        savePendingJobs()
      }
    }
  }

  // ============================================================================
  // JOB COMPLETION HANDLERS
  // ============================================================================

  async function handleJobComplete(job: PendingJob, status: any) {
    const botResponse = status.response || 'No response received.'
    const metadata = status.metadata || {}
    const duration = Math.round((Date.now() - job.timestamp) / 1000)
    const callbacks = jobCallbacks.get(job.jobId)

    logger.info('Job complete:', job.jobId, 'hasCallbacks:', !!callbacks)

    // Call UI callbacks first (if registered)
    for (const callback of callbacks?.values() || []) {
      try {
        callback.onComplete?.({
          jobId: job.jobId,
          threadId: job.threadId,
          response: botResponse,
          metadata,
          suggestedLinks: status.suggestedLinks || [],
          suggestedPrompts: status.suggestedPrompts || []
        })
        logger.info('Called onComplete callback for job:', job.jobId)
      } catch (err) {
        logger.error('Error in onComplete callback:', err)
      }
    }

    // Show toast only if no UI callbacks (user navigated away)
    if (!callbacks?.size) {
      const queryPreview = job.userMessage.length > 60
        ? job.userMessage.substring(0, 60) + '...'
        : job.userMessage

      toast.add({
        title: '✅ Query Complete',
        description: queryPreview,
        icon: 'i-heroicons-check-circle',
        color: 'green',
        timeout: 10000,
        ui: {
          description: 'line-clamp-2'
        },
        actions: [{
          label: 'View Response',
          click: () => {
            router.push({ path: '/chat', query: { thread: job.threadId } })
          }
        }]
      })

      const toolsInfo = job.toolsCalled && job.toolsCalled.length > 0
        ? `Used ${job.toolsCalled.length} tool${job.toolsCalled.length > 1 ? 's' : ''}: ${job.toolsCalled.slice(0, 3).join(', ')}${job.toolsCalled.length > 3 ? '...' : ''}`
        : ''

      if (toolsInfo) {
        setTimeout(() => {
          toast.add({
            title: `Completed in ${duration}s`,
            description: toolsInfo,
            icon: 'i-heroicons-wrench-screwdriver',
            color: 'gray',
            timeout: 5000
          })
        }, 500)
      }
    }

    // Add to recent completions for history
    addToRecentCompletions(job, true, botResponse)

    // Cleanup
    unregisterJobCallbacks(job.jobId)
    unregisterJob(job.jobId)
  }

  function notifyError(job: PendingJob, errorMsg: string, recoverable: boolean, disambiguation?: any) {
    const callbacks = jobCallbacks.get(job.jobId)
    for (const callback of callbacks?.values() || []) {
      try {
        callback.onError?.({ jobId: job.jobId, threadId: job.threadId, error: errorMsg, recoverable, disambiguation })
      } catch (err) {
        logger.error('Error in onError callback:', err)
      }
    }
  }

  function handleJobDisambiguation(job: PendingJob, disambiguation: any) {
    const callbacks = jobCallbacks.get(job.jobId)
    job.disambiguation = disambiguation
    savePendingJobs()
    logger.info('Job requires account selection:', job.jobId, 'hasCallbacks:', !!callbacks)

    for (const callback of callbacks?.values() || []) {
      try {
        callback.onDisambiguation?.({
          jobId: job.jobId,
          threadId: job.threadId,
          disambiguation
        })
      } catch (error) {
        logger.error('Error in onDisambiguation callback:', error)
      }
    }

    if (!callbacks?.size) {
      toast.add({
        title: 'Account selection required',
        description: job.userMessage.substring(0, 80),
        icon: 'i-heroicons-question-mark-circle',
        color: 'blue',
        timeout: 12000,
        actions: [{
          label: 'Choose Account',
          click: () => router.push({ path: '/chat', query: { thread: job.threadId } })
        }]
      })
    }

    unregisterJobCallbacks(job.jobId)
    if (![...activeJobs.value.values()].some(activeJob => activeJob.status === 'polling')) stopPolling()
  }

  async function handleJobError(job: PendingJob, errorMsg: string, disambiguation?: any) {
    const duration = Math.round((Date.now() - job.timestamp) / 1000)
    const isTimeout = errorMsg.toLowerCase().includes('timeout')
    const callbacks = jobCallbacks.get(job.jobId)
    job.status = 'error'

    logger.error('Job error:', job.jobId, 'hasCallbacks:', !!callbacks, errorMsg)

    // Call UI callbacks first (if registered)
    notifyError(job, errorMsg, false, disambiguation)

    // Show toast only if no UI callbacks (user navigated away)
    if (!callbacks?.size) {
      const queryPreview = job.userMessage.length > 50
        ? job.userMessage.substring(0, 50) + '...'
        : job.userMessage

      if (isTimeout) {
        toast.add({
          title: '⏱️ Query Timed Out',
          description: `"${queryPreview}" took too long (${duration}s). Try a more specific query.`,
          icon: 'i-heroicons-clock',
          color: 'orange',
          timeout: 12000,
          actions: [
            {
              label: 'View Details',
              click: () => router.push({ path: '/chat', query: { thread: job.threadId } })
            },
            {
              label: 'Retry',
              click: () => router.push({ path: '/chat', query: { thread: job.threadId } })
            }
          ]
        })
      } else {
        toast.add({
          title: '❌ Query Failed',
          description: `"${queryPreview}"\n${errorMsg.substring(0, 80)}`,
          icon: 'i-heroicons-exclamation-circle',
          color: 'red',
          timeout: 12000,
          actions: [
            {
              label: 'View Details',
              click: () => router.push({ path: '/chat', query: { thread: job.threadId } })
            },
            {
              label: 'Try Again',
              click: () => router.push({ path: '/chat', query: { thread: job.threadId } })
            }
          ]
        })
      }
    }

    // Add to recent completions for history
    addToRecentCompletions(job, false, errorMsg)

    // Cleanup
    unregisterJobCallbacks(job.jobId)
    unregisterJob(job.jobId)
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  function initialize() {
    if (initialized) return
    initialized = true
    // Load any pending jobs from storage
    loadPendingJobs()

    // Start polling if we have pending jobs
    if (activeJobs.value.size > 0) {
      startPolling()
    }
  }

  function reconnectJob(jobId: string): boolean {
    const job = activeJobs.value.get(jobId)
    if (!job || job.status !== 'paused') return false
    job.status = 'polling'
    job.consecutiveFailures = 0
    job.nextPollAt = undefined
    job.lastError = undefined
    savePendingJobs()
    startPolling()
    return true
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    // State
    activeJobs: readonly(activeJobs),
    activeJobCount: computed(() => activeJobs.value.size),
    isPolling: readonly(isPollingActive),
    recentCompletions: readonly(recentCompletions),

    // Job registration
    registerJob,
    unregisterJob,
    reconnectJob,

    // Callback management (for UI updates)
    registerJobCallbacks,
    unregisterJobCallbacks,
    hasCallbacks,

    // Lifecycle
    initialize,
    startPolling,
    stopPolling,

    // Get job by ID
    getJob: (jobId: string) => activeJobs.value.get(jobId),

    // Get jobs for a specific thread
    getJobsForThread: (threadId: string) => {
      return Array.from(activeJobs.value.values()).filter(j => j.threadId === threadId)
    },

    // Check if a thread has active jobs (for sidebar indicators)
    hasActiveJobsForThread: (threadId: string) => {
      return Array.from(activeJobs.value.values()).some(
        job => job.threadId === threadId && job.status === 'polling'
      )
    },

    // Clear recent completions
    clearRecentCompletions: () => {
      recentCompletions.value = []
    }
  }
}
