import { logger } from '../../utils/logger'

export default defineEventHandler(async () => {
  try {
    const categories = await loadSupportArticles()
    return {
      success: true,
      data: categories
    }
  } catch (error) {
    logger.error('Error loading support articles:', error)
    return {
      success: false,
      error: 'Failed to load support articles',
      data: []
    }
  }
})

