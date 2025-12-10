import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import matter from 'gray-matter'

interface SupportArticle {
  id: string
  title: string
  content: string
  lastUpdated?: string
  icon?: string
}

interface SupportCategory {
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

async function bundleSupportArticles() {
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

  // Generate TypeScript file
  const outputPath = join(process.cwd(), 'server', 'utils', 'support-articles-bundle.ts')
  const output = `// Auto-generated file - DO NOT EDIT
// Generated at: ${new Date().toISOString()}
// Run 'npm run bundle:support' to regenerate

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

export const supportArticlesBundle: SupportCategory[] = ${JSON.stringify(categories, null, 2)}
`

  await writeFile(outputPath, output, 'utf-8')
  console.log(`✓ Bundled ${categories.length} categories with ${categories.reduce((sum, cat) => sum + cat.articles.length, 0)} articles`)
  console.log(`✓ Output: ${outputPath}`)
}

bundleSupportArticles().catch(console.error)
