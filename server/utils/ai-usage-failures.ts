export function classifyAIUsageCollectionFailure(message: string): { category: string; remediation: string } {
  const lower = message.toLowerCase()
  if (lower.includes('assumerole') || lower.includes('not authorized to perform: sts')) {
    return { category: 'Assume role', remediation: 'Verify the cross-account role exists and trusts the GHOST collection role.' }
  }
  if (lower.includes('service control policy') || lower.includes('explicit deny')) {
    return { category: 'SCP deny', remediation: 'Update the applicable service control policy to allow the collection action.' }
  }
  if (lower.includes('cloudwatch') || lower.includes('getmetricdata') || lower.includes('listmetrics')) {
    return { category: 'CloudWatch permission', remediation: 'Allow cloudwatch:ListMetrics and cloudwatch:GetMetricData in the target account.' }
  }
  if (lower.includes('athena') || lower.includes('security lake')) {
    return { category: 'Error cause collection', remediation: 'Verify Security Lake, Athena, Glue, and result-bucket access for this environment.' }
  }
  if (lower.includes('circuit breaker')) {
    return { category: 'Circuit breaker', remediation: 'Resolve the upstream AWS access failure, then run an incremental collection.' }
  }
  if (lower.includes('enotfound') || lower.includes('econn') || lower.includes('timeout')) {
    return { category: 'Network', remediation: 'Check AWS endpoint connectivity and retry the collection.' }
  }
  return { category: 'Other', remediation: 'Review the raw sample, correct the AWS access issue, and rerun collection.' }
}
