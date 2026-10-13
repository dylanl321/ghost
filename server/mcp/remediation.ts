import { getAccountVulnerabilities, type VulnerabilityFinding } from '../utils/inspector-findings'

export type DeploymentState = 'currently_deployed' | 'retained_not_deployed' | 'stale_superseded' | 'unknown'

function severityRank(severity: string): number {
  return ({ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4, UNTRIAGED: 5 } as Record<string, number>)[severity] ?? 6
}

function deploymentState(finding: VulnerabilityFinding, now: number): DeploymentState {
  const observed = finding.lastObservedAt || finding.updatedAt
  const ageDays = observed ? (now - Date.parse(observed)) / 86_400_000 : Number.POSITIVE_INFINITY
  if (ageDays > 90) return 'stale_superseded'
  if (finding.instanceId?.startsWith('i-') || finding.lambdaArn) return 'currently_deployed'
  if (finding.imageDigest || finding.repository) return 'retained_not_deployed'
  return 'unknown'
}

function keyFor(finding: VulnerabilityFinding): string {
  return [
    [...finding.cveIds].sort().join(','), finding.packageName || '', finding.imageDigest || '',
    finding.repository || '', finding.lambdaArn || '', finding.workload || finding.instanceId || ''
  ].join('|')
}

export function deduplicateRemediationFindings(findings: VulnerabilityFinding[], now = Date.now()) {
  const groups = new Map<string, { key: string; findings: VulnerabilityFinding[]; deploymentState: DeploymentState }>()
  for (const finding of findings) {
    const key = keyFor(finding)
    const current = groups.get(key) || { key, findings: [], deploymentState: deploymentState(finding, now) }
    current.findings.push(finding)
    const nextState = deploymentState(finding, now)
    if (current.deploymentState !== 'currently_deployed' && nextState === 'currently_deployed') current.deploymentState = nextState
    groups.set(key, current)
  }
  return Array.from(groups.values()).map(group => {
    const sorted = [...group.findings].sort((left, right) => severityRank(left.severity) - severityRank(right.severity))
    const representative = sorted[0]!
    return {
      key: group.key,
      severity: representative.severity,
      cves: [...new Set(group.findings.flatMap(item => item.cveIds))].sort(),
      package: representative.packageName ? { name: representative.packageName, vulnerableVersion: representative.packageVersion, fixedVersion: representative.fixedVersion } : undefined,
      artifact: { imageDigest: representative.imageDigest, repository: representative.repository, lambdaArn: representative.lambdaArn, workload: representative.workload || representative.instanceId },
      deploymentState: group.deploymentState,
      affectedFindingCount: group.findings.length,
      remediation: representative.remediation,
      sourceTimestamps: group.findings.map(item => item.updatedAt || item.lastObservedAt).filter(Boolean).sort()
    }
  }).sort((left, right) => severityRank(left.severity) - severityRank(right.severity))
}

export async function createRemediationPlan(accountId: string, environment: 'commercial' | 'govcloud') {
  const result = await getAccountVulnerabilities(accountId, environment)
  const groups = deduplicateRemediationFindings(result.findings)
  return {
    accountId,
    environment,
    sourceTimestamp: result.findings.map(finding => finding.updatedAt).filter(Boolean).sort().at(-1),
    groups,
    uncertainty: ['Deployment state is evidence-based from current Inspector resource observations; artifacts without a current workload association remain unknown.']
  }
}
