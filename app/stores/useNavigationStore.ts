/**
 * Navigation Store
 * 
 * Manages the sidebar state including:
 * - Collapsed/expanded state
 * - Page-specific collapse rules
 * - Responsive behavior
 * 
 * Features:
 * - Persistent state across sessions
 * - Protected pages that prevent auto-collapse
 * - Default collapsed pages for better UX
 * - Responsive breakpoint handling
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface PageCollapseRule {
  path: string
  /**
   * 'protected' - Cannot be collapsed on this page
   * 'default-collapsed' - Starts collapsed when navigating to this page
   * 'normal' - Standard behavior
   */
  rule: 'protected' | 'default-collapsed' | 'normal'
  reason?: string // Optional explanation for the rule
}

export const useNavigationStore = defineStore('navigation', () => {
  // Core state
  const isCollapsed = ref(false)
  const isHovered = ref(false)
  const isMobile = ref(false)
  
  // Page-specific collapse rules
  const pageCollapseRules = ref<PageCollapseRule[]>([
    {
      path: '/',
      rule: 'protected',
      reason: 'Home page should always show full navigation for better user orientation'
    },
    {
      path: '/account/costs',
      rule: 'default-collapsed',
      reason: 'Cost page benefits from more screen real estate for charts and data'
    },
    {
      path: '/account/cost-analytics',
      rule: 'default-collapsed',
      reason: 'Analytics page needs maximum viewport width for visualizations'
    },
    {
      path: '/account/cost-analytics-v2',
      rule: 'default-collapsed',
      reason: 'Analytics page needs maximum viewport width for visualizations'
    },
    {
      path: '/chat',
      rule: 'default-collapsed',
      reason: 'Chat interface benefits from maximum viewport width for better conversation flow'
    }
  ])

  // Computed properties
  const shouldShow = computed(() => {
    // On mobile, sidebar is always hidden unless explicitly shown
    if (isMobile.value) return false
    
    // Show if not collapsed or if being hovered
    return !isCollapsed.value || isHovered.value
  })

  const sidebarWidth = computed(() => {
    if (isMobile.value) return '0px'
    if (isCollapsed.value && !isHovered.value) return '4rem' // 64px for icons only
    return '16rem' // 256px for full width
  })

  const contentMargin = computed(() => {
    if (isMobile.value) return '0px'
    if (isCollapsed.value && !isHovered.value) return '4rem'
    return '16rem'
  })

  // Methods
  const toggle = (currentPath?: string) => {
    // Check if current page is protected
    if (currentPath && isPageProtected(currentPath) && !isCollapsed.value) {
      console.log(`Cannot collapse sidebar on protected page: ${currentPath}`)
      return false
    }
    
    isCollapsed.value = !isCollapsed.value
    return true
  }

  const collapse = (currentPath?: string) => {
    if (currentPath && isPageProtected(currentPath)) {
      console.log(`Cannot collapse sidebar on protected page: ${currentPath}`)
      return false
    }
    
    isCollapsed.value = true
    return true
  }

  const expand = () => {
    isCollapsed.value = false
  }

  const setHovered = (hovered: boolean) => {
    isHovered.value = hovered
  }

  const setMobile = (mobile: boolean) => {
    isMobile.value = mobile
  }

  const isPageProtected = (path: string): boolean => {
    const rule = pageCollapseRules.value.find(rule => rule.path === path)
    return rule?.rule === 'protected'
  }

  const shouldDefaultCollapse = (path: string): boolean => {
    const rule = pageCollapseRules.value.find(rule => rule.path === path)
    return rule?.rule === 'default-collapsed'
  }

  const handleRouteChange = (newPath: string, oldPath?: string) => {
    // PRIORITY 1: If moving to a protected page, force expand (cannot be collapsed)
    if (isPageProtected(newPath) && isCollapsed.value) {
      expand()
      return // Exit early, protected pages take priority
    }
    
    // PRIORITY 2: If moving to a page that defaults to collapsed, collapse it
    if (shouldDefaultCollapse(newPath) && !isCollapsed.value) {
      collapse()
      return
    }
    
    // PRIORITY 3: If moving from a default-collapsed page to a normal page, and we're collapsed, expand
    if (oldPath && shouldDefaultCollapse(oldPath) && !shouldDefaultCollapse(newPath) && !isPageProtected(newPath) && isCollapsed.value) {
      expand()
    }
  }

  const addPageRule = (path: string, rule: PageCollapseRule['rule'], reason?: string) => {
    const existingIndex = pageCollapseRules.value.findIndex(r => r.path === path)
    const newRule: PageCollapseRule = { path, rule, reason }
    
    if (existingIndex >= 0) {
      pageCollapseRules.value[existingIndex] = newRule
    } else {
      pageCollapseRules.value.push(newRule)
    }
  }

  const removePageRule = (path: string) => {
    const index = pageCollapseRules.value.findIndex(r => r.path === path)
    if (index >= 0) {
      pageCollapseRules.value.splice(index, 1)
    }
  }

  const getPageRule = (path: string) => {
    return pageCollapseRules.value.find(rule => rule.path === path)
  }

  return {
    // State
    isCollapsed,
    isHovered,
    isMobile,
    pageCollapseRules,
    
    // Computed
    shouldShow,
    sidebarWidth,
    contentMargin,
    
    // Methods
    toggle,
    collapse,
    expand,
    setHovered,
    setMobile,
    isPageProtected,
    shouldDefaultCollapse,
    handleRouteChange,
    addPageRule,
    removePageRule,
    getPageRule
  }
}, {
  persist: {
    // Only persist the collapsed state, not hover or mobile state
    pick: ['isCollapsed']
  }
})