import matter from 'gray-matter'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { logger } from './logger'

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

// Map category folder names to display titles
const CATEGORY_TITLES: Record<string, string> = {
  'getting-started': 'Getting Started',
  'costs': 'Cost Management',
  'features': 'Features',
  'advanced': 'Advanced'
}

// Order categories for display
const CATEGORY_ORDER = ['getting-started', 'costs', 'features', 'advanced']

/**
 * Load support articles using Nitro server assets storage (production)
 */
async function loadFromStorage(): Promise<SupportCategory[]> {
  const storage = useStorage('assets:support')

  // Get all keys (file paths) from the storage
  const keys = await storage.getKeys()

  if (keys.length === 0) {
    return []
  }

  // Group files by category (first directory level)
  const categoryMap = new Map<string, string[]>()

  for (const key of keys) {
    if (!key.endsWith('.md')) continue

    const parts = key.split('/')
    if (parts.length >= 2) {
      const categoryId = parts[0]
      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, [])
      }
      categoryMap.get(categoryId)!.push(key)
    }
  }

  // Sort categories by predefined order
  const sortedCategories = Array.from(categoryMap.keys()).sort((a, b) => {
    const indexA = CATEGORY_ORDER.indexOf(a)
    const indexB = CATEGORY_ORDER.indexOf(b)
    if (indexA === -1 && indexB === -1) return a.localeCompare(b)
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })

  const categories: SupportCategory[] = []

  // Process each category
  for (const categoryId of sortedCategories) {
    const files = categoryMap.get(categoryId) || []
    const articles: SupportArticle[] = []

    for (const filePath of files) {
      const fileContents = await storage.getItem(filePath) as string

      if (!fileContents) continue

      // Parse frontmatter and content
      const { data, content } = matter(fileContents)

      // Generate article ID from filename (remove .md extension and path)
      const fileName = filePath.split('/').pop() || ''
      const articleId = fileName.replace('.md', '')

      articles.push({
        id: articleId,
        title: data.title || articleId,
        content: content.trim(),
        lastUpdated: data.lastUpdated,
        icon: data.icon
      })
    }

    // Sort articles by title
    articles.sort((a, b) => a.title.localeCompare(b.title))

    categories.push({
      id: categoryId,
      title: CATEGORY_TITLES[categoryId] || categoryId,
      articles
    })
  }

  return categories
}

/**
 * Load support articles using filesystem (development)
 */
async function loadFromFilesystem(): Promise<SupportCategory[]> {
  // Path to support articles directory
  const supportDir = join(process.cwd(), 'app', 'content', 'support')

  // Read all category directories
  const categoryDirs = await readdir(supportDir, { withFileTypes: true })

  // Sort categories by predefined order
  const sortedCategoryDirs = categoryDirs
    .filter(dirent => dirent.isDirectory())
    .sort((a, b) => {
      const indexA = CATEGORY_ORDER.indexOf(a.name)
      const indexB = CATEGORY_ORDER.indexOf(b.name)
      if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name)
      if (indexA === -1) return 1
      if (indexB === -1) return -1
      return indexA - indexB
    })

  const categories: SupportCategory[] = []

  // Process each category directory
  for (const categoryDir of sortedCategoryDirs) {
    const categoryPath = join(supportDir, categoryDir.name)
    const files = await readdir(categoryPath)

    const articles: SupportArticle[] = []

    // Process each markdown file in the category
    for (const fileName of files) {
      if (!fileName.endsWith('.md')) continue

      const filePath = join(categoryPath, fileName)
      const fileContents = await readFile(filePath, 'utf-8')

      // Parse frontmatter and content
      const { data, content } = matter(fileContents)

      // Generate article ID from filename (remove .md extension)
      const articleId = fileName.replace('.md', '')

      articles.push({
        id: articleId,
        title: data.title || articleId,
        content: content.trim(),
        lastUpdated: data.lastUpdated,
        icon: data.icon
      })
    }

    // Sort articles by title
    articles.sort((a, b) => a.title.localeCompare(b.title))

    if (articles.length > 0) {
      categories.push({
        id: categoryDir.name,
        title: CATEGORY_TITLES[categoryDir.name] || categoryDir.name,
        articles
      })
    }
  }

  return categories
}

/**
 * Load all support articles from the content/support directory
 * Uses filesystem in development, server assets storage in production
 */
export async function loadSupportArticles(): Promise<SupportCategory[]> {
  try {
    // Check if we're in development (source files exist)
    const supportDir = join(process.cwd(), 'app', 'content', 'support')
    const isDev = existsSync(supportDir)

    let categories: SupportCategory[]

    if (isDev) {
      // Development: read from filesystem
      categories = await loadFromFilesystem()
      logger.info(`[DEV] Loaded ${categories.length} support categories with ${categories.reduce((sum, cat) => sum + cat.articles.length, 0)} articles from filesystem`)
    } else {
      // Production: use server assets storage
      categories = await loadFromStorage()
      logger.info(`[PROD] Loaded ${categories.length} support categories with ${categories.reduce((sum, cat) => sum + cat.articles.length, 0)} articles from storage`)
    }

    return categories
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

