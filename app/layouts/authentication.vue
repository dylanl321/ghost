<template>
  <!-- <div class="min-h-screen"> -->
  <div>
    <div>This is the authentication layout</div>
    <slot />
  </div>
</template>

<script setup lang="ts">

definePageMeta({
  layout: 'authentication'
})

</script>