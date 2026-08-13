<script setup lang="ts">
definePageMeta({ title: 'GHOST MCP capabilities', description: 'GHOST MCP command families and tool types' })

const modeClasses = {
  Read: 'mode-read',
  Create: 'mode-create',
  Confirm: 'mode-confirm'
} as const
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 pb-14 sm:px-6">
    <header class="border-b border-gray-200 py-7 dark:border-gray-700">
      <UButton to="/chat/mcp" icon="i-heroicons-arrow-left" color="gray" variant="ghost" size="xs">MCP Connections</UButton>
      <p class="mt-5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">GHOST MCP</p>
      <h1 class="mt-1 text-3xl font-semibold text-gray-950 dark:text-white">What GHOST can do</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">A living, user-facing map of the MCP command families. Update <code>app/utils/mcp-capabilities.ts</code> as the server catalog evolves.</p>
    </header>

    <main class="grid gap-x-8 gap-y-10 py-9 md:grid-cols-2">
      <section v-for="group in mcpCapabilityGroups" :key="group.id" class="capability-group">
        <div class="flex gap-3"><UIcon :name="group.icon" class="mt-0.5 size-5 text-emerald-600 dark:text-emerald-400" /><div><h2>{{ group.label }}</h2><p>{{ group.description }}</p></div></div>
        <div class="mt-5 border-t border-gray-200 dark:border-gray-700">
          <article v-for="tool in group.tools" :key="tool.name" class="border-b border-gray-200 py-4 dark:border-gray-700">
            <div class="flex items-start justify-between gap-3"><code>{{ tool.name }}</code><span class="mode" :class="modeClasses[tool.mode]">{{ tool.mode }}</span></div>
            <p>{{ tool.description }}</p>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.capability-group h2 { margin: 0; color: rgb(17 24 39); font-size: 1rem; font-weight: 700; }.capability-group p { margin: .35rem 0 0; color: rgb(75 85 99); font-size: .8125rem; line-height: 1.55; }.capability-group code { color: rgb(5 120 87); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .75rem; overflow-wrap: anywhere; }.mode { flex: 0 0 auto; padding: .125rem .4rem; border-radius: .25rem; font-size: .625rem; font-weight: 800; text-transform: uppercase; }.mode-read { color: rgb(4 120 87); background: rgb(209 250 229); }.mode-create { color: rgb(126 34 206); background: rgb(243 232 255); }.mode-confirm { color: rgb(146 64 14); background: rgb(254 243 199); }:global(.dark) .capability-group h2 { color: white; }:global(.dark) .capability-group p { color: rgb(209 213 219); }:global(.dark) .mode-read { color: rgb(110 231 183); background: rgb(6 78 59); }:global(.dark) .mode-create { color: rgb(216 180 254); background: rgb(88 28 135); }:global(.dark) .mode-confirm { color: rgb(252 211 77); background: rgb(120 53 15); }
</style>
