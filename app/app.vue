<template>
  <!-- UApp provides toasts, tooltips and overlays for Nuxt UI 4 -->
  <UApp :toaster="{ position: 'top-right' }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
