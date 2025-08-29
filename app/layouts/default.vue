<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-900 flex">
    <!-- Side Navigation -->
    <SideNav />

    <!-- Main Content Wrapper -->
    <div class="flex-1 ml-64 flex flex-col min-h-screen">
      <TopNav 
        :breadcrumbs="breadcrumbs" 
      />

      <!-- Main Content Area -->
      <main class="flex-1 p-6 overflow-y-auto">
        <!-- Page Content -->
        <div class="relative">
          <section 
            class="transition-opacity duration-200" 
          >
            <slot />
          </section>
        </div>
      </main>

      <!-- Footer with Ghost -->
      <footer class="bg-slate-800 border-t border-slate-700 h-[53px] flex items-center">
        <div class="px-6 flex justify-between items-center w-full text-sm text-gray-400">
          <span>A product of the GDMS AWS Landing Zone Team</span>
          <!-- <div class="flex items-center gap-4">
            <NuxtLink
              to="/changelog"
              class="flex items-center gap-1 hover:text-white transition-colors"
            >
              <UIcon name="i-heroicons-document-text" class="h-3 w-3" />
              <span>v0.1</span>
            </NuxtLink>
            <NuxtLink
              to="/changelog"
              class="text-xs hover:text-white transition-colors"
            >
              What's New
            </NuxtLink>
          </div> -->
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">

const route = useRoute()

const breadcrumbs = computed(() => {
  const segments = route.path.split('/').filter(Boolean)

  // always start with dashboard
  const crumbs = [{ label: 'Dashboard', to: '/' }]

  segments.forEach((seg, i) => {
    crumbs.push({
      label: seg.charAt(0).toUpperCase() + seg.slice(1),
      to: '/' + segments.slice(0, i + 1).join('/')
    })
  })

  return crumbs
})


</script>
