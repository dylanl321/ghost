/**
 * Lines of Business (LOB) Mapping Utility
 * Maps short LOB codes to their full names
 */

export interface LOBMapping {
  [key: string]: string
}

/**
 * Mapping of short LOB codes to full names
 */
export const LOB_FULL_NAMES: LOBMapping = {
  // Space, Cyber and Intelligence Systems
  'SC&I': 'Space, Cyber and Intelligence Systems',
  'SCI': 'Space, Cyber and Intelligence Systems',
  'Space': 'Space Systems',
  'Cyber': 'Cyber Systems',
  'Intelligence': 'Intelligence Systems',
  
  // Information Technology
  'IT': 'Information Technology',
  
  // Land & Air Systems  
  'LAS': 'Land & Air Systems',
  'Land': 'Land Systems',
  'Air': 'Air Systems',
  'AES': 'Advanced Electronic Systems',
  'Airborne': 'Airborne Systems',
  'Range': 'Range Systems',
  'Network': 'Network & Communication Systems',
  'Communications': 'Network & Communication Systems',
  
  // Maritime & Strategic Systems
  'MSS': 'Maritime & Strategic Systems',
  'M&SS': 'Maritime & Strategic Systems',
  'Maritime': 'Maritime Systems',
  'Strategic': 'Strategic Systems',
  'Composites': 'Airborne Composites & Structures',
  'Progeny': 'Progeny Systems',
  'Undersea': 'Undersea Mission Solutions',
  'Unmanned': 'Unmanned Systems & Future Combatants',
  
  // Systems Integration & Services
  'SIS': 'Systems Integration & Services'
}

/**
 * Get the full name for a LOB code
 * @param lobCode - The short LOB code (e.g., 'SC&I', 'IT')
 * @returns The full name or the original code if no mapping found
 */
export function getLOBFullName(lobCode: string): string {
  if (!lobCode) return ''
  
  // Try exact match first
  const exactMatch = LOB_FULL_NAMES[lobCode]
  if (exactMatch) return exactMatch
  
  // Try case-insensitive match
  const lowerCode = lobCode.toLowerCase()
  for (const [key, value] of Object.entries(LOB_FULL_NAMES)) {
    if (key.toLowerCase() === lowerCode) {
      return value
    }
  }
  
  // Try partial match (for complex codes)
  for (const [key, value] of Object.entries(LOB_FULL_NAMES)) {
    if (lobCode.includes(key) || key.includes(lobCode)) {
      return value
    }
  }
  
  // Return original code if no mapping found
  return lobCode
}

/**
 * Get all available LOB mappings
 * @returns Object with all LOB code to full name mappings
 */
export function getAllLOBMappings(): LOBMapping {
  return { ...LOB_FULL_NAMES }
}

/**
 * Check if a LOB code has a known mapping
 * @param lobCode - The LOB code to check
 * @returns True if mapping exists, false otherwise
 */
export function hasLOBMapping(lobCode: string): boolean {
  return getLOBFullName(lobCode) !== lobCode
}