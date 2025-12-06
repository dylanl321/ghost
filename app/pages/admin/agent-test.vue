<template>
  <div class="container mx-auto p-6">
    <div class="mb-6">
      <h1 class="text-3xl font-bold mb-2">Strands Agent Testing</h1>
      <p class="text-gray-600 dark:text-gray-400">
        Diagnostic tools for testing Strands agent connectivity and streaming functionality.
      </p>
    </div>

    <AdminStrandsAgentTester />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
  layout: 'default'
})

useHead({
  title: 'Agent Testing - Admin'
})
</script>
