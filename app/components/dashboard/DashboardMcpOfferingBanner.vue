<template>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 -translate-y-1"
    enter-to-class="opacity-100 translate-y-0"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <section v-if="visible" class="mcp-offering-banner" aria-labelledby="mcp-offering-title">
      <div class="mcp-offering-icon">
        <UIcon name="i-heroicons-link" class="size-5" />
      </div>
      <div class="min-w-0 flex-1">
        <h2 id="mcp-offering-title">Use GHOST directly in Codex</h2>
        <p>Connect the Codex desktop app or CLI to search accounts, review costs and security, and work with your existing AWS access.</p>
      </div>
      <div class="mcp-offering-actions">
        <UButton icon="i-heroicons-link" color="gray" variant="soft" size="xs" @click="openConfiguration">
          Configure GHOST
        </UButton>
        <UButton icon="i-heroicons-lifebuoy" color="gray" variant="soft" size="xs" @click="openSupport">
          Setup and troubleshooting
        </UButton>
      </div>
      <UTooltip text="Dismiss MCP introduction">
        <UButton icon="i-heroicons-x-mark" color="gray" variant="ghost" square size="xs" aria-label="Dismiss MCP introduction" @click="dismiss" />
      </UTooltip>
    </section>
  </Transition>
</template>

<script setup lang="ts">
const visible = ref(false)
const { recordDashboardImpression, acknowledge } = useMcpOfferingDiscovery()

async function dismiss() {
  visible.value = false
  await acknowledge('dismiss')
}

async function openConfiguration() {
  visible.value = false
  await acknowledge('configure')
  await navigateTo('/mcp-connections')
}

async function openSupport() {
  visible.value = false
  await acknowledge('support')
  await navigateTo('/support/docs?topic=mcp-connections-guide')
}

onMounted(async () => {
  visible.value = await recordDashboardImpression()
})
</script>

<style scoped>
.mcp-offering-banner { display: flex; align-items: flex-start; gap: .875rem; padding: .875rem 1rem; color: var(--ghost-text); background: linear-gradient(var(--ghost-surface), var(--ghost-surface)) padding-box, linear-gradient(115deg, rgb(132 101 238 / .75), rgb(74 168 244 / .75), rgb(242 167 87 / .7), rgb(216 110 234 / .75)) border-box; border: 1px solid transparent; border-radius: .5rem; box-shadow: 0 4px 14px rgb(0 0 0 / .05); }
.mcp-offering-icon { display: grid; width: 2.25rem; height: 2.25rem; flex: 0 0 auto; place-items: center; color: rgb(5 150 105); background: color-mix(in srgb, var(--ghost-surface-2) 78%, rgb(16 185 129)); border: 1px solid color-mix(in srgb, var(--ghost-border) 65%, rgb(16 185 129)); border-radius: .375rem; }
.mcp-offering-banner h2 { margin: 0; font-size: .875rem; font-weight: 700; line-height: 1.4; }
.mcp-offering-banner p { margin: .2rem 0 0; color: var(--ghost-text-muted); font-size: .75rem; line-height: 1.5; }
.mcp-offering-actions { display: flex; flex: 0 0 auto; align-items: center; gap: .375rem; }
@media (max-width: 900px) { .mcp-offering-banner { flex-wrap: wrap; }.mcp-offering-actions { order: 3; width: calc(100% - 3.125rem); margin-left: 3.125rem; flex-wrap: wrap; } }
@media (max-width: 520px) { .mcp-offering-actions { width: 100%; margin-left: 0; }.mcp-offering-actions :deep(button) { justify-content: flex-start; } }
</style>
