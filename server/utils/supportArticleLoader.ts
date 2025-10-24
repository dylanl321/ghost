import matter from 'gray-matter'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
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
 * Load all support articles from the content/support directory
 */
export async function loadSupportArticles(): Promise<SupportCategory[]> {
  try {
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

    logger.info(`Loaded ${categories.length} support categories with ${categories.reduce((sum, cat) => sum + cat.articles.length, 0)} articles`)

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

