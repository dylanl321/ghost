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
  { number: '01', shortNumber: '1', title: 'Add GHOST', description: 'Register the GHOST MCP server in your local Codex configuration.', command: 'addCommand' },
  { number: '02', shortNumber: '2', title: 'Sign in', description: 'Open the browser sign-in and authenticate with your Entra ID.', command: 'loginCommand' },
  { number: '03', shortNumber: '3', title: 'Verify the connection', railTitle: 'Verify', description: 'Check that GHOST is enabled and available to new Codex conversations.' }
] as const

const promptCategories: Array<{ id: PromptCategory; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'security', label: 'Security' },
  { id: 'operations', label: 'Operations' },
  { id: 'access', label: 'Access' }
]

const prompts: Array<{ category: PromptCategory; title: string; icon: string; value: string }> = [
  { category: 'general', title: 'Understand my AWS access', icon: 'i-heroicons-identification', value: 'Which AWS accounts can I access, and what grants that access?' },
  { category: 'general', title: 'Find an account', icon: 'i-heroicons-magnifying-glass', value: 'Find the AWS account for Project Atlas and summarize its IDs, owners, environment, and status.' },
  { category: 'general', title: 'Review recent activity', icon: 'i-heroicons-clock', value: 'What important changes, failed deployments, or new security issues occurred in account 123456789012 during the last 7 days?' },
  { category: 'security', title: 'Review compliance', icon: 'i-heroicons-shield-check', value: 'Summarize the compliance posture for account 123456789012 and prioritize the most important gaps.' },
  { category: 'security', title: 'Check Golden AMIs', icon: 'i-heroicons-cpu-chip', value: 'Which instances in account 123456789012 are not using an approved Golden AMI?' },
  { category: 'security', title: 'Review findings', icon: 'i-heroicons-exclamation-triangle', value: 'Show the most important unresolved security findings for account 123456789012.' },
  { category: 'operations', title: 'Check account health', icon: 'i-heroicons-heart', value: 'Review account 123456789012 for failed pipelines, recent changes, and operational risks.' },
  { category: 'operations', title: 'Inventory resources', icon: 'i-heroicons-server-stack', value: 'List the EC2 instances, S3 buckets, and Lambda functions in account 123456789012.' },
  { category: 'operations', title: 'Triage pipelines', icon: 'i-heroicons-wrench-screwdriver', value: 'Find failed pipelines affecting account 123456789012 during the last 30 days.' },
  { category: 'access', title: 'Explain access', icon: 'i-heroicons-users', value: 'Explain why jane.doe@gd-ms.com can access account 123456789012.' },
  { category: 'access', title: 'List my accounts', icon: 'i-heroicons-identification', value: 'Show every GHOST-managed AWS account I can access and the role available in each one.' },
  { category: 'access', title: 'Review account assignments', icon: 'i-heroicons-user-group', value: 'Show the users, groups, and roles that grant access to account 123456789012.' }
]

const visiblePrompts = computed(() => prompts.filter(prompt => prompt.category === promptCategory.value))
const completedSetup = computed(() => Boolean(config.value) && [config.value.codex.addCommand, config.value.codex.loginCommand].every(isCopied) && config.value.codex.verifyCommands.some(isCopied))

function isCopied(value: string) {
  return copiedValues.value.includes(value)
}

function isStepComplete(step: typeof steps[number]) {
  if (!config.value) return false
  return step.command ? isCopied(config.value.codex[step.command]) : config.value.codex.verifyCommands.some(isCopied)
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
  <div class="mcp-page mx-auto max-w-7xl px-4 pb-10 sm:px-6">
    <section class="mcp-surface">
    <header class="mcp-header">
      <div class="flex items-start gap-3">
        <div class="grid size-10 shrink-0 place-items-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <UIcon name="i-heroicons-link" class="size-5" />
        </div>
        <div>
          <p class="mcp-kicker">GHOST for Codex</p>
          <h1 class="mcp-title">Connect to GHOST</h1>
          <p class="mcp-intro mt-2 max-w-2xl text-sm leading-6">Add GHOST's AWS account context to Codex.</p>
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
      <main>
        <section class="setup-layout" aria-labelledby="setup-heading">
          <aside class="setup-rail">
            <p class="mcp-kicker">Codex setup</p>
            <h2 id="setup-heading" class="mcp-section-title">Run once</h2>
            <p>Run these commands on this computer in order.</p>
            <ol>
              <li v-for="step in steps" :key="`rail-${step.number}`" :class="{ complete: isStepComplete(step) }">
                <span><UIcon v-if="isStepComplete(step)" name="i-heroicons-check" class="size-3" /><template v-else>{{ step.shortNumber }}</template></span>
                {{ step.railTitle || step.title }}
              </li>
            </ol>
          </aside>

          <div>
          <ol class="setup-list">
            <li v-for="step in steps" :key="step.number" class="setup-step" :class="{ complete: isStepComplete(step) }">
              <span class="step-number"><UIcon v-if="isStepComplete(step)" name="i-heroicons-check" class="size-4" /><template v-else>{{ step.number }}</template></span>
              <div class="min-w-0">
                <h3>{{ step.title }}</h3>
                <p>{{ step.description }}</p>
                <template v-if="step.command">
                  <CommandBlock class="mcp-command mt-4" :value="config.codex[step.command]" :label="`${step.title} command`" wrap :copied="isCopied(config.codex[step.command])" @copy="copy(config.codex[step.command], `${step.title} command`)" />
                  <p v-if="isCopied(config.codex[step.command])" class="copy-note"><UIcon name="i-heroicons-check-circle" class="size-4" />Copied</p>
                  <template v-if="step.command === 'loginCommand'">
                    <div class="identity-note"><UIcon name="i-heroicons-shield-check" class="size-4" /><span>GHOST uses your identity and existing account permissions.</span></div>
                    <div class="reauth-note"><UIcon name="i-heroicons-exclamation-triangle" class="mt-0.5 size-4 shrink-0" /><span><strong>If Codex reports "failed to reauthenticate" or "not logged in":</strong> close Codex, run the login command again, then reopen Codex.</span></div>
                  </template>
                </template>
                <div v-else class="mt-4 space-y-3"><CommandBlock v-for="command in config.codex.verifyCommands" :key="command" class="mcp-command" :value="command" label="Verify command" wrap :copied="isCopied(command)" @copy="copy(command, 'Verify command')" /></div>
              </div>
            </li>
          </ol>
          <Transition name="completion"><div v-if="completedSetup" class="completion-note"><UIcon name="i-heroicons-check-circle" class="size-5" /><p><strong>Setup commands copied.</strong> Open a new Codex conversation to use GHOST.</p></div></Transition>
          </div>
        </section>

        <section class="mt-12" aria-labelledby="prompts-heading">
          <div class="mcp-rule flex items-end justify-between gap-4 pb-3"><div><p class="mcp-kicker">Try GHOST</p><h2 id="prompts-heading" class="mcp-section-title">Start a conversation</h2><p class="mcp-intro mt-1 text-sm">Copy an example or ask your own AWS question.</p></div><UButton to="/chat/mcp/details" icon="i-heroicons-command-line" color="gray" variant="ghost" size="xs" class="shrink-0">View tool catalog</UButton></div>
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
          <summary><span>Manual configuration and maintenance</span><UIcon name="i-heroicons-chevron-down" class="size-4" /></summary>
          <div class="space-y-8 pb-2 pt-4">
            <section><h2 class="advanced-heading">Manual Codex configuration</h2><p class="advanced-copy">For managed Codex settings, use the equivalent TOML configuration.</p><CommandBlock class="mcp-command" :value="config.codex.configToml" label="TOML configuration" multiline :copied="isCopied(config.codex.configToml)" @copy="copy(config.codex.configToml, 'TOML configuration')" /></section>
            <section><h2 class="advanced-heading">Connection details</h2><dl class="technical-list"><div><dt>Server URL</dt><dd><code>{{ config.serverUrl }}</code><UTooltip text="Copy server URL"><UButton icon="i-heroicons-clipboard" color="gray" variant="ghost" square size="xs" @click="copy(config.serverUrl, 'Server URL')" /></UTooltip></dd></div><div><dt>MCP protocol</dt><dd>{{ config.protocolVersion }}</dd></div><div><dt>Authorization server</dt><dd><code>{{ config.authorizationServer }}</code></dd></div></dl></section>
            <section><h2 class="advanced-heading">Sign out or remove GHOST</h2><div class="mt-3 space-y-3"><CommandBlock v-for="command in config.codex.resetCommands" :key="command" class="mcp-command" :value="command" label="Reset command" wrap :copied="isCopied(command)" @copy="copy(command, 'Reset command')" /></div></section>
          </div>
        </details>
      </main>
    </template>
    </section>
  </div>
</template>

<style scoped>
.mcp-surface { padding: clamp(1.25rem, 3vw, 2rem); background: var(--ghost-surface); border: 1px solid var(--ghost-border); border-radius: .5rem; box-shadow: 0 12px 30px rgb(0 0 0 / .08); }.mcp-kicker { margin: 0; color: rgb(5 150 105); font-size: .6875rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.mcp-header, .mcp-rule { border-bottom: 1px solid var(--ghost-border); }.mcp-header { padding-bottom: 1.5rem; }.mcp-page .mcp-header { animation: mcp-rise 180ms ease both; }.mcp-page main { padding-top: 1.75rem; }.mcp-intro { color: var(--ghost-text-muted); }
.mcp-title, .mcp-section-title { margin: .2rem 0 0; color: var(--ghost-text); font-weight: 700; letter-spacing: 0; }.mcp-title { font-size: clamp(1.5rem, 3vw, 2rem); line-height: 1.15; }.mcp-section-title { font-size: clamp(1.15rem, 2.5vw, 1.35rem); line-height: 1.25; }
.setup-layout { display: grid; grid-template-columns: 9.5rem minmax(0, 1fr); gap: 1.875rem; }.setup-rail { padding-top: .25rem; }.setup-rail > p:last-of-type { margin: .45rem 0 0; color: var(--ghost-text-muted); font-size: .75rem; line-height: 1.5; }.setup-rail ol { display: grid; gap: .75rem; margin: 1.25rem 0 0; padding: 0; list-style: none; }.setup-rail li { display: flex; align-items: center; gap: .55rem; color: var(--ghost-text-muted); font-size: .75rem; transition: color 180ms ease; }.setup-rail li > span { display: grid; width: 1.3125rem; height: 1.3125rem; place-items: center; color: rgb(217 119 6); font-size: .625rem; font-weight: 800; border: 1px solid var(--ghost-border); border-radius: 999px; transition: background 180ms ease, border-color 180ms ease, color 180ms ease; }.setup-rail li.complete { color: var(--ghost-text); font-weight: 700; }.setup-rail li.complete > span { color: rgb(6 78 59); background: rgb(110 231 183); border-color: rgb(110 231 183); }
.setup-list { margin: 0; padding: 0; list-style: none; }.setup-step { display: grid; grid-template-columns: 2.3125rem minmax(0, 1fr); gap: .875rem; padding: 0 0 1.5625rem; transition: border-color 180ms ease; }.setup-step + .setup-step { padding-top: 1.5625rem; border-top: 1px solid var(--ghost-border); }.setup-step.complete { border-color: rgb(110 231 183); }.step-number { display: grid; width: 1.6875rem; height: 1.6875rem; place-items: center; color: rgb(217 119 6); font-size: .625rem; font-weight: 800; line-height: 1; border: 1px solid var(--ghost-border); border-radius: 999px; transition: background 180ms ease, border-color 180ms ease, color 180ms ease; }.complete .step-number { color: rgb(6 78 59); background: rgb(110 231 183); border-color: rgb(110 231 183); }.setup-step h3 { margin: 0; color: var(--ghost-text); font-size: .875rem; font-weight: 700; }.setup-step p { margin: .25rem 0 0; color: var(--ghost-text-muted); font-size: .75rem; line-height: 1.5; }.copy-note { display: flex; align-items: center; gap: .35rem; color: rgb(5 150 105) !important; font-size: .75rem !important; }.identity-note { display: flex; gap: .45rem; align-items: center; margin-top: .75rem; color: color-mix(in srgb, var(--ghost-text) 42%, rgb(16 185 129)); font-size: .75rem; }.reauth-note { display: flex; gap: .5rem; margin-top: .625rem; padding: .625rem .75rem; color: color-mix(in srgb, var(--ghost-text) 72%, rgb(245 158 11)); background: color-mix(in srgb, var(--ghost-surface-2) 82%, rgb(245 158 11)); border-left: 3px solid rgb(245 158 11); border-radius: .1875rem; font-size: .75rem; line-height: 1.5; }.reauth-note strong { color: var(--ghost-text); }
.completion-note { display: flex; gap: .7rem; align-items: center; margin-top: 1.25rem; padding: .875rem 1rem; color: rgb(6 95 70); background: rgb(236 253 245); border: 1px solid rgb(110 231 183); border-radius: .375rem; }.completion-note p { margin: 0; font-size: .8125rem; }.completion-note strong { color: rgb(6 78 59); }.completion-enter-active, .completion-leave-active { transition: opacity 180ms ease, transform 180ms ease; }.completion-enter-from, .completion-leave-to { opacity: 0; transform: translateY(6px); }
:deep(.mcp-command) { border-color: transparent !important; background: linear-gradient(rgb(3 11 23), rgb(3 11 23)) padding-box, conic-gradient(from var(--mcp-trace-angle), rgb(132 101 238), rgb(74 168 244), rgb(242 167 87), rgb(216 110 234), rgb(132 101 238)) border-box !important; animation: mcp-command-trace 5s linear infinite; }
.prompt-tabs { display: inline-flex; max-width: 100%; overflow-x: auto; padding: .1875rem; background: var(--ghost-surface-2); border: 1px solid var(--ghost-border); border-radius: .375rem; }.prompt-tabs button { flex: 0 0 auto; padding: .4rem .7rem; color: var(--ghost-text-muted); font-size: .75rem; font-weight: 700; background: transparent; border: 0; border-radius: .25rem; cursor: pointer; transition: background 180ms ease, color 180ms ease; }.prompt-tabs button:hover { color: var(--ghost-text); }.prompt-tabs button[aria-selected='true'] { color: rgb(6 78 59); background: var(--ghost-surface); box-shadow: 0 1px 2px rgb(0 0 0 / .12); }
.prompt-grid { display: grid; gap: .5rem; }.prompt-card { position: relative; isolation: isolate; display: grid; grid-template-columns: 1.25rem minmax(0, 1fr) auto; gap: .75rem; padding: .875rem 1rem; overflow: hidden; background: var(--ghost-surface-2); border: 1px solid transparent; border-radius: .375rem; transition: transform 180ms ease, box-shadow 180ms ease; animation: mcp-rise 180ms ease both; }.prompt-card::before { position: absolute; z-index: -1; inset: -1px; content: ''; border-radius: .4375rem; background: linear-gradient(125deg, rgb(132 101 238), rgb(74 168 244), rgb(242 167 87), rgb(216 110 234)); background-size: 260% 260%; opacity: .55; animation: prompt-trace 7s ease infinite; }.prompt-card::after { position: absolute; z-index: -1; inset: 1px; content: ''; border-radius: .3125rem; background: var(--ghost-surface-2); }.prompt-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgb(0 0 0 / .16); }.prompt-card h3 { margin: 0; color: var(--ghost-text); font-size: .8125rem; font-weight: 700; }.prompt-card p { margin: .25rem 0 0; color: var(--ghost-text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .75rem; line-height: 1.5; overflow-wrap: anywhere; }
.advanced-section { margin-top: 3rem; border-top: 1px solid var(--ghost-border); border-bottom: 1px solid var(--ghost-border); }.advanced-section summary { display: flex; align-items: center; justify-content: space-between; padding: 1rem 0; color: var(--ghost-text); font-size: .875rem; font-weight: 700; cursor: pointer; list-style: none; }.advanced-section summary::-webkit-details-marker { display: none; }.advanced-section[open] summary svg { transform: rotate(180deg); }.advanced-heading { margin: 0; color: var(--ghost-text); font-size: .9375rem; font-weight: 700; }.advanced-copy { margin: .45rem 0 1rem; color: var(--ghost-text-muted); font-size: .8125rem; line-height: 1.55; }.technical-list { margin-top: 1rem; border-top: 1px solid var(--ghost-border); }.technical-list > div { display: grid; grid-template-columns: 10rem minmax(0, 1fr); gap: 1rem; padding: .7rem 0; border-bottom: 1px solid var(--ghost-border); font-size: .8125rem; }.technical-list dt { color: var(--ghost-text-muted); }.technical-list dd { display: flex; align-items: center; gap: .35rem; min-width: 0; margin: 0; color: var(--ghost-text); }.technical-list code { overflow-wrap: anywhere; }
@property --mcp-trace-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; } @keyframes mcp-command-trace { to { --mcp-trace-angle: 360deg; } } @keyframes prompt-trace { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } } @keyframes mcp-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 767px) { .mcp-surface { padding: 1rem; }.setup-layout { display: block; }.setup-rail { margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--ghost-border); }.setup-rail ol { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; }.setup-rail li { min-width: 0; }.setup-step { grid-template-columns: 2rem minmax(0, 1fr); gap: .625rem; }.technical-list > div { grid-template-columns: 1fr; gap: .25rem; } }
@media (prefers-reduced-motion: reduce) { .mcp-page .mcp-header, .prompt-card, :deep(.mcp-command), .prompt-card::before, .completion-enter-active, .completion-leave-active { animation: none; transition: none; } }
</style>
