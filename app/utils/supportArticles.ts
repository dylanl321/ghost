export interface SupportArticle {
  id: string
  title: string
  content: string
  lastUpdated?: string
  icon?: string
}

export interface SupportCategory {
  id: string
  title: string
  articles: SupportArticle[]
}

// Cache for loaded articles
let cachedCategories: SupportCategory[] | null = null

/**
 * Load support categories and articles from API
 */
export async function loadSupportCategories(): Promise<SupportCategory[]> {
  if (cachedCategories) {
    return cachedCategories
  }

  try {
    const response = await $fetch<{ success: boolean; data: SupportCategory[] }>('/api/support/articles')
    if (response.success) {
      cachedCategories = response.data
      return response.data
    }
  } catch (error) {
    console.error('Failed to load support articles:', error)
  }

  return []
}

/**
 * Get support categories synchronously (for use in setup)
 * Note: This returns an empty array initially and requires async loading
 */
export const supportCategories: SupportCategory[] = []

/**
 * Helper function to get article by ID
 */
export function getArticleById(articleId: string, categories: SupportCategory[]): SupportArticle | undefined {
  for (const category of categories) {
    const article = category.articles.find(a => a.id === articleId)
    if (article) return article
  }
  return undefined
}

/**
 * Helper function to get category by article ID
 */
export function getCategoryByArticleId(articleId: string, categories: SupportCategory[]): SupportCategory | undefined {
  return categories.find(category =>
    category.articles.some(article => article.id === articleId)
  )
}
