<template>
  <UContainer class="py-8">
    <h1 class="text-3xl font-bold mb-8">Account API Test</h1>
    
    <!-- Test Vue Reactivity -->
    <UCard class="mb-8">
      <template #header>
        <h2 class="text-xl font-semibold">Vue Reactivity Test</h2>
      </template>
      
      <p class="mb-4 text-muted">Click to verify Vue works:</p>
      <UButton color="primary" @click="incrementCounter">
        Count: {{ counter }}
      </UButton>
    </UCard>

    <!-- Quick Tests -->
    <UCard class="mb-8">
      <template #header>
        <h2 class="text-xl font-semibold">Quick API Tests</h2>
      </template>
      
      <div class="flex flex-wrap gap-3">
        <UButton color="primary" @click="() => testAPI('simple')">
          Simple List
        </UButton>
        <UButton color="success" @click="() => testAPI('search')">
          Search Dylan
        </UButton>
        <UButton color="warning" @click="() => testAPI('filter')">
          Filter requestID > 500
        </UButton>
      </div>
    </UCard>

    <!-- Status Display -->
    <UAlert v-if="status" class="mb-6" :color="statusColor" :title="status" />

    <!-- Results -->
    <div v-if="result" class="space-y-6">
      <UCard>
        <template #header>
          <h3 class="text-lg font-semibold">API Response</h3>
        </template>
        
        <div class="space-y-2">
          <p><strong>Success:</strong> {{ result.success }}</p>
          <p><strong>Count:</strong> {{ result.data?.length || 0 }} accounts</p>
        </div>
      </UCard>
      
      <UCard v-if="result.data && result.data.length > 0">
        <template #header>
          <h3 class="text-lg font-semibold">First 3 Results</h3>
        </template>
        
        <div class="space-y-3">
          <div
v-for="(account, idx) in result.data.slice(0, 3)" :key="idx" 
               class="p-3 bg-neutral-50 rounded-lg border">
            <p class="font-medium text-highlighted">{{ account.name || account.id }}</p>
            <p class="text-sm text-muted">{{ account.email }}</p>
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>

<script setup>
// State management using auto-imported ref
const counter = useState('counter', () => 0)
const status = useState('status', () => '')
const result = useState('result', () => null)

// Computed property for status color using Nuxt UI v3 design system
const statusColor = computed(() => {
  if (status.value.includes('Error')) return 'error'
  if (status.value.includes('Loading')) return 'info'
  if (status.value.includes('Success')) return 'success'
  return 'neutral'
})

// Counter function
function incrementCounter() {
  counter.value++
  console.log('Counter clicked:', counter.value)
}

// API test function
async function testAPI(type) {
  console.log('Testing API:', type)
  status.value = 'Loading...'
  result.value = null
  
  let url = '/api/accounts/v2/list?'
  
  switch(type) {
    case 'simple':
      url += 'enrichment=simple'
      break
    case 'search':
      url += 'search=dylan&enrichment=basic'
      break
    case 'filter':
      url += 'key=requestID&value=500&operator=gt&enrichment=simple&sortBy=requestID&order=desc'
      break
  }
  
  try {
    console.log('Fetching:', url)
    const data = await $fetch(url)
    console.log('Response:', data)
    result.value = data
    status.value = `Success! Retrieved ${data.data?.length || 0} accounts`
  } catch (error) {
    console.error('API Error:', error)
    status.value = `Error: ${error.data?.error?.message || error.message || 'Unknown error'}`
    result.value = null
  }
}

// Log when component mounts
onMounted(() => {
  console.log('Test page mounted successfully')
  status.value = 'Ready - Click a button to test'
})
</script>