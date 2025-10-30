/**
 * Configuration for advanced filters in the Enclave Explorer
 *
 * This config-driven approach makes it easy to add/remove/modify filters
 * without changing the filtering logic or UI rendering code.
 */

export type FilterType = 'select' | 'select-multi' | 'boolean' | 'text'

export interface FilterConfig {
  field: keyof AWSEnclaveData
  label: string
  category: 'Technical' | 'Classification' | 'Financial' | 'Other'
  type: FilterType
  description?: string
}

/**
 * Advanced filter configuration
 * Add or remove filters by modifying this array
 */
export const advancedFilterConfigs: FilterConfig[] = [
  // Technical filters
  {
    field: 'platformType',
    label: 'Platform Type',
    category: 'Technical',
    type: 'select-multi',
    description: 'AWS platform configuration type'
  },
  {
    field: 'region',
    label: 'Primary Region',
    category: 'Technical',
    type: 'select-multi',
    description: 'Primary AWS region'
  },
  {
    field: 'isDirectConnect',
    label: 'Direct Connect',
    category: 'Technical',
    type: 'boolean',
    description: 'Has AWS Direct Connect configured'
  },
  {
    field: 'provisionedWithTf',
    label: 'Terraform Provisioned',
    category: 'Technical',
    type: 'boolean',
    description: 'Provisioned using Terraform'
  },
  {
    field: 'enclaveType',
    label: 'Enclave Type',
    category: 'Technical',
    type: 'select-multi',
    description: 'Type of enclave classification'
  },
  {
    field: 'isolatedEnclave',
    label: 'Isolated Enclave',
    category: 'Technical',
    type: 'select',
    description: 'Isolation status'
  },

  // Classification filters
  {
    field: 'dataType',
    label: 'Data Type',
    category: 'Classification',
    type: 'select-multi',
    description: 'Data classification level'
  },
  {
    field: 'approvedDataType',
    label: 'Approved Data Type',
    category: 'Classification',
    type: 'select-multi',
    description: 'Approved data classification'
  },
  {
    field: 'extCollabApproved',
    label: 'External Collaboration',
    category: 'Classification',
    type: 'boolean',
    description: 'Approved for external collaboration'
  },

  // Financial filters
  {
    field: 'costCenter',
    label: 'Cost Center',
    category: 'Financial',
    type: 'text',
    description: 'Financial cost center code'
  },
  {
    field: 'departmentNumber',
    label: 'Department Number',
    category: 'Financial',
    type: 'text',
    description: 'Department identifier'
  },
  {
    field: 'projectType',
    label: 'Project Type',
    category: 'Financial',
    type: 'select-multi',
    description: 'Type of project'
  },
  {
    field: 'intendedUse',
    label: 'Intended Use',
    category: 'Financial',
    type: 'text',
    description: 'Intended use description'
  },

  // Other filters
  {
    field: 'SSPtype',
    label: 'SSP Type',
    category: 'Other',
    type: 'select',
    description: 'System Security Plan type'
  },
  {
    field: 'accountAlias',
    label: 'Account Alias',
    category: 'Other',
    type: 'text',
    description: 'AWS account alias'
  },
]

/**
 * Extract unique values from enclave data for a given field
 * Used to populate select dropdowns dynamically
 */
export function getUniqueFieldValues(
  enclaves: Record<string, AWSEnclaveData>,
  field: keyof AWSEnclaveData
): string[] {
  const values = new Set<string>()

  Object.values(enclaves).forEach(enclave => {
    const value = enclave[field]
    if (value !== undefined && value !== null && value !== '') {
      values.add(String(value))
    }
  })

  return Array.from(values).sort()
}

/**
 * Get filter configs grouped by category
 */
export function getFiltersByCategory() {
  const grouped: Record<string, FilterConfig[]> = {
    Technical: [],
    Classification: [],
    Financial: [],
    Other: []
  }

  advancedFilterConfigs.forEach(config => {
    grouped[config.category].push(config)
  })

  return grouped
}
