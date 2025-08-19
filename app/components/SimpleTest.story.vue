<template>
  <Story title="Simple Test" group="test">
    <Variant title="Basic HTML">
      <div class="p-4 bg-blue-100 rounded">
        <h1>Hello Histoire!</h1>
        <p>This is a simple test without Nuxt UI components.</p>
      </div>
    </Variant>

    <Variant title="With Basic Vue">
      <div class="p-4 bg-green-100 rounded">
        <h1>{{ message }}</h1>
        <button @click="count++" class="bg-blue-500 text-white px-2 py-1 rounded">
          Clicked {{ count }} times
        </button>
      </div>
    </Variant>
  </Story>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const message = ref('Vue is working!')
const count = ref(0)
</script>