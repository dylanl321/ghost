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

import type { ChatMessage } from '~/shared/types/chat-threads'

// Storage key for pending jobs
const PENDING_JOBS_KEY = 'ghost-chat-pending-jobs'

/**
 * Callbacks for UI updates during polling
 */
export interface PollingCallbacks {
  onProgress?: (jobId: string, progress: string, percent: number, tools: string[]) => void
  onComplete?: (jobId: string, response: string, metadata: any, suggestedLinks?: any[], suggestedPrompts?: any[]) => void
  onError?: (jobId: string, error: string) => void
}

export interface PendingJob {
  jobId: string
  threadId: string
  userMessage: string
  timestamp: number
  status: 'polling' | 'complete' | 'error'
  progress?: string
  progressPercent?: number
  toolsCalled?: string[]
  statusHistory?: Array<{ text: string; timestamp: number }>
}

// Singleton state - shared across all instances
const activeJobs = ref<Map<string, PendingJob>>(new Map())
const jobCallbacks = ref<Map<string, PollingCallbacks>>(new Map())
const recentCompletions = ref<Array<{ job: PendingJob; completedAt: number; success: boolean; response?: string }>>([])
const isPollingActive = ref(false)
const pollIntervalId = ref<NodeJS.Timeout | null>(null)

// Max recent completions to keep
const MAX_RECENT_COMPLETIONS = 10

export function useBackgroundPolling() {
  const toast = useToast()
  const router = useRouter()

  // ============================================================================
  // CALLBACK MANAGEMENT
  // ============================================================================

  /**
   * Register callbacks for a job to receive live UI updates
   */
  function registerJobCallbacks(jobId: string, callbacks: PollingCallbacks) {
    jobCallbacks.value.set(jobId, callbacks)
    console.log('[BackgroundPolling] Registered callbacks for job:', jobId)
  }

  /**
   * Unregister callbacks (e.g., when switching threads)
   */
  function unregisterJobCallbacks(jobId: string) {
    jobCallbacks.value.delete(jobId)
    console.log('[BackgroundPolling] Unregistered callbacks for job:', jobId)
  }

  /**
   * Check if a job has callbacks registered (UI is actively watching)
   */
  function hasCallbacks(jobId: string): boolean {
    return jobCallbacks.value.has(jobId)
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
      localStorage.setItem(PENDING_JOBS_KEY, JSON.stringify(jobs))
    } catch (e) {
      console.warn('[BackgroundPolling] Failed to save jobs:', e)
    }
  }

  function loadPendingJobs() {
    try {
      const stored = localStorage.getItem(PENDING_JOBS_KEY)
      if (!stored) return

      const jobs = JSON.parse(stored) as (PendingJob & { id: string })[]
      const now = Date.now()
      const maxAge = 10 * 60 * 1000 // 10 minutes

      for (const job of jobs) {
        // Skip expired jobs
        if (now - job.timestamp > maxAge) continue
        // Only restore jobs that were still polling
        if (job.status === 'polling') {
          activeJobs.value.set(job.jobId, job)
        }
      }

      // Clean up expired jobs from storage
      savePendingJobs()

      console.log('[BackgroundPolling] Loaded', activeJobs.value.size, 'pending jobs')
    } catch (e) {
      console.warn('[BackgroundPolling] Failed to load jobs:', e)
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
      toolsCalled: []
    }

    activeJobs.value.set(jobId, job)
    savePendingJobs()
    
    console.log('[BackgroundPolling] Registered job:', jobId)

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
    savePendingJobs()
  }

  // ============================================================================
  // POLLING LOOP
  // ============================================================================

  function startPolling() {
    if (isPollingActive.value) return

    isPollingActive.value = true
    console.log('[BackgroundPolling] Starting background polling service')

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
    console.log('[BackgroundPolling] Stopped background polling service')
  }

  async function pollAllJobs() {
    const jobsToRemove: string[] = []

    for (const [jobId, job] of activeJobs.value.entries()) {
      if (job.status !== 'polling') continue

      try {
        await pollJob(job)
      } catch (error) {
        console.error('[BackgroundPolling] Error polling job:', jobId, error)
        // Mark for removal after too many failures
        job.status = 'error'
        jobsToRemove.push(jobId)
      }
    }

    // Clean up completed/failed jobs
    for (const jobId of jobsToRemove) {
      unregisterJob(jobId)
    }

    // Stop polling if no more active jobs
    if (activeJobs.value.size === 0) {
      stopPolling()
    }
  }

  async function pollJob(job: PendingJob) {
    // Skip if already completed or being processed
    if (job.status !== 'polling') {
      console.log('[BackgroundPolling] Skipping job', job.jobId, '- status is', job.status)
      return
    }
    
    const pollUrl = `/api/strands/chat/async/${job.jobId}`

    try {
      const status = await $fetch(pollUrl, { method: 'GET' }) as any

      if (!status.success) {
        throw new Error(status.error || 'Failed to poll job status')
      }

      // Double-check job wasn't completed while we were fetching
      if (job.status !== 'polling') {
        console.log('[BackgroundPolling] Job', job.jobId, 'status changed while polling, skipping')
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
      const callbacks = jobCallbacks.value.get(job.jobId)
      if (callbacks?.onProgress) {
        try {
          callbacks.onProgress(
            job.jobId,
            newProgress,
            status.progressPercent || 0,
            status.toolsCalled || []
          )
        } catch (err) {
          console.error('[BackgroundPolling] Error in onProgress callback:', err)
        }
      }

      console.log('[BackgroundPolling] Job', job.jobId, 'status:', status.status, 'progress:', job.progress)

      // Check if complete
      if (status.status === 'complete') {
        // Mark as complete immediately to prevent duplicate handling
        job.status = 'complete'
        await handleJobComplete(job, status)
        return
      }

      // Check if errored
      if (status.status === 'error') {
        job.status = 'error'
        await handleJobError(job, status.errorMessage || 'Query failed')
        return
      }

    } catch (error: any) {
      console.error('[BackgroundPolling] Fetch error for job:', job.jobId, error)
      // Don't fail immediately - will retry on next poll cycle
    }
  }

  // ============================================================================
  // JOB COMPLETION HANDLERS
  // ============================================================================

  async function handleJobComplete(job: PendingJob, status: any) {
    const botResponse = status.response || 'No response received.'
    const metadata = status.metadata || {}
    const duration = Math.round((Date.now() - job.timestamp) / 1000)
    const callbacks = jobCallbacks.value.get(job.jobId)

    console.log('[BackgroundPolling] Job complete:', job.jobId, 'hasCallbacks:', !!callbacks)

    // Call UI callbacks first (if registered)
    if (callbacks?.onComplete) {
      try {
        callbacks.onComplete(
          job.jobId,
          botResponse,
          metadata,
          status.suggestedLinks || [],
          status.suggestedPrompts || []
        )
        console.log('[BackgroundPolling] Called onComplete callback for job:', job.jobId)
      } catch (err) {
        console.error('[BackgroundPolling] Error in onComplete callback:', err)
      }
    }

    // Save to database directly via API (no thread switching!)
    try {
      await $fetch(`/api/chat/threads/${job.threadId}/messages`, {
        method: 'POST',
        body: {
          message: {
            role: 'assistant',
            content: botResponse,
            metadata,
            suggestedLinks: status.suggestedLinks || [],
            suggestedPrompts: status.suggestedPrompts || []
          }
        }
      })
      console.log('[BackgroundPolling] Saved response to thread via API:', job.threadId)
    } catch (err) {
      console.error('[BackgroundPolling] Failed to save message via API:', err)
    }

    // Show toast only if no UI callbacks (user navigated away)
    if (!callbacks) {
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
            router.push('/chat')
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

  async function handleJobError(job: PendingJob, errorMsg: string) {
    const duration = Math.round((Date.now() - job.timestamp) / 1000)
    const isTimeout = errorMsg.toLowerCase().includes('timeout')
    const callbacks = jobCallbacks.value.get(job.jobId)
    job.status = 'error'

    console.error('[BackgroundPolling] Job error:', job.jobId, 'hasCallbacks:', !!callbacks, errorMsg)

    // Call UI callbacks first (if registered)
    if (callbacks?.onError) {
      try {
        callbacks.onError(job.jobId, errorMsg)
        console.log('[BackgroundPolling] Called onError callback for job:', job.jobId)
      } catch (err) {
        console.error('[BackgroundPolling] Error in onError callback:', err)
      }
    }

    // Build error content for database
    const errorContent = isTimeout
      ? `⏱️ Query timed out after ${duration} seconds.\n\nOriginal query: "${job.userMessage}"\n\nPlease try a more specific query or break it into smaller parts.`
      : `❌ ${errorMsg}\n\nOriginal query: "${job.userMessage}"`

    // Save to database directly via API (no thread switching!)
    try {
      await $fetch(`/api/chat/threads/${job.threadId}/messages`, {
        method: 'POST',
        body: {
          message: {
            role: 'assistant',
            content: errorContent,
            metadata: {
              error: true,
              errorType: isTimeout ? 'timeout' : 'error',
              duration,
              originalQuery: job.userMessage
            }
          }
        }
      })
      console.log('[BackgroundPolling] Saved error to thread via API:', job.threadId)
    } catch (err) {
      console.error('[BackgroundPolling] Failed to save error message via API:', err)
    }

    // Show toast only if no UI callbacks (user navigated away)
    if (!callbacks) {
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
              click: () => router.push('/chat')
            },
            {
              label: 'Retry',
              click: () => router.push('/chat')
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
              click: () => router.push('/chat')
            },
            {
              label: 'Try Again',
              click: () => router.push('/chat')
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
    // Load any pending jobs from storage
    loadPendingJobs()

    // Start polling if we have pending jobs
    if (activeJobs.value.size > 0) {
      startPolling()
    }
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

