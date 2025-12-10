/**
 * Policy Export Composable
 * Handles exporting policy analysis data to various formats
 */

export function usePolicyExport() {
  /**
   * Format analysis data as plain text
   */
  const formatAsText = (data: any, accountName: string, environment: string): string => {
    const lines: string[] = []

    lines.push('='.repeat(70))
    lines.push(`AWS Service Control Policy Analysis`)
    lines.push('='.repeat(70))
    lines.push(``)
    lines.push(`Account: ${accountName}`)
    lines.push(`Environment: ${environment.toUpperCase()}`)
    lines.push(`Generated: ${new Date().toLocaleString()}`)
    lines.push(``)

    // AI Insights (if available)
    if (data.aiInsights) {
      lines.push(`AI ANALYSIS SUMMARY`)
      lines.push(`-`.repeat(70))
      lines.push(data.aiInsights.summary)
      lines.push(``)

      if (data.aiInsights.keyFindings?.length > 0) {
        lines.push(`Key Findings:`)
        data.aiInsights.keyFindings.forEach((finding: string, i: number) => {
          lines.push(`  ${i + 1}. ${finding}`)
        })
        lines.push(``)
      }

      if (data.aiInsights.riskAssessment) {
        lines.push(`Risk Level: ${data.aiInsights.riskAssessment.level.toUpperCase()}`)
        if (data.aiInsights.riskAssessment.concerns?.length > 0) {
          lines.push(`Concerns:`)
          data.aiInsights.riskAssessment.concerns.forEach((concern: string) => {
            lines.push(`  - ${concern}`)
          })
        }
        lines.push(``)
      }
    }

    // Summary Statistics
    lines.push(`SUMMARY STATISTICS`)
    lines.push(`-`.repeat(70))
    lines.push(`Total Policies: ${data.analysis.summary.totalPolicies}`)
    lines.push(`Total Statements: ${data.analysis.summary.totalStatements}`)
    lines.push(`Total Denials: ${data.analysis.summary.totalDenials}`)
    lines.push(`Conditional Denials: ${data.analysis.summary.totalConditionalDenials}`)
    lines.push(`Conditional Allows: ${data.analysis.summary.totalConditional}`)
    lines.push(`Has FullAWSAccess: ${data.analysis.summary.hasFullAccess ? 'Yes' : 'No'}`)
    lines.push(``)

    // Most Restricted Services
    if (data.analysis.summary.mostRestrictedServices?.length > 0) {
      lines.push(`MOST RESTRICTED SERVICES`)
      lines.push(`-`.repeat(70))
      data.analysis.summary.mostRestrictedServices.forEach((service: string) => {
        const serviceData = data.analysis.services[service]
        if (serviceData) {
          lines.push(`${service.toUpperCase()}:`)
          lines.push(`  - Denied Actions: ${serviceData.deniedActions.length}`)
          lines.push(`  - Conditional Actions: ${serviceData.conditionalActions.length}`)
          lines.push(`  - Policies Applied: ${serviceData.restrictedBy.join(', ')}`)
        }
      })
      lines.push(``)
    }

    // Applied Policies
    lines.push(`APPLIED POLICIES`)
    lines.push(`-`.repeat(70))
    data.policies.forEach((policy: any) => {
      lines.push(`${policy.name}`)
      lines.push(`  Source: ${policy.source}`)
      lines.push(`  Attached at: ${policy.attachedAt}`)
      lines.push(`  Statements: ${policy.statementCount}`)
      if (policy.description) {
        lines.push(`  Description: ${policy.description}`)
      }
      lines.push(``)
    })

    // Common Action Tests
    if (data.commonActionTests?.length > 0) {
      lines.push(`COMMON ACTION TESTS`)
      lines.push(`-`.repeat(70))
      data.commonActionTests.forEach((test: any) => {
        const status = test.result === 'allowed' ? '✓' : test.result === 'denied' ? '✗' : '⚠'
        lines.push(`${status} ${test.action}: ${test.result.toUpperCase()}`)
        if (test.deniedBy?.length > 0) {
          lines.push(`    Blocked by: ${test.deniedBy.map((p: any) => p.policyName).join(', ')}`)
        }
        if (test.conditionalBy?.length > 0) {
          lines.push(`    Conditional via: ${test.conditionalBy.map((p: any) => p.policyName).join(', ')}`)
        }
      })
      lines.push(``)
    }

    // AI Recommendations
    if (data.aiInsights?.recommendations?.length > 0) {
      lines.push(`RECOMMENDATIONS`)
      lines.push(`-`.repeat(70))
      data.aiInsights.recommendations.forEach((rec: any, i: number) => {
        lines.push(`${i + 1}. [${rec.priority.toUpperCase()}] ${rec.action}`)
        lines.push(`   Rationale: ${rec.rationale}`)
        lines.push(``)
      })
    }

    lines.push(`=`.repeat(70))
    lines.push(`End of Report`)
    lines.push(`=`.repeat(70))

    return lines.join('\n')
  }

  /**
   * Format analysis data as Markdown
   */
  const formatAsMarkdown = (data: any, accountName: string, environment: string): string => {
    const lines: string[] = []

    lines.push(`# AWS Service Control Policy Analysis\n`)
    lines.push(`**Account:** ${accountName}  `)
    lines.push(`**Environment:** ${environment.toUpperCase()}  `)
    lines.push(`**Generated:** ${new Date().toLocaleString()}\n`)
    lines.push(`---\n`)

    // AI Insights
    if (data.aiInsights) {
      lines.push(`## 🤖 AI Analysis\n`)
      lines.push(`${data.aiInsights.summary}\n`)

      if (data.aiInsights.keyFindings?.length > 0) {
        lines.push(`### Key Findings\n`)
        data.aiInsights.keyFindings.forEach((finding: string) => {
          lines.push(`- ${finding}`)
        })
        lines.push(``)
      }

      if (data.aiInsights.riskAssessment) {
        const riskEmoji = data.aiInsights.riskAssessment.level === 'critical' ? '🔴' :
                         data.aiInsights.riskAssessment.level === 'high' ? '🟠' :
                         data.aiInsights.riskAssessment.level === 'medium' ? '🟡' : '🟢'
        lines.push(`### Risk Assessment: ${riskEmoji} ${data.aiInsights.riskAssessment.level.toUpperCase()}\n`)
        if (data.aiInsights.riskAssessment.concerns?.length > 0) {
          data.aiInsights.riskAssessment.concerns.forEach((concern: string) => {
            lines.push(`- ⚠️ ${concern}`)
          })
        }
        lines.push(``)
      }
    }

    // Summary Statistics
    lines.push(`## 📊 Summary Statistics\n`)
    lines.push(`| Metric | Value |`)
    lines.push(`|--------|-------|`)
    lines.push(`| Total Policies | ${data.analysis.summary.totalPolicies} |`)
    lines.push(`| Total Statements | ${data.analysis.summary.totalStatements} |`)
    lines.push(`| Total Denials | ${data.analysis.summary.totalDenials} |`)
    lines.push(`| Conditional Denials | ${data.analysis.summary.totalConditionalDenials} |`)
    lines.push(`| Conditional Allows | ${data.analysis.summary.totalConditional} |`)
    lines.push(`| Has FullAWSAccess | ${data.analysis.summary.hasFullAccess ? '✅ Yes' : '❌ No'} |`)
    lines.push(``)

    // Most Restricted Services
    if (data.analysis.summary.mostRestrictedServices?.length > 0) {
      lines.push(`## 🔒 Most Restricted Services\n`)
      data.analysis.summary.mostRestrictedServices.forEach((service: string) => {
        const serviceData = data.analysis.services[service]
        if (serviceData) {
          lines.push(`### ${service.toUpperCase()}\n`)
          lines.push(`- **Denied Actions:** ${serviceData.deniedActions.length}`)
          lines.push(`- **Conditional Actions:** ${serviceData.conditionalActions.length}`)
          lines.push(`- **Policies Applied:** ${serviceData.restrictedBy.join(', ')}`)
          lines.push(``)
        }
      })
    }

    // Applied Policies
    lines.push(`## 📋 Applied Policies\n`)
    data.policies.forEach((policy: any) => {
      lines.push(`### ${policy.name}\n`)
      lines.push(`- **Source:** ${policy.source === 'direct' ? '📌 Direct' : '⬇️ Inherited'}`)
      lines.push(`- **Attached at:** ${policy.attachedAt}`)
      lines.push(`- **Statements:** ${policy.statementCount}`)
      if (policy.description) {
        lines.push(`- **Description:** ${policy.description}`)
      }
      lines.push(``)
    })

    // Common Action Tests
    if (data.commonActionTests?.length > 0) {
      lines.push(`## ⚡ Common Action Tests\n`)
      lines.push(`| Action | Result | Details |`)
      lines.push(`|--------|--------|---------|`)
      data.commonActionTests.forEach((test: any) => {
        const emoji = test.result === 'allowed' ? '✅' : test.result === 'denied' ? '❌' : '⚠️'
        const details = test.deniedBy?.length > 0
          ? `Blocked by: ${test.deniedBy.map((p: any) => p.policyName).join(', ')}`
          : test.conditionalBy?.length > 0
            ? `Conditional via: ${test.conditionalBy.map((p: any) => p.policyName).join(', ')}`
            : '-'
        lines.push(`| \`${test.action}\` | ${emoji} ${test.result.toUpperCase()} | ${details} |`)
      })
      lines.push(``)
    }

    // AI Recommendations
    if (data.aiInsights?.recommendations?.length > 0) {
      lines.push(`## 💡 Recommendations\n`)
      data.aiInsights.recommendations.forEach((rec: any, i: number) => {
        const priorityEmoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢'
        lines.push(`### ${i + 1}. ${priorityEmoji} ${rec.action}\n`)
        lines.push(`**Priority:** ${rec.priority.toUpperCase()}  `)
        lines.push(`**Rationale:** ${rec.rationale}\n`)
      })
    }

    lines.push(`---`)
    lines.push(`*Generated by GHOST Policy Analyzer*`)

    return lines.join('\n')
  }

  /**
   * Format analysis data as CSV
   */
  const formatAsCSV = (data: any, accountName: string, environment: string): string => {
    const lines: string[] = []

    // Header
    lines.push(`"Service","Action","Effect","Has Conditions","Policy Name","Policy Source","Policy Attached At"`)

    // Add all denied actions
    Object.entries(data.analysis.services).forEach(([service, serviceData]: [string, any]) => {
      serviceData.deniedActions.forEach((denial: any) => {
        denial.statements.forEach((stmt: any) => {
          const policy = data.policies.find((p: any) => p.id === stmt.policyId)
          lines.push(`"${service}","${denial.action}","Deny","${denial.hasConditions ? 'Yes' : 'No'}","${stmt.policyName}","${policy?.source || 'unknown'}","${policy?.attachedAt || 'unknown'}"`)
        })
      })

      // Add all conditional actions
      serviceData.conditionalActions.forEach((conditional: any) => {
        conditional.statements.forEach((stmt: any) => {
          const policy = data.policies.find((p: any) => p.id === stmt.policyId)
          lines.push(`"${service}","${conditional.action}","Allow","Yes","${stmt.policyName}","${policy?.source || 'unknown'}","${policy?.attachedAt || 'unknown'}"`)
        })
      })
    })

    return lines.join('\n')
  }

  /**
   * Copy text to clipboard
   */
  const copyToClipboard = async (text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      throw new Error('Failed to copy to clipboard')
    }
  }

  /**
   * Download file
   */
  const downloadFile = (content: string, filename: string, mimeType: string): void => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return {
    formatAsText,
    formatAsMarkdown,
    formatAsCSV,
    copyToClipboard,
    downloadFile
  }
}
