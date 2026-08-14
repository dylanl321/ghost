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
    <header class="border-b py-7" style="border-color: var(--ghost-border)">
      <UButton to="/chat/mcp" icon="i-heroicons-arrow-left" color="gray" variant="ghost" size="xs">MCP Connections</UButton>
      <p class="mt-5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">GHOST MCP</p>
      <h1 class="mt-1 text-3xl font-semibold" style="color: var(--ghost-text)">What GHOST can do</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6" style="color: var(--ghost-text-muted)">Explore the command families GHOST makes available to your MCP client, from official Handbook guidance to live AWS and personal workspace context.</p>
    </header>

    <main class="grid gap-x-8 gap-y-10 py-9 md:grid-cols-2">
      <section v-for="group in mcpCapabilityGroups" :key="group.id" class="capability-group">
        <div class="flex gap-3"><UIcon :name="group.icon" class="mt-0.5 size-5 text-emerald-600 dark:text-emerald-400" /><div><h2>{{ group.label }}</h2><p>{{ group.description }}</p></div></div>
        <div class="capability-list mt-5">
          <article v-for="tool in group.tools" :key="tool.name" class="py-4">
            <div class="flex items-start justify-between gap-3"><code>{{ tool.name }}</code><span class="mode" :class="modeClasses[tool.mode]">{{ tool.mode }}</span></div>
            <p>{{ tool.description }}</p>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.capability-group h2 { margin: 0; color: var(--ghost-text); font-size: 1rem; font-weight: 700; }.capability-group p { margin: .35rem 0 0; color: var(--ghost-text-muted); font-size: .8125rem; line-height: 1.55; }.capability-group code { color: rgb(5 120 87); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .75rem; overflow-wrap: anywhere; }.capability-list, .capability-list article { border-color: var(--ghost-border); }.capability-list { border-top: 1px solid var(--ghost-border); }.capability-list article { border-bottom: 1px solid var(--ghost-border); }.mode { flex: 0 0 auto; padding: .125rem .4rem; border-radius: .25rem; font-size: .625rem; font-weight: 800; text-transform: uppercase; }.mode-read { color: rgb(4 120 87); background: rgb(209 250 229); }.mode-create { color: rgb(126 34 206); background: rgb(243 232 255); }.mode-confirm { color: rgb(146 64 14); background: rgb(254 243 199); }.dark .mode-read { color: rgb(110 231 183); background: rgb(6 78 59); }.dark .mode-create { color: rgb(216 180 254); background: rgb(88 28 135); }.dark .mode-confirm { color: rgb(252 211 77); background: rgb(120 53 15); }
</style>
