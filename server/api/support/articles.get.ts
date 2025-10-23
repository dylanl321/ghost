import { loadSupportArticles } from '~/server/utils/supportArticleLoader'

export default defineEventHandler(() => {
  try {
    const categories = loadSupportArticles()
    return {
      success: true,
      data: categories
    }
  } catch (error) {
    console.error('Error loading support articles:', error)
    return {
      success: false,
      error: 'Failed to load support articles',
      data: []
    }
  }
})

