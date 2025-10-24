import { logger } from './logger'
import { supportArticlesBundle } from './support-articles-bundle'

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

/**
 * Load all support articles from the bundled data
 * Articles are bundled at build time from app/content/support
 */
export async function loadSupportArticles(): Promise<SupportCategory[]> {
  try {
    logger.info(`Loaded ${supportArticlesBundle.length} support categories with ${supportArticlesBundle.reduce((sum, cat) => sum + cat.articles.length, 0)} articles from bundle`)
    return supportArticlesBundle
  } catch (error) {
    logger.error('Error loading support articles:', error)
    return []
  }
}

/**
 * Get article by ID from all categories
 */
export function getArticleById(articleId: string, categories: SupportCategory[]): SupportArticle | undefined {
  for (const category of categories) {
    const article = category.articles.find(a => a.id === articleId)
    if (article) return article
  }
  return undefined
}

/**
 * Get category by article ID
 */
export function getCategoryByArticleId(articleId: string, categories: SupportCategory[]): SupportCategory | undefined {
  return categories.find(category =>
    category.articles.some(article => article.id === articleId)
  )
}

