<script setup lang="ts">
definePageMeta({
  title: 'MCP Connections',
  description: 'Connect Codex to GHOST'
})

interface McpConfig {
  serverUrl: string
  authorizationServer: string
  protocolVersion: string
  codex: {
    addCommand: string
    loginCommand: string
    verifyCommands: string[]
    resetCommands: string[]
    configToml: string
  }
}

type PromptCategory = 'general' | 'security' | 'operations' | 'access'

const config = ref<McpConfig | null>(null)
const pending = ref(true)
const error = ref<Error | null>(null)
const copiedValues = ref<string[]>([])
const promptCategory = ref<PromptCategory>('general')
const toast = useToast()

const steps = [
  { number: '01', title: 'Add GHOST', description: 'Add the GHOST connection to Codex on this computer.', command: 'addCommand' },
  { number: '02', title: 'Sign in', description: 'A browser opens for your normal Entra sign-in. No keys or credentials need to be copied.', command: 'loginCommand' },
  { number: '03', title: 'Verify', description: 'Confirm GHOST is available, then open a new Codex conversation.' }
] as const

const promptCategories: Array<{ id: PromptCategory; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'security', label: 'Security' },
  { id: 'operations', label: 'Operations' },
  { id: 'access', label: 'Access' }
]

const prompts: Array<{ category: PromptCategory; title: string; icon: string; value: string }> = [
  { category: 'general', title: 'What can GHOST help with?', icon: 'i-heroicons-sparkles', value: 'What information can you help me find about our AWS accounts, resources, access, costs, security, and pipelines?' },
  { category: 'general', title: 'Find an account', icon: 'i-heroicons-magnifying-glass', value: 'Find the AWS account for Project Atlas and give me its account IDs, owners, environment, and current status.' },
  { category: 'general', title: 'What changed recently?', icon: 'i-heroicons-clock', value: 'What important changes, failed deployments, or new security issues happened in account 123456789012 in the last 7 days?' },
  { category: 'security', title: 'Compliance posture', icon: 'i-heroicons-shield-check', value: 'Summarize the current compliance posture for account 123456789012. Prioritize critical and high findings, patch compliance gaps, and the next actions to take.' },
  { category: 'security', title: 'Golden AMIs', icon: 'i-heroicons-cpu-chip', value: 'Which EC2 instances in account 123456789012 are not using an approved Golden AMI? Group them by owner and explain the remediation path.' },
  { category: 'security', title: 'Open findings', icon: 'i-heroicons-exclamation-triangle', value: 'Show the most important unresolved security findings for account 123456789012, including affected resources and recommended owners.' },
  { category: 'operations', title: 'Account health', icon: 'i-heroicons-heart', value: 'Give me an account health review for account 123456789012: failed pipelines, recent write activity, security risks, and the highest-value remediation plan.' },
  { category: 'operations', title: 'Remediation plan', icon: 'i-heroicons-wrench-screwdriver', value: 'Build a remediation plan for the critical findings in account 123456789012. Sequence the work, identify likely owners, and call out approvals or evidence needed.' },
  { category: 'operations', title: 'Resource inventory', icon: 'i-heroicons-server-stack', value: 'List the EC2 instances, S3 buckets, and Lambda functions in account 123456789012. Call out resources without an obvious owner.' },
  { category: 'access', title: 'Access explanation', icon: 'i-heroicons-users', value: 'Explain why jane.doe@gd-ms.com has access to account 123456789012. Include the Entra group, mapped role, and any relevant account assignment.' },
  { category: 'access', title: 'Account lookup', icon: 'i-heroicons-magnifying-glass', value: 'Find the GHOST account named "Project Atlas". Summarize its Commercial and GovCloud IDs, owners, status, department, and line of business.' },
  { category: 'access', title: 'My account access', icon: 'i-heroicons-identification', value: 'Show which GHOST-managed AWS accounts I can access and explain which Entra group and AWS role grants each one.' }
]

const visiblePrompts = computed(() => prompts.filter(prompt => prompt.category === promptCategory.value))
const completedSetup = computed(() => Boolean(config.value) && [config.value.codex.addCommand, config.value.codex.loginCommand].every(isCopied) && config.value.codex.verifyCommands.some(isCopied))

function isCopied(value: string) {
  return copiedValues.value.includes(value)
}

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    if (!isCopied(value)) copiedValues.value.push(value)
    toast.add({ title: `${label} copied`, icon: 'i-heroicons-check-circle', color: 'green' })
  } catch {
    toast.add({ title: `Could not copy ${label.toLowerCase()}`, description: 'Select the text and copy it manually.', icon: 'i-heroicons-exclamation-circle', color: 'red' })
  }
}

async function refresh() {
  pending.value = true
  error.value = null
  try {
    config.value = await $fetch<McpConfig>('/api/mcp/config')
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause : new Error('MCP configuration is unavailable')
  } finally {
    pending.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="mcp-page mx-auto max-w-5xl px-4 pb-14 sm:px-6">
    <header class="border-b border-gray-200 py-7 dark:border-gray-700">
      <div class="flex items-start gap-3">
        <div class="grid size-10 shrink-0 place-items-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <UIcon name="i-heroicons-link" class="size-5" />
        </div>
        <div>
          <p class="mcp-kicker">GHOST for Codex</p>
          <h1 class="mcp-title">Connect your AWS context.</h1>
          <p class="mt-2 max-w-2xl text-sm leading-6 text-gray-600 dark:text-gray-300">Three commands, one browser sign-in, and GHOST is ready in a new Codex conversation.</p>
        </div>
      </div>
    </header>

    <div v-if="pending" class="py-20 text-center text-gray-500 dark:text-gray-400">
      <UIcon name="i-heroicons-arrow-path" class="mx-auto size-6 animate-spin" />
    </div>

    <div v-else-if="error" class="py-12">
      <UAlert color="red" variant="soft" title="MCP configuration is unavailable" :description="error.message">
        <template #actions><UButton icon="i-heroicons-arrow-path" color="red" variant="soft" @click="refresh">Retry</UButton></template>
      </UAlert>
    </div>

    <template v-else-if="config">
      <main class="py-8">
        <section aria-labelledby="setup-heading">
          <div class="border-b border-gray-200 pb-3 dark:border-gray-700"><p class="mcp-kicker">Setup</p><h2 id="setup-heading" class="mcp-section-title">Everything you need, in order.</h2></div>

          <ol class="setup-list">
            <li v-for="step in steps" :key="step.number" class="setup-step" :class="{ complete: step.command ? isCopied(config.codex[step.command]) : config.codex.verifyCommands.some(isCopied) }">
              <span class="step-number"><UIcon v-if="step.command ? isCopied(config.codex[step.command]) : config.codex.verifyCommands.some(isCopied)" name="i-heroicons-check" class="size-4" /><template v-else>{{ step.number }}</template></span>
              <div class="min-w-0">
                <h3>{{ step.title }}</h3>
                <p>{{ step.description }}</p>
                <template v-if="step.command">
                  <CommandBlock class="mcp-command mt-4" :value="config.codex[step.command]" :label="`${step.title} command`" wrap :copied="isCopied(config.codex[step.command])" @copy="copy(config.codex[step.command], `${step.title} command`)" />
                  <p v-if="isCopied(config.codex[step.command])" class="copy-note"><UIcon name="i-heroicons-check-circle" class="size-4" />Copied</p>
                </template>
                <div v-else class="mt-4 space-y-3"><CommandBlock v-for="command in config.codex.verifyCommands" :key="command" class="mcp-command" :value="command" label="Verify command" wrap :copied="isCopied(command)" @copy="copy(command, 'Verify command')" /></div>
              </div>
            </li>
          </ol>
          <Transition name="completion"><div v-if="completedSetup" class="completion-note"><UIcon name="i-heroicons-sparkles" class="size-5" /><p><strong>You are connected.</strong> Start a new Codex conversation and let GHOST do the looking up.</p></div></Transition>
        </section>

        <section class="mt-12" aria-labelledby="prompts-heading">
          <div class="flex items-end justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-700"><div><p class="mcp-kicker">Start here</p><h2 id="prompts-heading" class="mcp-section-title">Ask a useful question.</h2><p class="mt-1 text-sm text-gray-600 dark:text-gray-300">Open a new Codex conversation and paste a prompt.</p></div><UButton to="/chat/mcp/details" icon="i-heroicons-command-line" color="gray" variant="ghost" size="xs" class="shrink-0">Explore tools</UButton></div>
          <div class="prompt-tabs mt-4" role="tablist" aria-label="Prompt categories">
            <button v-for="category in promptCategories" :key="category.id" class="rounded px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300" :class="{ 'bg-white text-emerald-800 shadow-sm dark:bg-gray-900 dark:text-emerald-300': promptCategory === category.id }" role="tab" :aria-selected="promptCategory === category.id" @click="promptCategory = category.id">{{ category.label }}</button>
          </div>
          <div class="prompt-grid mt-3">
            <article v-for="prompt in visiblePrompts" :key="prompt.title" class="prompt-card">
              <UIcon :name="prompt.icon" class="mt-0.5 size-5 text-emerald-600 dark:text-emerald-400" />
              <div class="min-w-0"><h3>{{ prompt.title }}</h3><p>{{ prompt.value }}</p></div>
              <UTooltip :text="isCopied(prompt.value) ? 'Prompt copied' : `Copy ${prompt.title.toLowerCase()} prompt`"><UButton :icon="isCopied(prompt.value) ? 'i-heroicons-check' : 'i-heroicons-clipboard'" color="gray" variant="ghost" square size="xs" @click="copy(prompt.value, `${prompt.title} prompt`)" /></UTooltip>
            </article>
          </div>
        </section>

        <details class="advanced-section">
          <summary><span>Advanced options</span><UIcon name="i-heroicons-chevron-down" class="size-4" /></summary>
          <div class="space-y-8 pb-2 pt-4">
            <section><h2 class="advanced-heading">Manual Codex configuration</h2><p class="advanced-copy">For managed Codex settings, use the equivalent TOML configuration.</p><CommandBlock class="mcp-command" :value="config.codex.configToml" label="TOML configuration" multiline :copied="isCopied(config.codex.configToml)" @copy="copy(config.codex.configToml, 'TOML configuration')" /></section>
            <section><h2 class="advanced-heading">Connection details</h2><dl class="technical-list"><div><dt>Server URL</dt><dd><code>{{ config.serverUrl }}</code><UTooltip text="Copy server URL"><UButton icon="i-heroicons-clipboard" color="gray" variant="ghost" square size="xs" @click="copy(config.serverUrl, 'Server URL')" /></UTooltip></dd></div><div><dt>MCP protocol</dt><dd>{{ config.protocolVersion }}</dd></div><div><dt>Authorization server</dt><dd><code>{{ config.authorizationServer }}</code></dd></div></dl></section>
            <section><h2 class="advanced-heading">Sign out or remove GHOST</h2><div class="mt-3 space-y-3"><CommandBlock v-for="command in config.codex.resetCommands" :key="command" class="mcp-command" :value="command" label="Reset command" wrap :copied="isCopied(command)" @copy="copy(command, 'Reset command')" /></div></section>
          </div>
        </details>
      </main>
    </template>
  </div>
</template>

<style scoped>
.mcp-kicker { margin: 0; color: rgb(5 150 105); font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.mcp-page > header { animation: mcp-rise 180ms ease both; }
.mcp-title, .mcp-section-title { margin: .2rem 0 0; color: rgb(17 24 39); font-weight: 650; letter-spacing: 0; }.mcp-title { font-size: clamp(1.8rem, 4vw, 2.4rem); line-height: 1.1; }.mcp-section-title { font-size: clamp(1.35rem, 3vw, 1.75rem); line-height: 1.2; }
.setup-list { margin: 0; padding: 0; list-style: none; }.setup-step { display: grid; grid-template-columns: 3.25rem minmax(0, 1fr); gap: 1rem; padding: 2rem 0; border-bottom: 1px solid rgb(229 231 235); transition: border-color 180ms ease; }.setup-step.complete { border-color: rgb(110 231 183); }.step-number { display: grid; width: 2.125rem; height: 2.125rem; place-items: center; color: rgb(180 83 9); font-size: .8125rem; font-weight: 800; line-height: 1; border: 1px solid rgb(156 163 175); border-radius: 999px; transition: background 180ms ease, border-color 180ms ease, color 180ms ease; }.complete .step-number { color: rgb(6 78 59); background: rgb(110 231 183); border-color: rgb(110 231 183); }.setup-step h3 { margin: 0; color: rgb(17 24 39); font-size: 1rem; font-weight: 700; }.setup-step p { margin: .35rem 0 0; color: rgb(75 85 99); font-size: .875rem; line-height: 1.55; }.copy-note { display: flex; align-items: center; gap: .35rem; color: rgb(5 120 87) !important; font-size: .75rem !important; }.completion-note { display: flex; gap: .7rem; align-items: center; margin-top: 1.25rem; padding: .875rem 1rem; color: rgb(6 95 70); background: rgb(236 253 245); border: 1px solid rgb(110 231 183); border-radius: .375rem; }.completion-note p { margin: 0; font-size: .8125rem; }.completion-note strong { color: rgb(6 78 59); }.completion-enter-active, .completion-leave-active { transition: opacity 180ms ease, transform 180ms ease; }.completion-enter-from, .completion-leave-to { opacity: 0; transform: translateY(6px); }
:deep(.mcp-command) { border-color: transparent !important; background: linear-gradient(rgb(3 11 23), rgb(3 11 23)) padding-box, conic-gradient(from var(--mcp-trace-angle), rgb(132 101 238), rgb(74 168 244), rgb(242 167 87), rgb(216 110 234), rgb(132 101 238)) border-box !important; animation: mcp-command-trace 5s linear infinite; }.prompt-tabs { display: inline-flex; max-width: 100%; overflow-x: auto; padding: .1875rem; background: rgb(243 244 246); border: 1px solid rgb(229 231 235); border-radius: .375rem; }.prompt-tabs button { flex: 0 0 auto; padding: .4rem .7rem; color: rgb(75 85 99); font-size: .75rem; font-weight: 700; background: transparent; border: 0; border-radius: .25rem; cursor: pointer; transition: background 180ms ease, color 180ms ease; }.prompt-tabs button:hover { color: rgb(17 24 39); }.prompt-tabs button[aria-selected='true'] { color: rgb(6 78 59); background: white; box-shadow: 0 1px 2px rgb(0 0 0 / .08); }.prompt-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }.prompt-card { position: relative; isolation: isolate; display: grid; grid-template-columns: 1.25rem minmax(0, 1fr) auto; gap: .75rem; min-height: 9rem; padding: 1rem; overflow: hidden; background: white; border: 1px solid transparent; border-radius: .4375rem; transition: transform 180ms ease, box-shadow 180ms ease; animation: mcp-rise 180ms ease both; }.prompt-card::before { position: absolute; z-index: -1; inset: -1px; content: ''; border-radius: .5rem; background: linear-gradient(125deg, rgb(132 101 238), rgb(74 168 244), rgb(242 167 87), rgb(216 110 234)); background-size: 260% 260%; opacity: .55; animation: prompt-trace 7s ease infinite; }.prompt-card::after { position: absolute; z-index: -1; inset: 1px; content: ''; border-radius: .375rem; background: white; }.prompt-card:hover { transform: translateY(-3px); box-shadow: 0 10px 25px rgb(15 23 42 / .14); }.prompt-card h3 { margin: 0; color: rgb(17 24 39); font-size: .875rem; font-weight: 700; }.prompt-card p { margin: .35rem 0 0; color: rgb(55 65 81); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .75rem; line-height: 1.55; overflow-wrap: anywhere; }.advanced-section { margin-top: 3rem; border-top: 1px solid rgb(156 163 175); border-bottom: 1px solid rgb(209 213 219); }.advanced-section summary { display: flex; align-items: center; justify-content: space-between; padding: 1rem 0; color: rgb(31 41 55); font-size: .875rem; font-weight: 700; cursor: pointer; list-style: none; }.advanced-section summary::-webkit-details-marker { display: none; }.advanced-section[open] summary svg { transform: rotate(180deg); }.advanced-heading { margin: 0; color: rgb(17 24 39); font-size: .9375rem; font-weight: 700; }.advanced-copy { margin: .45rem 0 1rem; color: rgb(75 85 99); font-size: .8125rem; line-height: 1.55; }.technical-list { margin-top: 1rem; border-top: 1px solid rgb(229 231 235); }.technical-list > div { display: grid; grid-template-columns: 10rem minmax(0, 1fr); gap: 1rem; padding: .7rem 0; border-bottom: 1px solid rgb(229 231 235); font-size: .8125rem; }.technical-list dt { color: rgb(107 114 128); }.technical-list dd { display: flex; align-items: center; gap: .35rem; min-width: 0; margin: 0; color: rgb(31 41 55); }.technical-list code { overflow-wrap: anywhere; }
:global(.dark) .mcp-title, :global(.dark) .mcp-section-title, :global(.dark) .setup-step h3, :global(.dark) .advanced-heading, :global(.dark) .prompt-card h3 { color: white; }:global(.dark) .setup-step p, :global(.dark) .advanced-copy, :global(.dark) .technical-list dd, :global(.dark) .prompt-card p { color: rgb(209 213 219); }:global(.dark) .setup-step, :global(.dark) .advanced-section, :global(.dark) .technical-list, :global(.dark) .technical-list > div { border-color: rgb(55 65 81); }:global(.dark) .advanced-section summary { color: rgb(229 231 235); }:global(.dark) .completion-note { color: rgb(167 243 208); background: rgb(6 78 59 / .45); border-color: rgb(6 95 70); }:global(.dark) .completion-note strong { color: white; }:global(.dark) .prompt-tabs { background: rgb(31 41 55); border-color: rgb(75 85 99); }:global(.dark) .prompt-tabs button:hover { color: white; }:global(.dark) .prompt-tabs button[aria-selected='true'] { color: rgb(167 243 208); background: rgb(17 24 39); }:global(.dark) .prompt-card, :global(.dark) .prompt-card::after { background: rgb(17 24 39); }
@property --mcp-trace-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; } @keyframes mcp-command-trace { to { --mcp-trace-angle: 360deg; } } @keyframes prompt-trace { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } } @keyframes mcp-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 640px) { .setup-step { grid-template-columns: 2.5rem minmax(0, 1fr); gap: .75rem; }.prompt-grid { grid-template-columns: 1fr; }.technical-list > div { grid-template-columns: 1fr; gap: .25rem; } }
@media (prefers-reduced-motion: reduce) { .mcp-page > header, .prompt-card, :deep(.mcp-command), .prompt-card::before, .completion-enter-active, .completion-leave-active { animation: none; transition: none; } }
</style>
