/**
 * Global Background Polling Service
 * 
 * This composable manages async chat polling that continues even when
 * navigating away from the chat page. It stores pending jobs and polls
 * them in the background, updating the store when complete.
 * 
 * Usage:
 * - Call `registerJob()` when submitting an async query
 * - The service will poll in the background until complete
 * - Results are stored in the thread via the store
 * - Toast notifications inform the user of completion
 */

import { useChatThreadsStore } from '~/stores/useChatThreadsStore'
import type { ChatMessage } from '~/shared/types/chat-threads'

// Storage key for pending jobs
const PENDING_JOBS_KEY = 'ghost-chat-pending-jobs'

export interface PendingJob {
  jobId: string
  threadId: string
  userMessage: string
  timestamp: number
  status: 'polling' | 'complete' | 'error'
  progress?: string
  progressPercent?: number
  toolsCalled?: string[]
  // Flag to indicate local polling is handling this job (don't save from background)
  handledLocally?: boolean
}

// Singleton state - shared across all instances
const activeJobs = ref<Map<string, PendingJob>>(new Map())
const recentCompletions = ref<Array<{ job: PendingJob; completedAt: number; success: boolean; response?: string }>>([])
const isPollingActive = ref(false)
const pollIntervalId = ref<NodeJS.Timeout | null>(null)

// Max recent completions to keep
const MAX_RECENT_COMPLETIONS = 10

export function useBackgroundPolling() {
  const threadsStore = useChatThreadsStore()
  const toast = useToast()
  const router = useRouter()

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

      // Update job progress
      job.progress = status.currentStep || 'Processing...'
      job.progressPercent = status.progressPercent || 0
      job.toolsCalled = status.toolsCalled || []

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
    console.log('[BackgroundPolling] Job complete:', job.jobId, 'handledLocally:', job.handledLocally)
    // Note: job.status already set to 'complete' before calling this

    // If local polling is handling this job, skip everything (local polling will save AND add to recent)
    if (job.handledLocally) {
      console.log('[BackgroundPolling] Skipping save - handled by local polling')
      unregisterJob(job.jobId)
      return
    }

    const botResponse = status.response || 'No response received.'
    const metadata = status.metadata || {}
    const duration = Math.round((Date.now() - job.timestamp) / 1000)

    // Update thread in store if it's loaded
    const isCurrentThread = threadsStore.activeThreadId === job.threadId
    
    if (isCurrentThread && threadsStore.currentThread?.messages) {
      // Find and update the pending message
      const messages = threadsStore.currentThread.messages
      const pendingIndex = messages.findIndex(m =>
        m.status?.status === 'pending' || m.status?.status === 'streaming'
      )

      if (pendingIndex !== -1) {
        messages[pendingIndex].content = botResponse
        messages[pendingIndex].metadata = metadata
        messages[pendingIndex].suggestedLinks = status.suggestedLinks || []
        messages[pendingIndex].suggestedPrompts = status.suggestedPrompts || []
        messages[pendingIndex].status = { status: 'complete' }
        delete messages[pendingIndex].streamBuffer
      }
    }

    // Save to database (only if not handled locally)
    try {
      // Temporarily switch to the job's thread if needed
      const originalThreadId = threadsStore.activeThreadId
      
      if (threadsStore.activeThreadId !== job.threadId) {
        // Load the thread to add the message
        await threadsStore.loadThread(job.threadId)
      }

      await threadsStore.addMessage({
        role: 'assistant',
        content: botResponse,
        metadata,
        suggestedLinks: status.suggestedLinks || [],
        suggestedPrompts: status.suggestedPrompts || []
      })

      // Restore original thread if we switched
      if (originalThreadId && originalThreadId !== job.threadId) {
        await threadsStore.loadThread(originalThreadId)
      }

      console.log('[BackgroundPolling] Saved response to thread:', job.threadId)
    } catch (err) {
      console.error('[BackgroundPolling] Failed to save message:', err)
    }

    // Format the query for display
    const queryPreview = job.userMessage.length > 60 
      ? job.userMessage.substring(0, 60) + '...' 
      : job.userMessage

    // Format tools used for display
    const toolsInfo = job.toolsCalled && job.toolsCalled.length > 0
      ? `Used ${job.toolsCalled.length} tool${job.toolsCalled.length > 1 ? 's' : ''}: ${job.toolsCalled.slice(0, 3).join(', ')}${job.toolsCalled.length > 3 ? '...' : ''}`
      : ''

    // Show rich toast notification
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

    // If tools were used, show a secondary info toast
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

    // Add to recent completions for history
    addToRecentCompletions(job, true, botResponse)

    // Remove from active jobs
    unregisterJob(job.jobId)
  }

  async function handleJobError(job: PendingJob, errorMsg: string) {
    console.error('[BackgroundPolling] Job error:', job.jobId, errorMsg, 'handledLocally:', job.handledLocally)
    job.status = 'error'

    // If local polling is handling this job, skip saving (it will save)
    if (job.handledLocally) {
      console.log('[BackgroundPolling] Skipping error save - handled by local polling')
      addToRecentCompletions(job, false, errorMsg)
      unregisterJob(job.jobId)
      return
    }

    const duration = Math.round((Date.now() - job.timestamp) / 1000)
    const isTimeout = errorMsg.toLowerCase().includes('timeout')

    // Update thread in store if it's loaded
    if (threadsStore.activeThreadId === job.threadId && threadsStore.currentThread?.messages) {
      const messages = threadsStore.currentThread.messages
      const pendingIndex = messages.findIndex(m =>
        m.status?.status === 'pending' || m.status?.status === 'streaming'
      )

      if (pendingIndex !== -1) {
        messages[pendingIndex].content = `❌ ${errorMsg}`
        messages[pendingIndex].status = { status: 'error', error: errorMsg }
      }
    }

    // Save error to database with context
    const errorContent = isTimeout 
      ? `⏱️ Query timed out after ${duration} seconds.\n\nOriginal query: "${job.userMessage}"\n\nPlease try a more specific query or break it into smaller parts.`
      : `❌ ${errorMsg}\n\nOriginal query: "${job.userMessage}"`

    try {
      const originalThreadId = threadsStore.activeThreadId
      
      if (threadsStore.activeThreadId !== job.threadId) {
        await threadsStore.loadThread(job.threadId)
      }

      await threadsStore.addMessage({
        role: 'assistant',
        content: errorContent,
        metadata: { 
          error: true,
          errorType: isTimeout ? 'timeout' : 'error',
          duration,
          originalQuery: job.userMessage
        }
      })

      if (originalThreadId && originalThreadId !== job.threadId) {
        await threadsStore.loadThread(originalThreadId)
      }
    } catch (err) {
      console.error('[BackgroundPolling] Failed to save error message:', err)
    }

    // Format query preview
    const queryPreview = job.userMessage.length > 50 
      ? job.userMessage.substring(0, 50) + '...' 
      : job.userMessage

    // Show appropriate toast notification
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

    // Add to recent completions for history
    addToRecentCompletions(job, false, errorMsg)

    // Remove from active jobs
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

    // Methods
    registerJob,
    unregisterJob,
    initialize,
    startPolling,
    stopPolling,

    // Get job by ID
    getJob: (jobId: string) => activeJobs.value.get(jobId),

    // Get jobs for a specific thread
    getJobsForThread: (threadId: string) => {
      return Array.from(activeJobs.value.values()).filter(j => j.threadId === threadId)
    },
    
    // Mark a job as being handled by local polling (prevents duplicate saves)
    markAsHandledLocally: (jobId: string) => {
      const job = activeJobs.value.get(jobId)
      if (job) {
        job.handledLocally = true
        console.log('[BackgroundPolling] Marked job as handled locally:', jobId)
      }
    },
    
    // Update job progress (for UI updates from local polling)
    updateJobProgress: (jobId: string, progress: string, percent: number, tools: string[]) => {
      const job = activeJobs.value.get(jobId)
      if (job) {
        job.progress = progress
        job.progressPercent = percent
        job.toolsCalled = tools
      }
    },
    
    // Clear recent completions
    clearRecentCompletions: () => {
      recentCompletions.value = []
    },
    
    // Add to recent completions (for local polling to call)
    addToRecentCompletions: (job: { jobId: string, threadId: string, userMessage: string, timestamp: number }, success: boolean, response?: string) => {
      addToRecentCompletions(job as PendingJob, success, response)
    }
  }
}

