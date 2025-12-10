import { ref } from 'vue'

export interface OrgNode {
  id: string
  arn: string
  name: string
  type: 'root' | 'ou' | 'account'
  accounts?: string[]
  children?: OrgNode[]
  _children?: OrgNode[] // For collapse state
  policyCount?: number
  policies?: any[]
}

export interface OrganizationData {
  organization: any
  tree: OrgNode
}

export function useOrganization() {
  const orgData = ref<OrganizationData | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Fetch organization structure
   */
  const fetchOrganization = async (environment: 'commercial' | 'govcloud' = 'govcloud') => {
    try {
      isLoading.value = true
      error.value = null

      const response = await $fetch(`/api/organization/structure?environment=${environment}`)

      if (response.success && response.data) {
        orgData.value = response.data
        return response.data
      } else {
        throw new Error('Failed to fetch organization data')
      }
    } catch (err: any) {
      console.error('Error fetching organization:', err)
      error.value = err.message || 'Failed to fetch organization structure'
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Transform organization tree for D3 visualization
   */
  const transformToD3Tree = (tree: any): OrgNode => {
    const transform = (node: any): OrgNode => {
      const transformed: OrgNode = {
        id: node.id,
        arn: node.arn || '',
        name: node.name,
        type: node.id.startsWith('r-') ? 'root' : node.id.startsWith('ou-') ? 'ou' : 'account',
        accounts: [],
        children: []
      }

      // Process accounts in this OU
      if (node.accounts && node.accounts.length > 0) {
        transformed.accounts = node.accounts

        // Add accounts as child nodes for visualization
        node.accounts.forEach((accountId: string) => {
          transformed.children!.push({
            id: accountId,
            name: accountId,
            type: 'account',
            arn: '',
            children: []
          })
        })
      }

      // Process child OUs
      if (node.children && node.children.length > 0) {
        node.children.forEach((child: any) => {
          transformed.children!.push(transform(child))
        })
      }

      return transformed
    }

    return transform(tree)
  }

  /**
   * Fetch policies for a specific target (includes inherited policies)
   */
  const fetchPolicies = async (
    targetId: string,
    targetType: 'ACCOUNT' | 'ORGANIZATIONAL_UNIT',
    environment: 'commercial' | 'govcloud' = 'govcloud'
  ) => {
    try {
      const response = await $fetch('/api/organization/policies', {
        params: {
          targetId,
          targetType,
          environment
        }
      })

      if (response.success && response.data) {
        return {
          directPolicies: response.data.directPolicies || [],
          inheritedPolicies: response.data.inheritedPolicies || [],
          allPolicies: response.data.allPolicies || [],
          hierarchy: response.data.hierarchy || [],
          summary: response.data.summary || {}
        }
      }
      return {
        directPolicies: [],
        inheritedPolicies: [],
        allPolicies: [],
        hierarchy: [],
        summary: { totalPolicies: 0, directCount: 0, inheritedCount: 0, hierarchyDepth: 0 }
      }
    } catch (err) {
      console.error('Error fetching policies:', err)
      return {
        directPolicies: [],
        inheritedPolicies: [],
        allPolicies: [],
        hierarchy: [],
        summary: { totalPolicies: 0, directCount: 0, inheritedCount: 0, hierarchyDepth: 0 }
      }
    }
  }

  /**
   * Get all nodes as flat array for searching
   */
  const flattenTree = (node: OrgNode, result: OrgNode[] = []): OrgNode[] => {
    result.push(node)
    if (node.children) {
      node.children.forEach(child => flattenTree(child, result))
    }
    if (node._children) {
      node._children.forEach(child => flattenTree(child, result))
    }
    return result
  }

  /**
   * Count total accounts in tree
   */
  const countAccounts = (node: OrgNode): number => {
    let count = 0

    if (node.type === 'account') {
      count = 1
    } else if (node.accounts) {
      count = node.accounts.length
    }

    if (node.children) {
      count += node.children.reduce((sum, child) => sum + countAccounts(child), 0)
    }

    if (node._children) {
      count += node._children.reduce((sum, child) => sum + countAccounts(child), 0)
    }

    return count
  }

  /**
   * Count organizational units
   */
  const countOUs = (node: OrgNode): number => {
    let count = node.type === 'ou' ? 1 : 0

    if (node.children) {
      count += node.children.reduce((sum, child) => sum + countOUs(child), 0)
    }

    if (node._children) {
      count += node._children.reduce((sum, child) => sum + countOUs(child), 0)
    }

    return count
  }

  return {
    orgData,
    isLoading,
    error,
    fetchOrganization,
    transformToD3Tree,
    fetchPolicies,
    flattenTree,
    countAccounts,
    countOUs
  }
}
