<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div class="max-w-7xl mx-auto">
      <div class="flex">
        <!-- Sidebar -->
        <aside class="w-64 flex-shrink-0 hidden lg:block">
          <div class="sticky top-4 h-[calc(100vh-2rem)] overflow-y-auto">
            <nav class="p-4">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Documentation
              </h2>
              
              <!-- Search -->
              <UInput
                v-model="searchQuery"
                placeholder="Search docs..."
                icon="i-heroicons-magnifying-glass"
                class="mb-4"
              />

              <!-- Navigation Categories -->
              <div v-for="category in filteredCategories" :key="category.id" class="mb-6">
                <button
                  @click="toggleCategory(category.id)"
                  class="flex items-center justify-between w-full text-left px-2 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                >
                  <span>{{ category.title }}</span>
                  <UIcon 
                    :name="expandedCategories.includes(category.id) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                    class="text-gray-400"
                  />
                </button>
                
                <Transition name="slide">
                  <ul v-if="expandedCategories.includes(category.id)" class="mt-1 ml-2">
                    <li v-for="article in category.articles" :key="article.id">
                      <button
                        @click="selectArticle(article.id)"
                        :class="[
                          'block w-full text-left px-3 py-2 text-sm rounded-md transition-colors',
                          selectedArticle === article.id
                            ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                        ]"
                      >
                        {{ article.title }}
                      </button>
                    </li>
                  </ul>
                </Transition>
              </div>
            </nav>
          </div>
        </aside>

        <!-- Mobile Menu Button -->
        <div class="lg:hidden fixed bottom-4 right-4 z-50">
          <UButton
            icon="i-heroicons-bars-3"
            size="lg"
            color="primary"
            @click="mobileMenuOpen = true"
            class="shadow-lg"
          />
        </div>

        <!-- Mobile Sidebar -->
        <USlideover v-model="mobileMenuOpen" side="left">
          <div class="p-4">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Documentation
            </h2>
            
            <UInput
              v-model="searchQuery"
              placeholder="Search docs..."
              icon="i-heroicons-magnifying-glass"
              class="mb-4"
            />

            <div v-for="category in filteredCategories" :key="category.id" class="mb-6">
              <button
                @click="toggleCategory(category.id)"
                class="flex items-center justify-between w-full text-left px-2 py-1 text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                <span>{{ category.title }}</span>
                <UIcon 
                  :name="expandedCategories.includes(category.id) ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                  class="text-gray-400"
                />
              </button>
              
              <ul v-if="expandedCategories.includes(category.id)" class="mt-1 ml-2">
                <li v-for="article in category.articles" :key="article.id">
                  <button
                    @click="selectArticle(article.id); mobileMenuOpen = false"
                    :class="[
                      'block w-full text-left px-3 py-2 text-sm rounded-md',
                      selectedArticle === article.id
                        ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    ]"
                  >
                    {{ article.title }}
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </USlideover>

        <!-- Main Content -->
        <main class="flex-1 px-4 py-8 lg:px-8">
          <div class="max-w-4xl">
            <slot />
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Article {
  id: string
  title: string
  content?: string
}

interface Category {
  id: string
  title: string
  articles: Article[]
}

// Props
const props = defineProps<{
  categories: Category[]
  modelValue?: string
}>()

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// State
const searchQuery = ref('')
const expandedCategories = ref<string[]>([])
const selectedArticle = ref(props.modelValue || '')
const mobileMenuOpen = ref(false)

// Initialize expanded categories
onMounted(() => {
  // Expand all categories by default
  expandedCategories.value = props.categories.map(c => c.id)
  
  // If there's a selected article from URL, ensure its category is expanded
  if (selectedArticle.value) {
    const category = props.categories.find(c => 
      c.articles.some(a => a.id === selectedArticle.value)
    )
    if (category && !expandedCategories.value.includes(category.id)) {
      expandedCategories.value.push(category.id)
    }
  }
})

// Computed
const filteredCategories = computed(() => {
  if (!searchQuery.value) return props.categories
  
  const query = searchQuery.value.toLowerCase()
  return props.categories.map(category => ({
    ...category,
    articles: category.articles.filter(article =>
      article.title.toLowerCase().includes(query)
    )
  })).filter(category => category.articles.length > 0)
})

// Methods
const toggleCategory = (categoryId: string) => {
  const index = expandedCategories.value.indexOf(categoryId)
  if (index > -1) {
    expandedCategories.value.splice(index, 1)
  } else {
    expandedCategories.value.push(categoryId)
  }
}

const selectArticle = (articleId: string) => {
  selectedArticle.value = articleId
  emit('update:modelValue', articleId)
}

// Watch for external changes
watch(() => props.modelValue, (newValue) => {
  if (newValue) {
    selectedArticle.value = newValue
  }
})
</script>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateY(-10px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>