<template>
  <DocsLayout :categories="categories" v-model="selectedArticleId">
    <!-- Breadcrumbs -->
    <div class="mb-6">
      <nav class="flex items-center space-x-2 text-sm">
        <NuxtLink to="/support" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
          Support
        </NuxtLink>
        <UIcon name="i-heroicons-chevron-right" class="text-gray-400 w-4 h-4" />
        <span v-if="currentCategory" class="text-gray-500 dark:text-gray-400">
          {{ currentCategory.title }}
        </span>
        <template v-if="currentArticle">
          <UIcon name="i-heroicons-chevron-right" class="text-gray-400 w-4 h-4" />
          <span class="text-gray-900 dark:text-white font-medium">
            {{ currentArticle.title }}
          </span>
        </template>
      </nav>
    </div>

    <!-- Article Content -->
    <div v-if="currentArticle" class="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
      <div class="p-8">
        <!-- Article Header -->
        <div class="mb-8 pb-6 border-b border-gray-200 dark:border-gray-700">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {{ currentArticle.title }}
          </h1>
          <div class="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
            <span class="flex items-center">
              <UIcon name="i-heroicons-folder" class="w-4 h-4 mr-1" />
              {{ currentCategory?.title }}
            </span>
            <span v-if="currentArticle.lastUpdated" class="flex items-center">
              <UIcon name="i-heroicons-clock" class="w-4 h-4 mr-1" />
              Last updated: {{ currentArticle.lastUpdated }}
            </span>
          </div>
        </div>

        <!-- Markdown Content -->
        <MarkdownContent :content="currentArticle.content" />

        <!-- Article Footer -->
        <div class="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-4">
              <span class="text-sm text-gray-500 dark:text-gray-400">Was this helpful?</span>
              <div class="flex items-center space-x-2">
                <UButton
                  icon="i-heroicons-hand-thumb-up"
                  variant="soft"
                  color="green"
                  size="sm"
                  @click="handleFeedback('helpful')"
                />
                <UButton
                  icon="i-heroicons-hand-thumb-down"
                  variant="soft"
                  color="red"
                  size="sm"
                  @click="handleFeedback('not-helpful')"
                />
              </div>
            </div>
            
            <UButton
              variant="soft"
              color="gray"
              size="sm"
              @click="openServiceNow"
            >
              <UIcon name="i-heroicons-chat-bubble-left-right" class="w-4 h-4 mr-2" />
              Contact Support
            </UButton>
          </div>
        </div>

        <!-- Related Articles -->
        <div v-if="relatedArticles.length > 0" class="mt-8 p-6 bg-gray-50 dark:bg-gray-900 rounded-lg">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Related Articles
          </h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              v-for="article in relatedArticles"
              :key="article.id"
              @click="selectArticle(article.id)"
              class="text-left p-4 bg-white dark:bg-gray-800 rounded-lg hover:shadow-md transition-shadow"
            >
              <h4 class="font-medium text-gray-900 dark:text-white mb-1">
                {{ article.title }}
              </h4>
              <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {{ getArticlePreview(article) }}
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Default/Welcome Content -->
    <div v-else class="text-center py-12">
      <div class="max-w-2xl mx-auto">
        <UIcon name="i-heroicons-book-open" class="text-6xl text-gray-400 mb-4" />
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
          GHOST Documentation
        </h2>
        <p class="text-gray-600 dark:text-gray-400 mb-8">
          Learn how to use GHOST's key features: Universal Search, Cost Dashboard, and Organization Chart.
        </p>
        
        <!-- Quick Start Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
          <UCard
            v-for="quickStart in quickStartArticles"
            :key="quickStart.id"
            class="hover:shadow-lg transition-shadow cursor-pointer"
            @click="selectArticle(quickStart.id)"
          >
            <div class="p-4">
              <UIcon :name="quickStart.icon" class="text-3xl text-primary-500 mb-2" />
              <h3 class="font-semibold text-gray-900 dark:text-white mb-1">
                {{ quickStart.title }}
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                {{ quickStart.description }}
              </p>
            </div>
          </UCard>
        </div>
      </div>
    </div>
  </DocsLayout>
</template>

<script setup lang="ts">
import { supportCategories, getArticleById, getCategoryByArticleId } from '~/utils/supportArticles'
import type { SupportArticle, SupportCategory } from '~/utils/supportArticles'

// Page meta
definePageMeta({
  title: 'Documentation',
  description: 'GHOST documentation and support articles'
})

// Route and state
const route = useRoute()
const router = useRouter()
const selectedArticleId = ref<string>('')

// Data
const categories = supportCategories

// Quick start articles for the welcome page
const quickStartArticles = [
  {
    id: 'universal-search',
    title: 'Universal Search',
    description: 'Find accounts, users, and resources quickly with powerful search',
    icon: 'i-heroicons-magnifying-glass'
  },
  {
    id: 'cost-dashboard-guide',
    title: 'Using the Cost Dashboard',
    description: 'Complete guide to cost tracking, settings, filters, and analysis',
    icon: 'i-heroicons-currency-dollar'
  },
  {
    id: 'swagger-ui-guide',
    title: 'Swagger UI for API Testing',
    description: 'Interactive API testing and exploration without writing code',
    icon: 'i-heroicons-code-bracket'
  },
  {
    id: 'api-keys-guide',
    title: 'API Keys & Programmatic Access',
    description: 'Request and use API keys for scripts, automation, and integrations',
    icon: 'i-heroicons-key'
  }
]

// Computed properties
const currentArticle = computed(() => {
  return selectedArticleId.value ? getArticleById(selectedArticleId.value) : undefined
})

const currentCategory = computed(() => {
  return selectedArticleId.value ? getCategoryByArticleId(selectedArticleId.value) : undefined
})

const relatedArticles = computed(() => {
  if (!currentCategory.value || !currentArticle.value) return []
  
  return currentCategory.value.articles
    .filter(article => article.id !== currentArticle.value?.id)
    .slice(0, 4)
})

// Methods
const selectArticle = (articleId: string) => {
  selectedArticleId.value = articleId
  // Update URL query parameter
  router.push({ 
    path: '/support/docs',
    query: { topic: articleId }
  })
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const getArticlePreview = (article: SupportArticle): string => {
  // Extract first paragraph or sentence from markdown content
  const lines = article.content.split('\n').filter(line => line.trim() && !line.startsWith('#'))
  return lines[0]?.substring(0, 150) + '...' || 'Click to read more about this topic.'
}

const handleFeedback = (type: 'helpful' | 'not-helpful') => {
  // In a real app, this would send feedback to an analytics service
  console.log(`Article feedback: ${type} for article ${currentArticle.value?.id}`)
  
  // Show toast notification
  const toast = useToast()
  toast.add({
    title: 'Thank you for your feedback!',
    description: 'Your feedback helps us improve our documentation.',
    color: 'green',
    icon: 'i-heroicons-check-circle'
  })
}

const openServiceNow = () => {
  window.open('https://gdms.servicenowservices.com/', '_blank', 'noopener,noreferrer')
}

// Watch for route query changes
watch(() => route.query.topic, (topic) => {
  if (topic && typeof topic === 'string') {
    const article = getArticleById(topic)
    if (article) {
      selectedArticleId.value = topic
    }
  }
}, { immediate: true })

// Initialize from route
onMounted(() => {
  const topic = route.query.topic
  if (topic && typeof topic === 'string') {
    const article = getArticleById(topic)
    if (article) {
      selectedArticleId.value = topic
    }
  }
})
</script>