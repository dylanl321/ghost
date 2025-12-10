/**
 * GitLab API Integration
 * Fetches additional pipeline and commit metadata from GitLab REST API
 * https://docs.gitlab.com/api/rest/
 */

import { logger } from './logger'
import { getCacheManager } from './cache-manager'

// GitLab API configuration
const GITLAB_TOKEN = process.env.GITLAB_API_TOKEN || ''
const CACHE_TTL_SECONDS = 1800 // 30 minutes cache for GitLab data

// Note: We extract base URL from job_url instead of using GITLAB_BASE_URL env var
// This allows supporting multiple GitLab instances automatically

/**
 * GitLab Job Details from API
 * https://docs.gitlab.com/api/jobs.html#get-a-single-job
 */
export interface GitLabJobDetails {
  id: number
  status: string
  stage: string
  name: string
  ref: string // branch or tag
  tag: boolean
  coverage: number | null
  allow_failure: boolean
  created_at: string
  started_at: string
  finished_at: string
  duration: number
  queued_duration: number
  user: {
    id: number
    username: string
    name: string
    avatar_url: string
  }
  commit: {
    id: string // SHA
    short_id: string
    title: string
    message: string
    author_name: string
    author_email: string
    authored_date: string
    committer_name: string
    committer_email: string
    committed_date: string
    web_url: string
  }
  pipeline: {
    id: number
    project_id: number
    ref: string
    sha: string
    status: string
    web_url: string
  }
  web_url: string
  artifacts: any[]
  runner: {
    id: number
    description: string
    active: boolean
    is_shared: boolean
  } | null
  artifacts_expire_at: string | null
  tag_list: string[]
}

/**
 * GitLab Pipeline Details from API
 * https://docs.gitlab.com/api/pipelines.html#get-a-single-pipeline
 */
export interface GitLabPipelineDetails {
  id: number
  iid: number
  project_id: number
  sha: string
  ref: string
  status: string
  source: string // push, web, trigger, schedule, api, external, pipeline, etc.
  created_at: string
  updated_at: string
  web_url: string
  before_sha: string
  tag: boolean
  yaml_errors: string | null
  user: {
    id: number
    username: string
    name: string
    avatar_url: string
  }
  started_at: string
  finished_at: string
  committed_at: string
  duration: number
  queued_duration: number
  coverage: string | null
  detailed_status: {
    icon: string
    text: string
    label: string
    group: string
  }
}

/**
 * GitLab Merge Request Details from API
 * https://docs.gitlab.com/api/merge_requests.html#get-single-mr
 */
export interface GitLabMergeRequest {
  id: number
  iid: number
  project_id: number
  title: string
  description: string
  state: string // opened, closed, locked, merged
  created_at: string
  updated_at: string
  merged_by: {
    id: number
    username: string
    name: string
  } | null
  merged_at: string | null
  closed_by: any | null
  closed_at: string | null
  target_branch: string
  source_branch: string
  author: {
    id: number
    username: string
    name: string
    avatar_url: string
  }
  sha: string
  web_url: string
  labels: string[]
  draft: boolean
  work_in_progress: boolean
  has_conflicts: boolean
  merge_status: string
}

/**
 * Parse GitLab project path from job URL
 * URL format: https://gitlab.example.com/{namespace}/{project}/-/jobs/{jobId}
 */
function parseProjectFromJobUrl(jobUrl: string): { projectPath: string, jobId: string, baseUrl: string } | null {
  try {
    const url = new URL(jobUrl)
    const pathParts = url.pathname.split('/').filter(Boolean)

    const dashIndex = pathParts.indexOf('-')
    if (dashIndex === -1 || dashIndex < 2) {
      return null
    }

    const projectPath = pathParts.slice(0, dashIndex).join('/')
    const jobsIndex = pathParts.indexOf('jobs')
    const jobId = jobsIndex !== -1 && pathParts[jobsIndex + 1] ? pathParts[jobsIndex + 1] : ''

    return {
      projectPath,
      jobId,
      baseUrl: url.origin
    }
  } catch (error) {
    logger.error('[GitLab API] Failed to parse job URL:', error)
    return null
  }
}

/**
 * Fetch GitLab job details
 * https://docs.gitlab.com/api/jobs.html#get-a-single-job
 */
export async function getGitLabJobDetails(jobUrl: string): Promise<GitLabJobDetails | null> {
  if (!GITLAB_TOKEN) {
    logger.warn('[GitLab API] No GITLAB_API_TOKEN configured, skipping job details fetch')
    return null
  }

  const cache = getCacheManager()
  const cacheKey = `gitlab:job:${jobUrl}`

  // Check cache
  const cached = await cache.get(cacheKey)
  if (cached) {
    logger.info('[GitLab API] Cache hit for job details')
    return cached as GitLabJobDetails
  }

  const parsed = parseProjectFromJobUrl(jobUrl)
  if (!parsed) {
    logger.warn(`[GitLab API] Failed to parse job URL: ${jobUrl}`)
    return null
  }

  const { projectPath, jobId, baseUrl } = parsed
  const encodedProject = encodeURIComponent(projectPath)
  const apiUrl = `${baseUrl}/api/v4/projects/${encodedProject}/jobs/${jobId}`

  logger.info(`[GitLab API] Fetching job from: ${apiUrl}`)

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'PRIVATE-TOKEN': GITLAB_TOKEN
      }
    })

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn(`[GitLab API] Job not found: ${jobId}`)
        return null
      }
      if (response.status === 401) {
        logger.error(`[GitLab API] Authentication failed - check GITLAB_API_TOKEN`)
        return null
      }
      throw new Error(`GitLab API returned ${response.status}: ${response.statusText}`)
    }

    const jobDetails = await response.json() as GitLabJobDetails

    // Cache the result
    await cache.set(cacheKey, jobDetails, { ttl: CACHE_TTL_SECONDS })

    logger.info(`[GitLab API] Successfully fetched job details for ${jobId}`)
    return jobDetails

  } catch (error: any) {
    logger.error(`[GitLab API] Failed to fetch job details for ${jobUrl}:`, error.message)
    return null
  }
}

/**
 * Fetch GitLab pipeline details
 * https://docs.gitlab.com/api/pipelines.html#get-a-single-pipeline
 */
export async function getGitLabPipelineDetails(jobUrl: string, pipelineId: number): Promise<GitLabPipelineDetails | null> {
  if (!GITLAB_TOKEN) {
    logger.warn('[GitLab API] No GITLAB_API_TOKEN configured, skipping pipeline details fetch')
    return null
  }

  const cache = getCacheManager()
  const cacheKey = `gitlab:pipeline:${jobUrl}:${pipelineId}`

  // Check cache
  const cached = await cache.get(cacheKey)
  if (cached) {
    return cached as GitLabPipelineDetails
  }

  const parsed = parseProjectFromJobUrl(jobUrl)
  if (!parsed) {
    return null
  }

  const { projectPath, baseUrl } = parsed
  const encodedProject = encodeURIComponent(projectPath)
  const apiUrl = `${baseUrl}/api/v4/projects/${encodedProject}/pipelines/${pipelineId}`

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'PRIVATE-TOKEN': GITLAB_TOKEN
      }
    })

    if (!response.ok) {
      if (response.status === 404) {
        logger.warn(`[GitLab API] Pipeline not found: ${pipelineId}`)
        return null
      }
      throw new Error(`GitLab API returned ${response.status}: ${response.statusText}`)
    }

    const pipelineDetails = await response.json() as GitLabPipelineDetails

    // Cache the result
    await cache.set(cacheKey, pipelineDetails, { ttl: CACHE_TTL_SECONDS })

    logger.info(`[GitLab API] Fetched pipeline details for ${pipelineId}`)
    return pipelineDetails

  } catch (error: any) {
    logger.error(`[GitLab API] Failed to fetch pipeline details:`, error.message)
    return null
  }
}

/**
 * Find merge requests associated with a commit SHA
 * https://docs.gitlab.com/api/merge_requests.html#list-project-merge-requests
 */
export async function findMergeRequestForCommit(jobUrl: string, commitSha: string): Promise<GitLabMergeRequest | null> {
  if (!GITLAB_TOKEN) {
    return null
  }

  const cache = getCacheManager()
  const cacheKey = `gitlab:mr:${jobUrl}:${commitSha}`

  // Check cache
  const cached = await cache.get(cacheKey)
  if (cached) {
    return cached as GitLabMergeRequest
  }

  const parsed = parseProjectFromJobUrl(jobUrl)
  if (!parsed) {
    return null
  }

  const { projectPath, baseUrl } = parsed
  const encodedProject = encodeURIComponent(projectPath)
  const apiUrl = `${baseUrl}/api/v4/projects/${encodedProject}/repository/commits/${commitSha}/merge_requests`

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'PRIVATE-TOKEN': GITLAB_TOKEN
      }
    })

    if (!response.ok) {
      return null
    }

    const mergeRequests = await response.json() as GitLabMergeRequest[]

    // Return the first (most relevant) MR
    const mr = mergeRequests.length > 0 ? mergeRequests[0] : null

    if (mr) {
      // Cache the result
      await cache.set(cacheKey, mr, { ttl: CACHE_TTL_SECONDS })
      logger.info(`[GitLab API] Found MR !${mr.iid} for commit ${commitSha}`)
    }

    return mr

  } catch (error: any) {
    logger.error(`[GitLab API] Failed to find MR for commit ${commitSha}:`, error.message)
    return null
  }
}

/**
 * Get enriched pipeline data by combining Athena data with GitLab API
 */
export async function enrichPipelineWithGitLabData(pipelineRun: any): Promise<any> {
  const { job_url, pipeline_id } = pipelineRun

  logger.info(`[GitLab API] Attempting to enrich pipeline ${pipeline_id} with job_url: ${job_url}`)

  if (!job_url) {
    logger.warn('[GitLab API] No job_url provided, skipping enrichment')
    return pipelineRun
  }

  try {
    // Fetch job details (includes commit info)
    const jobDetails = await getGitLabJobDetails(job_url)

    if (!jobDetails) {
      logger.warn('[GitLab API] No job details returned, skipping enrichment')
      return pipelineRun
    }

    logger.info(`[GitLab API] Job details fetched, commit: ${jobDetails.commit.short_id}`)

    // Fetch merge request info if available
    const mergeRequest = await findMergeRequestForCommit(job_url, jobDetails.commit.id)

    if (mergeRequest) {
      logger.info(`[GitLab API] Found MR !${mergeRequest.iid}`)
    } else {
      logger.info('[GitLab API] No MR found for commit')
    }

    // Return enriched data
    return {
      ...pipelineRun,
      gitlab: {
        job: {
          id: jobDetails.id,
          ref: jobDetails.ref,
          tag: jobDetails.tag,
          user: jobDetails.user,
          runner: jobDetails.runner,
          queued_duration: jobDetails.queued_duration
        },
        commit: {
          sha: jobDetails.commit.id,
          short_sha: jobDetails.commit.short_id,
          title: jobDetails.commit.title,
          message: jobDetails.commit.message,
          author_name: jobDetails.commit.author_name,
          author_email: jobDetails.commit.author_email,
          authored_date: jobDetails.commit.authored_date,
          web_url: jobDetails.commit.web_url
        },
        merge_request: mergeRequest ? {
          iid: mergeRequest.iid,
          title: mergeRequest.title,
          state: mergeRequest.state,
          source_branch: mergeRequest.source_branch,
          target_branch: mergeRequest.target_branch,
          author: mergeRequest.author,
          web_url: mergeRequest.web_url,
          labels: mergeRequest.labels,
          draft: mergeRequest.draft
        } : null,
        pipeline: jobDetails.pipeline ? {
          id: jobDetails.pipeline.id,
          ref: jobDetails.pipeline.ref,
          sha: jobDetails.pipeline.sha,
          web_url: jobDetails.pipeline.web_url
        } : null
      }
    }

  } catch (error: any) {
    logger.error('[GitLab API] Failed to enrich pipeline data:', error.message)
    return pipelineRun
  }
}
