import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

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
export function loadSupportArticles(): SupportCategory[] {
  const contentDir = path.join(process.cwd(), 'app/content/support')
  
  if (!fs.existsSync(contentDir)) {
    console.warn('Support content directory not found:', contentDir)
    return []
  }

  const categories: SupportCategory[] = []

  // Read all category directories
  const categoryDirs = fs.readdirSync(contentDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)

  // Sort categories by predefined order
  const sortedDirs = categoryDirs.sort((a, b) => {
    const indexA = CATEGORY_ORDER.indexOf(a)
    const indexB = CATEGORY_ORDER.indexOf(b)
    if (indexA === -1 && indexB === -1) return a.localeCompare(b)
    if (indexA === -1) return 1
    if (indexB === -1) return -1
    return indexA - indexB
  })

  // Process each category directory
  for (const categoryDir of sortedDirs) {
    const categoryPath = path.join(contentDir, categoryDir)
    const articles: SupportArticle[] = []

    // Read all markdown files in the category
    const files = fs.readdirSync(categoryPath)
      .filter(file => file.endsWith('.md'))

    for (const file of files) {
      const filePath = path.join(categoryPath, file)
      const fileContents = fs.readFileSync(filePath, 'utf8')
      
      // Parse frontmatter and content
      const { data, content } = matter(fileContents)
      
      // Generate article ID from filename (remove .md extension)
      const articleId = file.replace('.md', '')
      
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
      id: categoryDir,
      title: CATEGORY_TITLES[categoryDir] || categoryDir,
      articles
    })
  }

  return categories
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

