/**
 * GET /api/debug/groups
 * Debug endpoint to see what groups actually exist in your Entra ID
 */

import { defineEventHandler, getQuery } from 'h3'
import { getAllPages, graphRequest } from '../../utils/entra/graph-client'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const searchTerm = (query.search as string) || 'AWS'
    
    console.log(`Debugging groups with search term: ${searchTerm}`)
    
    // Search for groups that contain the search term
    const filter = `startsWith(displayName, '${searchTerm}')`
    const queryParams = new URLSearchParams({
      '$filter': filter,
      '$select': 'id,displayName,description,mailEnabled,securityEnabled,mail,createdDateTime',
      '$top': '50' // Limit to first 50 for debugging
    })
    
    const endpoint = `/groups?${queryParams}`
    const groups = await getAllPages<any>(event, endpoint)
    
    // Group them by pattern for analysis
    const patterns = {
      'AWS-ID_ROLE': [] as string[], // Expected pattern: AWS-926182194632_GDSSO_IAMAdmin
      'AWS-ID-ROLE': [] as string[], // Legacy pattern with hyphen
      'AWS-ID-ENV-ROLE': [] as string[], // Old expected pattern with environment
      'Other': [] as string[]
    }
    
    groups.forEach(group => {
      const name = group.displayName
      // Match AWS-[12-digit-account]_[role] pattern
      if (name.match(/^AWS-\d{12}_[^-_]+.*$/)) {
        patterns['AWS-ID_ROLE'].push(name)
      } else if (name.match(/^AWS-\d{12}-[^-_]+$/)) {
        patterns['AWS-ID-ROLE'].push(name)
      } else if (name.match(/^AWS-\d{12}-(commercial|govcloud)-/)) {
        patterns['AWS-ID-ENV-ROLE'].push(name)
      } else {
        patterns['Other'].push(name)
      }
    })
    
    return {
      success: true,
      data: {
        totalGroups: groups.length,
        searchTerm,
        patterns,
        sampleGroups: groups.slice(0, 10).map(g => ({
          name: g.displayName,
          id: g.id,
          description: g.description
        }))
      }
    }
  } catch (error: any) {
    console.error('Debug groups error:', error)
    
    return {
      success: false,
      error: error.message,
      details: error.stack
    }
  }
})