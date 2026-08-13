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
const { acknowledge: acknowledgeMcpOffering } = useMcpOfferingDiscovery()

const desktopSteps = [
  { number: '01', title: 'Open Custom MCP', description: 'In Codex, open Settings, select Plugins, choose MCP, then open Custom.' },
  { number: '02', title: 'Add GHOST', description: 'Create a custom MCP connection with the name and server URL below.' },
  { number: '03', title: 'Authorize the connection', description: 'Save the connection and complete the GHOST sign-in when Codex prompts you.' },
  { number: '04', title: 'Start a new task', description: 'Confirm GHOST is connected, then open a new Codex task.' }
] as const

const cliSteps = [
  { number: '01', title: 'Add GHOST', description: 'Register the GHOST MCP server in your local Codex configuration.', command: 'addCommand' },
  { number: '02', title: 'Sign in', description: 'Open the browser sign-in and authenticate with your Entra ID.', command: 'loginCommand' },
  { number: '03', title: 'Verify the connection', description: 'Check that GHOST is enabled and available to new Codex tasks.', command: undefined }
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

onMounted(() => {
  refresh()
  void acknowledgeMcpOffering('mcp_visit')
})
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
          <p class="mcp-intro mt-2 max-w-2xl text-sm leading-6">Add GHOST's AWS account context to Codex using the desktop app or CLI.</p>
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
        <section aria-labelledby="setup-heading">
          <div>
            <p class="mcp-kicker">Configuration</p>
            <h2 id="setup-heading" class="mcp-section-title">Set up GHOST</h2>
            <p class="mcp-intro mt-1 text-sm">Configure GHOST in the Codex desktop app or through the CLI.</p>
          </div>

          <div class="configuration-grid mt-6">
            <section class="configuration-option" aria-labelledby="desktop-setup-heading">
              <div class="configuration-option-header">
                <div class="configuration-option-icon"><UIcon name="i-heroicons-window" class="size-5" /></div>
                <div><h3 id="desktop-setup-heading">Codex desktop app</h3><p>Configure the connection in Codex settings.</p></div>
              </div>
              <ol class="setup-list mt-5">
                <li v-for="step in desktopSteps" :key="`desktop-${step.number}`" class="setup-step">
                  <span class="step-number">{{ step.number }}</span>
                  <div class="min-w-0">
                    <h3>{{ step.title }}</h3>
                    <p>{{ step.description }}</p>
                    <template v-if="step.number === '02'">
                      <div class="desktop-field mt-4"><span>Name</span><code>GHOST</code></div>
                      <CommandBlock class="mcp-command mt-3" :value="config.serverUrl" label="GHOST server URL" wrap :copied="isCopied(config.serverUrl)" @copy="copy(config.serverUrl, 'GHOST server URL')" />
                      <p v-if="isCopied(config.serverUrl)" class="copy-note"><UIcon name="i-heroicons-check-circle" class="size-4" />Server URL copied</p>
                    </template>
                    <div v-if="step.number === '03'" class="identity-note"><UIcon name="i-heroicons-shield-check" class="size-4" /><span>GHOST uses your identity and existing account permissions.</span></div>
                  </div>
                </li>
              </ol>
            </section>

            <section class="configuration-option" aria-labelledby="cli-setup-heading">
              <div class="configuration-option-header">
                <div class="configuration-option-icon"><UIcon name="i-heroicons-command-line" class="size-5" /></div>
                <div><h3 id="cli-setup-heading">Codex CLI</h3><p>Configure the same connection from a terminal.</p></div>
              </div>
              <ol class="setup-list mt-5">
                <li v-for="step in cliSteps" :key="`cli-${step.number}`" class="setup-step">
                  <span class="step-number">{{ step.number }}</span>
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
            </section>
          </div>
        </section>

        <section class="mt-12" aria-labelledby="prompts-heading">
          <div class="mcp-rule flex flex-wrap items-end justify-between gap-4 pb-3"><div><p class="mcp-kicker">Try GHOST</p><h2 id="prompts-heading" class="mcp-section-title">Start a conversation</h2><p class="mcp-intro mt-1 text-sm">Copy an example or ask your own AWS question.</p></div><div class="flex max-w-full shrink-0 flex-wrap justify-end gap-1"><UButton to="/support/docs?topic=mcp-connections-guide" icon="i-heroicons-lifebuoy" color="gray" variant="ghost" size="xs">Help and troubleshooting</UButton><UButton to="/chat/mcp/details" icon="i-heroicons-command-line" color="gray" variant="ghost" size="xs">View tool catalog</UButton></div></div>
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
.mcp-page { position: relative; isolation: isolate; padding-top: 1.5rem; overflow: hidden; }.mcp-page::before { position: absolute; z-index: -1; inset: .25rem -8% auto; height: 25rem; pointer-events: none; content: ''; background: linear-gradient(115deg, transparent 0 20%, rgb(132 101 238 / .1) 30%, transparent 40% 58%, rgb(74 168 244 / .09) 68%, rgb(242 167 87 / .08) 74%, rgb(216 110 234 / .09) 80%, transparent 92%); background-size: 220% 100%; mask-image: linear-gradient(to bottom, black, transparent 80%); animation: mcp-page-trace 18s ease-in-out infinite; }
.mcp-surface { padding: clamp(1.25rem, 3vw, 2rem); background: linear-gradient(var(--ghost-surface), var(--ghost-surface)) padding-box, conic-gradient(from var(--mcp-trace-angle), rgb(132 101 238 / .8), rgb(74 168 244 / .8), rgb(242 167 87 / .8), rgb(216 110 234 / .8), rgb(132 101 238 / .8)) border-box; border: 1px solid transparent; border-radius: .5rem; box-shadow: 0 12px 30px rgb(0 0 0 / .08); animation: mcp-command-trace 18s linear infinite; }.mcp-kicker { margin: 0; color: rgb(5 150 105); font-size: .6875rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.mcp-header, .mcp-rule { border-bottom: 1px solid var(--ghost-border); }.mcp-header { padding-bottom: 1.5rem; }.mcp-page .mcp-header { animation: mcp-rise 180ms ease both; }.mcp-page main { padding-top: 1.75rem; }.mcp-intro { color: var(--ghost-text-muted); }
.mcp-title, .mcp-section-title { margin: .2rem 0 0; color: var(--ghost-text); font-weight: 700; letter-spacing: 0; }.mcp-title { font-size: clamp(1.5rem, 3vw, 2rem); line-height: 1.15; }.mcp-section-title { font-size: clamp(1.15rem, 2.5vw, 1.35rem); line-height: 1.25; }
.configuration-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2rem; }
.configuration-option { min-width: 0; }
.configuration-option + .configuration-option { padding-left: 2rem; border-left: 1px solid var(--ghost-border); }
.configuration-option-header { display: flex; gap: .75rem; align-items: center; min-height: 2.75rem; }
.configuration-option-header h3 { margin: 0; color: var(--ghost-text); font-size: .9375rem; font-weight: 700; }
.configuration-option-header p { margin: .2rem 0 0; color: var(--ghost-text-muted); font-size: .75rem; line-height: 1.4; }
.configuration-option-icon { display: grid; width: 2.5rem; height: 2.5rem; flex: 0 0 auto; place-items: center; color: rgb(5 150 105); background: color-mix(in srgb, var(--ghost-surface-2) 80%, rgb(16 185 129)); border: 1px solid color-mix(in srgb, var(--ghost-border) 65%, rgb(16 185 129)); border-radius: .375rem; }
.desktop-field { display: grid; grid-template-columns: 5rem minmax(0, 1fr); gap: .75rem; padding: .625rem 0; border-top: 1px solid var(--ghost-border); border-bottom: 1px solid var(--ghost-border); font-size: .75rem; }
.desktop-field span { color: var(--ghost-text-muted); }
.desktop-field code { color: var(--ghost-text); font-weight: 700; }
.setup-list { margin: 0; padding: 0; list-style: none; }.setup-step { display: grid; grid-template-columns: 2.3125rem minmax(0, 1fr); gap: .875rem; padding: 0 0 1.5625rem; transition: border-color 180ms ease; }.setup-step + .setup-step { padding-top: 1.5625rem; border-top: 1px solid var(--ghost-border); }.step-number { display: grid; width: 1.6875rem; height: 1.6875rem; place-items: center; color: rgb(217 119 6); font-size: .625rem; font-weight: 800; line-height: 1; border: 1px solid var(--ghost-border); border-radius: 999px; transition: background 180ms ease, border-color 180ms ease, color 180ms ease; }.setup-step h3 { margin: 0; color: var(--ghost-text); font-size: .875rem; font-weight: 700; }.setup-step p { margin: .25rem 0 0; color: var(--ghost-text-muted); font-size: .75rem; line-height: 1.5; }.copy-note { display: flex; align-items: center; gap: .35rem; color: rgb(5 150 105) !important; font-size: .75rem !important; }.identity-note { display: flex; gap: .45rem; align-items: center; margin-top: .75rem; color: color-mix(in srgb, var(--ghost-text) 42%, rgb(16 185 129)); font-size: .75rem; }.reauth-note { display: flex; gap: .5rem; margin-top: .625rem; padding: .625rem .75rem; color: color-mix(in srgb, var(--ghost-text) 72%, rgb(245 158 11)); background: color-mix(in srgb, var(--ghost-surface-2) 82%, rgb(245 158 11)); border-left: 3px solid rgb(245 158 11); border-radius: .1875rem; font-size: .75rem; line-height: 1.5; }.reauth-note strong { color: var(--ghost-text); }
:deep(.mcp-command) { border-color: transparent !important; background: linear-gradient(rgb(3 11 23), rgb(3 11 23)) padding-box, conic-gradient(from var(--mcp-trace-angle), rgb(132 101 238), rgb(74 168 244), rgb(242 167 87), rgb(216 110 234), rgb(132 101 238)) border-box !important; animation: mcp-command-trace 5s linear infinite; }
.prompt-tabs { display: inline-flex; max-width: 100%; overflow-x: auto; padding: .1875rem; background: var(--ghost-surface-2); border: 1px solid var(--ghost-border); border-radius: .375rem; }.prompt-tabs button { flex: 0 0 auto; padding: .4rem .7rem; color: var(--ghost-text-muted); font-size: .75rem; font-weight: 700; background: transparent; border: 0; border-radius: .25rem; cursor: pointer; transition: background 180ms ease, color 180ms ease; }.prompt-tabs button:hover { color: var(--ghost-text); }.prompt-tabs button[aria-selected='true'] { color: rgb(6 78 59); background: var(--ghost-surface); box-shadow: 0 1px 2px rgb(0 0 0 / .12); }
.prompt-grid { display: grid; gap: .5rem; }.prompt-card { position: relative; isolation: isolate; display: grid; grid-template-columns: 1.25rem minmax(0, 1fr) auto; gap: .75rem; padding: .875rem 1rem; overflow: hidden; background: var(--ghost-surface-2); border: 1px solid transparent; border-radius: .375rem; transition: transform 180ms ease, box-shadow 180ms ease; animation: mcp-rise 180ms ease both; }.prompt-card::before { position: absolute; z-index: -1; inset: -1px; content: ''; border-radius: .4375rem; background: linear-gradient(125deg, rgb(132 101 238), rgb(74 168 244), rgb(242 167 87), rgb(216 110 234)); background-size: 260% 260%; opacity: .55; animation: prompt-trace 7s ease infinite; }.prompt-card::after { position: absolute; z-index: -1; inset: 1px; content: ''; border-radius: .3125rem; background: var(--ghost-surface-2); }.prompt-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgb(0 0 0 / .16); }.prompt-card h3 { margin: 0; color: var(--ghost-text); font-size: .8125rem; font-weight: 700; }.prompt-card p { margin: .25rem 0 0; color: var(--ghost-text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .75rem; line-height: 1.5; overflow-wrap: anywhere; }
.advanced-section { margin-top: 3rem; border-top: 1px solid var(--ghost-border); border-bottom: 1px solid var(--ghost-border); }.advanced-section summary { display: flex; align-items: center; justify-content: space-between; padding: 1rem 0; color: var(--ghost-text); font-size: .875rem; font-weight: 700; cursor: pointer; list-style: none; }.advanced-section summary::-webkit-details-marker { display: none; }.advanced-section[open] summary svg { transform: rotate(180deg); }.advanced-heading { margin: 0; color: var(--ghost-text); font-size: .9375rem; font-weight: 700; }.advanced-copy { margin: .45rem 0 1rem; color: var(--ghost-text-muted); font-size: .8125rem; line-height: 1.55; }.technical-list { margin-top: 1rem; border-top: 1px solid var(--ghost-border); }.technical-list > div { display: grid; grid-template-columns: 10rem minmax(0, 1fr); gap: 1rem; padding: .7rem 0; border-bottom: 1px solid var(--ghost-border); font-size: .8125rem; }.technical-list dt { color: var(--ghost-text-muted); }.technical-list dd { display: flex; align-items: center; gap: .35rem; min-width: 0; margin: 0; color: var(--ghost-text); }.technical-list code { overflow-wrap: anywhere; }
@property --mcp-trace-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; } @keyframes mcp-command-trace { to { --mcp-trace-angle: 360deg; } } @keyframes mcp-page-trace { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } } @keyframes prompt-trace { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } } @keyframes mcp-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
@media (max-width: 900px) { .configuration-grid { grid-template-columns: 1fr; }.configuration-option + .configuration-option { padding-top: 2rem; padding-left: 0; border-top: 1px solid var(--ghost-border); border-left: 0; } }
@media (max-width: 767px) { .mcp-surface { padding: 1rem; }.setup-step { grid-template-columns: 2rem minmax(0, 1fr); gap: .625rem; }.technical-list > div { grid-template-columns: 1fr; gap: .25rem; } }
@media (prefers-reduced-motion: reduce) { .mcp-page::before, .mcp-surface, .mcp-page .mcp-header, .prompt-card, :deep(.mcp-command), .prompt-card::before { animation: none; transition: none; } }
</style>
