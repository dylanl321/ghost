/**
 * Composable for managing page breadcrumbs
 */

export interface Breadcrumb {
  label: string
  to?: string
  icon?: string
}

const breadcrumbs = ref<Breadcrumb[]>([])

export const usePageBreadcrumbs = () => {
  /**
   * Set the breadcrumbs for the current page
   */
  const setBreadcrumbs = (items: Breadcrumb[]) => {
    breadcrumbs.value = items
  }

  /**
   * Add a breadcrumb to the current trail
   */
  const addBreadcrumb = (item: Breadcrumb) => {
    breadcrumbs.value.push(item)
  }

  /**
   * Clear all breadcrumbs
   */
  const clearBreadcrumbs = () => {
    breadcrumbs.value = []
  }

  /**
   * Get current breadcrumbs
   */
  const getBreadcrumbs = () => breadcrumbs.value

  return {
    breadcrumbs: readonly(breadcrumbs),
    setBreadcrumbs,
    addBreadcrumb,
    clearBreadcrumbs,
    getBreadcrumbs
  }
}