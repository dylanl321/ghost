<template>
  <Story
    title="Simple Nuxt UI Test"
    group="test"
    :layout="{ type: 'single', iframe: true }"
  >
    <!-- Working Components Only -->
    <Variant title="Working Components">
      <SimpleNuxtUITest />
    </Variant>

    <template #controls>
      <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded">
        <h4 class="font-medium mb-3">Simple Nuxt UI v3 Test</h4>
        <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2">
          <div>• Tests only components that work reliably in Histoire</div>
          <div>• Avoids navigation-dependent components</div>
          <div>• Includes HTML controls for comparison</div>
          <div>• Form values are reactive and update in real-time</div>
          <div class="mt-3 p-2 bg-green-50 dark:bg-green-900/20 rounded">
            <strong class="text-green-700 dark:text-green-300">Status:</strong> 
            <span class="text-green-600 dark:text-green-400">
              This version should work without Link.vue errors
            </span>
          </div>
        </div>
      </div>
    </template>
  </Story>
</template>

<script setup lang="ts">
import SimpleNuxtUITest from './SimpleNuxtUITest.vue'
</script>