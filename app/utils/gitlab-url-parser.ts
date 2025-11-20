/**
 * GitLab URL Parser
 * Extracts repository information from GitLab job URLs
 *
 * Expected format: https://gitlab.example.com/{group}/{project}/-/jobs/{jobId}
 * Handles nested groups: https://gitlab.example.com/{parent}/{child}/{project}/-/jobs/{jobId}
 *
 * Examples:
 * - GDMSCloud/aws/terraform/aws-account-orchestrator
 *   → group: "GDMSCloud/aws/terraform"
 *   → project: "aws-account-orchestrator"
 *   → fullPath: "GDMSCloud/aws/terraform/aws-account-orchestrator"
 *
 * - GDMSCloud/aws/terraform/modules/security-baseline
 *   → group: "GDMSCloud/aws/terraform/modules"
 *   → project: "security-baseline"
 *   → fullPath: "GDMSCloud/aws/terraform/modules/security-baseline"
 */

import type { GitLabRepoInfo } from '~/shared/types/pipelines'

/**
 * Parse a GitLab job URL to extract repository information
 * @param jobUrl - Full GitLab job URL
 * @returns Parsed repository info or null if URL is invalid
 */
export function parseGitLabUrl(jobUrl: string): GitLabRepoInfo | null {
  if (!jobUrl || typeof jobUrl !== 'string') {
    return null
  }

  try {
    const url = new URL(jobUrl)

    // Path should be: /group/project/-/jobs/12345
    // or nested: /parent/child/project/-/jobs/12345
    const pathParts = url.pathname.split('/').filter(Boolean)

    // Find the index of '-' which separates the repo path from the job path
    const dashIndex = pathParts.indexOf('-')

    if (dashIndex === -1 || dashIndex < 2) {
      // Invalid format - need at least group/project before '/-/'
      console.warn(`[GitLab Parser] Invalid URL format: ${jobUrl}`)
      return null
    }

    // Everything before '-' is the repository path (handles nested groups)
    // Example: ["GDMSCloud", "aws", "terraform", "aws-account-orchestrator"]
    const repoParts = pathParts.slice(0, dashIndex)

    // Last part is always the project/repository name
    // Example: "aws-account-orchestrator"
    const project = repoParts[repoParts.length - 1]

    // Everything except the last part is the group path
    // Example: "GDMSCloud/aws/terraform"
    const group = repoParts.slice(0, -1).join('/')

    // Full path combines group and project
    // Example: "GDMSCloud/aws/terraform/aws-account-orchestrator"
    const fullPath = repoParts.join('/')

    // Extract job ID from the path after '/-/jobs/'
    const jobsIndex = pathParts.indexOf('jobs')
    const jobId = jobsIndex !== -1 && pathParts[jobsIndex + 1]
      ? pathParts[jobsIndex + 1]
      : ''

    return {
      group: group || 'unknown',
      project: project || 'unknown',
      fullPath,
      jobId,
      url: jobUrl
    }

  } catch (error) {
    console.warn(`[GitLab Parser] Failed to parse URL: ${jobUrl}`, error)
    return null
  }
}

/**
 * Format a repository path for display
 * @param repoInfo - Parsed repository information
 * @returns Formatted display string
 */
export function formatRepoDisplay(repoInfo: GitLabRepoInfo | null): string {
  if (!repoInfo) {
    return 'Unknown Repository'
  }

  return repoInfo.fullPath
}

/**
 * Get the GitLab project URL (without job path)
 * @param repoInfo - Parsed repository information
 * @returns Project URL or null
 */
export function getProjectUrl(repoInfo: GitLabRepoInfo | null): string | null {
  if (!repoInfo) {
    return null
  }

  try {
    const url = new URL(repoInfo.url)
    return `${url.origin}/${repoInfo.fullPath}`
  } catch {
    return null
  }
}

/**
 * Parse multiple job URLs and group by repository
 * @param jobUrls - Array of job URLs
 * @returns Map of repository fullPath to repo info
 */
export function groupByRepository(jobUrls: string[]): Map<string, GitLabRepoInfo> {
  const repoMap = new Map<string, GitLabRepoInfo>()

  jobUrls.forEach(url => {
    const repoInfo = parseGitLabUrl(url)
    if (repoInfo && !repoMap.has(repoInfo.fullPath)) {
      repoMap.set(repoInfo.fullPath, repoInfo)
    }
  })

  return repoMap
}

/**
 * Extract repository info from a pipeline run object
 * @param run - Pipeline run with job_url field
 * @returns Parsed repository info or null
 */
export function extractRepoFromRun(run: { job_url: string }): GitLabRepoInfo | null {
  return parseGitLabUrl(run.job_url)
}
