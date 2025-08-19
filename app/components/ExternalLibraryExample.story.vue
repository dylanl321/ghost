<template>
  <Story title="External Library Example" group="components">
    <Variant title="Headless UI Components">
      <div class="p-6 bg-gray-50 rounded-lg">
        <h3 class="text-lg font-semibold mb-4">Proof: External Libraries Work! 🎉</h3>
        <p class="text-sm text-gray-600 mb-4">
          This demonstrates Headless UI Vue components working perfectly in Histoire.
          The issue isn't with external packages - it's specifically with Nuxt-only packages.
        </p>
        <ExternalLibraryExample />
      </div>
    </Variant>

    <Variant title="What This Proves">
      <div class="p-6 space-y-4">
        <div class="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 class="font-semibold text-green-800 mb-2">✅ Works in Histoire:</h4>
          <ul class="text-sm text-green-700 space-y-1">
            <li>• Pure Vue components</li>
            <li>• Vue ecosystem libraries (@headlessui/vue, vue-router, etc.)</li>
            <li>• Standard npm packages (lodash, axios, etc.)</li>
            <li>• UI libraries built for Vue (not Nuxt)</li>
          </ul>
        </div>

        <div class="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 class="font-semibold text-red-800 mb-2">❌ Doesn't Work:</h4>
          <ul class="text-sm text-red-700 space-y-1">
            <li>• Nuxt-specific packages (@nuxt/ui, @nuxtjs/*, etc.)</li>
            <li>• Packages requiring Nuxt's SSR context</li>
            <li>• Packages depending on Nuxt's auto-imports</li>
            <li>• Packages using Nuxt's module system</li>
          </ul>
        </div>

        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 class="font-semibold text-blue-800 mb-2">💡 The Solution:</h4>
          <p class="text-sm text-blue-700">
            Use Vue-native libraries like Headless UI, Radix Vue, or Ant Design Vue 
            for components you want to document in Histoire. Reserve Nuxt UI for 
            components documented in your Nuxt app's components-demo page.
          </p>
        </div>
      </div>
    </Variant>
  </Story>
</template>

<script setup lang="ts">
import ExternalLibraryExample from './ExternalLibraryExample.vue'
</script>