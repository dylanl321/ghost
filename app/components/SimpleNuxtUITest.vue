<template>
  <div class="p-6 space-y-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Simple Nuxt UI v3 Test</h1>
    
    <!-- Buttons - These should work -->
    <section class="space-y-3">
      <h2 class="text-xl font-semibold">Buttons (Working)</h2>
      <div class="flex gap-2 flex-wrap">
        <button class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">HTML Button</button>
        <UButton>Default UButton</UButton>
        <UButton color="primary">Primary</UButton>
        <UButton color="success">Success</UButton>
        <UButton color="error">Error</UButton>
        <UButton variant="outline">Outline</UButton>
        <UButton variant="ghost">Ghost</UButton>
      </div>
    </section>

    <!-- Badges - These should work -->
    <section class="space-y-3">
      <h2 class="text-xl font-semibold">Badges (Working)</h2>
      <div class="flex gap-2 flex-wrap">
        <UBadge>Default</UBadge>
        <UBadge color="primary">Primary</UBadge>
        <UBadge color="success">Success</UBadge>
        <UBadge color="warning">Warning</UBadge>
        <UBadge color="error">Error</UBadge>
        <UBadge variant="outline">Outline</UBadge>
      </div>
    </section>

    <!-- Cards - Basic cards should work -->
    <section class="space-y-3">
      <h2 class="text-xl font-semibold">Cards (Working)</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <UCard>
          <template #header>
            <h3 class="font-semibold">Simple Card</h3>
          </template>
          <p>This is a basic card that should work without routing issues.</p>
          <template #footer>
            <div class="flex justify-end">
              <button class="px-3 py-1 bg-gray-600 text-white rounded text-sm">HTML Button</button>
            </div>
          </template>
        </UCard>
        
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Card with Badges</h3>
              <UBadge color="success">Working</UBadge>
            </div>
          </template>
          <p>Card with badges and basic content.</p>
        </UCard>
      </div>
    </section>

    <!-- Form Components - Basic ones -->
    <section class="space-y-3">
      <h2 class="text-xl font-semibold">Basic Form Components</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="space-y-2">
          <label class="text-sm font-medium">HTML Input (Control)</label>
          <input 
            type="text" 
            class="w-full px-3 py-2 border rounded-md" 
            placeholder="HTML input for comparison"
          >
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium">UInput</label>
          <UInput v-model="testInput" placeholder="Nuxt UI input" />
        </div>
      </div>
      
      <div class="space-y-2">
        <label class="text-sm font-medium">UTextarea</label>
        <UTextarea v-model="testTextarea" placeholder="Enter your message..." rows="3" />
      </div>
      
      <div class="flex items-center gap-4">
        <UCheckbox v-model="testCheckbox" label="Test checkbox" />
        <USwitch v-model="testSwitch" />
        <span class="text-sm">Switch: {{ testSwitch }}</span>
      </div>
    </section>

    <!-- Progress & Alerts -->
    <section class="space-y-3">
      <h2 class="text-xl font-semibold">Progress & Alerts</h2>
      
      <div class="space-y-2">
        <UProgress :value="progressValue" />
        <div class="flex gap-2">
          <button 
            @click="progressValue = Math.max(0, progressValue - 10)"
            class="px-3 py-1 bg-red-600 text-white rounded text-sm"
          >
            -10%
          </button>
          <button 
            @click="progressValue = Math.min(100, progressValue + 10)"
            class="px-3 py-1 bg-green-600 text-white rounded text-sm"
          >
            +10%
          </button>
          <span class="px-2 py-1 text-sm">{{ progressValue }}%</span>
        </div>
      </div>
      
      <div class="space-y-2">
        <UAlert title="Success Alert" description="This alert should work fine." color="success" />
        <UAlert title="Warning Alert" description="Testing alert without navigation." color="warning" />
      </div>
    </section>

    <!-- Data Display -->
    <section class="space-y-3">
      <h2 class="text-xl font-semibold">Data Display</h2>
      <div class="flex items-center gap-4">
        <UAvatar>JS</UAvatar>
        <UAvatar icon="i-heroicons-user" />
        <UAvatar size="sm">S</UAvatar>
        <UAvatar size="lg">L</UAvatar>
      </div>
    </section>

    <!-- Current Values -->
    <section class="space-y-3">
      <h2 class="text-xl font-semibold">Reactive Values</h2>
      <UCard>
        <template #header>
          <h3 class="font-semibold">Current Form Values</h3>
        </template>
        <div class="space-y-1 text-sm">
          <div><strong>Input:</strong> "{{ testInput }}"</div>
          <div><strong>Textarea:</strong> "{{ testTextarea }}"</div>
          <div><strong>Checkbox:</strong> {{ testCheckbox }}</div>
          <div><strong>Switch:</strong> {{ testSwitch }}</div>
          <div><strong>Progress:</strong> {{ progressValue }}%</div>
        </div>
      </UCard>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// Reactive test data
const testInput = ref('')
const testTextarea = ref('')
const testCheckbox = ref(false)
const testSwitch = ref(true)
const progressValue = ref(50)
</script>