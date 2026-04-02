<template>
  <div class="space-y-4">
    <!-- Category Filters -->
    <div class="flex gap-2 flex-wrap">
      <UButton size="xs" :color="!selectedCategory ? 'primary' : 'gray'" @click="selectedCategory = ''">
        All
      </UButton>
      <UButton v-for="category in categories" :key="category" size="xs" :color="selectedCategory === category ? 'primary' : 'gray'" @click="selectedCategory = selectedCategory === category ? '' : category">
        <Icon :name="categoryIcons[category] || 'i-heroicons-tag'" class="w-3.5 h-3.5 mr-1" />
        {{ category }}
      </UButton>
    </div>

    <!-- Search -->
    <UInput v-model="searchQuery" placeholder="Search templates..." icon="i-heroicons-magnifying-glass" size="sm" />

    <!-- Templates List -->
    <div v-if="!loading && filteredTemplates.length > 0" class="space-y-2">
      <div class="text-xs text-gray-500 mb-1">{{ filteredTemplates.length }} templates available</div>
      <div v-for="template in filteredTemplates" :key="template.id" class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors" :class="{ 'ring-1 ring-primary-300 dark:ring-primary-700': selectedTemplate?.id === template.id }" @click="selectTemplate(template)">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-gray-900 dark:text-white">{{ template.name }}</div>
            <div class="text-xs text-gray-500 mt-0.5">{{ template.description }}</div>
          </div>
          <span class="text-xs px-2 py-0.5 rounded" :class="{
            'bg-red-100 text-red-700': template.category === 'security',
            'bg-amber-100 text-amber-700': template.category === 'cost',
            'bg-blue-100 text-blue-700': template.category === 'compliance',
            'bg-green-100 text-green-700': template.category === 'inventory',
            'bg-purple-100 text-purple-700': template.category === 'performance'
          }">
            {{ template.category }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="!loading && filteredTemplates.length === 0 && templates.length > 0" class="text-center py-4 text-sm text-gray-500">
      No templates match your search.
    </div>

    <!-- Selected Template Preview -->
    <div v-if="selectedTemplate" class="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ selectedTemplate.name }}</span>
        <UButton size="xs" variant="ghost" @click="copyToClipboard(selectedTemplate.generatedQuery)">
          <Icon name="i-heroicons-clipboard" class="w-4 h-4 mr-1" />
          Copy
        </UButton>
      </div>
      <pre class="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-x-auto font-mono bg-gray-200/50 dark:bg-gray-900/50 rounded p-2">{{ selectedTemplate.generatedQuery }}</pre>
    </div>

    <UButton v-if="!templates.length" :loading="loading" @click="fetchQueryTemplates">
      <Icon name="i-heroicons-arrow-path" class="w-4 h-4 mr-1" />
      Load Templates
    </UButton>
  </div>
</template>

<script setup lang="ts">
const toast = useToast()

const categoryIcons: Record<string, string> = {
  security: 'i-heroicons-shield-check',
  cost: 'i-heroicons-currency-dollar',
  compliance: 'i-heroicons-clipboard-document-check',
  inventory: 'i-heroicons-rectangle-stack',
  performance: 'i-heroicons-bolt'
}

const templates = ref<any[]>([])
const categories = ref<string[]>([])
const selectedCategory = ref('')
const selectedTemplate = ref<any>(null)
const searchQuery = ref('')
const loading = ref(false)

const filteredTemplates = computed(() => {
  let result = templates.value
  if (selectedCategory.value) result = result.filter((t: any) => t.category === selectedCategory.value)
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter((t: any) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
  }
  return result
})

async function fetchQueryTemplates() {
  loading.value = true
  try {
    const response = await $fetch('/api/support/query-templates')
    const data = (response as any).data
    templates.value = data.templates || []; categories.value = data.categories || []
  } catch { /* silent */ } finally { loading.value = false }
}

function selectTemplate(template: any) {
  selectedTemplate.value = selectedTemplate.value?.id === template.id ? null : template
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: 'Query copied to clipboard', icon: 'i-heroicons-clipboard-document-check', color: 'green', timeout: 2000 })
  } catch { toast.add({ title: 'Failed to copy', color: 'red', timeout: 2000 }) }
}

onMounted(() => { if (!templates.value.length) fetchQueryTemplates() })
</script>
