<script setup lang="ts">
definePageMeta({
  title: 'MCP Connections',
  description: 'Connect GHOST to Codex'
})

interface McpConfig {
  serverUrl: string
  authorizationServer: string
  protocolVersion: string
  codex: {
    addCommand: string
    loginCommand: string
    verifyCommands: string[]
    resetCommands: [string, ...string[]]
    configToml: string
  }
}

type SetupMode = 'desktop' | 'cli'

const config = ref<McpConfig | null>(null)
const pending = ref(true)
const error = ref<Error | null>(null)
const copiedValues = ref<string[]>([])
const setupMode = ref<SetupMode>('desktop')
const toast = useToast()
const { acknowledge: acknowledgeMcpOffering } = useMcpOfferingDiscovery()

const examplePrompt = 'Which EC2 instances in account 123456789012 are not using an approved Golden AMI, who owns them, and what is the remediation path?'

const desktopSteps = [
  { number: '1', title: 'Open settings', description: 'Open Plugins, choose MCP, then Custom.' },
  { number: '2', title: 'Add GHOST', description: 'Paste the URL and name it GHOST.' },
  { number: '3', title: 'Sign in', description: 'Complete the browser authorization.' },
  { number: '4', title: 'Start a task', description: 'Open a new task after GHOST connects.' }
] as const

const cliSteps = [
  { number: '1', title: 'Add GHOST', command: 'add' },
  { number: '2', title: 'Sign in', command: 'login' },
  { number: '3', title: 'Verify', command: 'verify' }
] as const

function cliCommands(command: typeof cliSteps[number]['command']): string[] {
  if (!config.value) return []
  if (command === 'add') return [config.value.codex.addCommand]
  if (command === 'login') return [config.value.codex.loginCommand]
  return config.value.codex.verifyCommands
}

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
  <div class="mcp-page mx-auto max-w-6xl px-4 pb-12 sm:px-6">
    <header class="page-intro">
      <p class="eyebrow">GHOST MCP</p>
      <h1>Connect GHOST to Codex</h1>
      <p>Copy the URL, add it as a custom MCP connection, and sign in.</p>
    </header>

    <main>
      <section class="workflow" aria-label="GHOST MCP setup">
        <div class="workflow-band">
          <div class="band-number">01</div>
          <div class="band-content">
            <div class="band-heading"><div><h2>Copy the MCP URL</h2><p>This is the only value you need from GHOST.</p></div></div>

            <div v-if="pending" class="connection-shell connection-loading" aria-live="polite">
              <div class="connection-inner"><USkeleton class="h-8 w-36" /><USkeleton class="mt-3 h-11 w-full" /></div>
            </div>
            <UAlert v-else-if="error" color="red" variant="soft" title="MCP configuration is unavailable" :description="error.message">
              <template #actions><UButton icon="i-heroicons-arrow-path" color="red" variant="soft" size="xs" @click="refresh">Retry</UButton></template>
            </UAlert>
            <div v-else-if="config" class="connection-shell">
              <div class="connection-inner">
                <div class="connection-meta">
                  <div class="connection-name"><div class="ghost-mark"><img src="/favicon.svg" alt=""></div><div><span>Connection name</span><strong>GHOST</strong></div></div>
                  <div class="connection-status">OAuth enabled</div>
                </div>
                <div class="url-row">
                  <code>{{ config.serverUrl }}</code>
                  <UButton :icon="isCopied(config.serverUrl) ? 'i-heroicons-check' : 'i-heroicons-clipboard'" color="green" class="copy-url" @click="copy(config.serverUrl, 'MCP server URL')">{{ isCopied(config.serverUrl) ? 'Copied' : 'Copy URL' }}</UButton>
                </div>
                <p class="connection-note">Uses your existing GHOST and AWS permissions.</p>
              </div>
            </div>
          </div>
        </div>

        <div class="workflow-band">
          <div class="band-number">02</div>
          <div class="band-content">
            <div class="band-heading band-heading--switch">
              <div><h2>Add it to Codex</h2><p>Choose the Codex experience you use.</p></div>
              <div class="setup-tabs" role="tablist" aria-label="Codex setup method">
                <button :class="{ active: setupMode === 'desktop' }" role="tab" :aria-selected="setupMode === 'desktop'" aria-controls="desktop-panel" @click="setupMode = 'desktop'"><UIcon name="i-heroicons-window" />Desktop app</button>
                <button :class="{ active: setupMode === 'cli' }" role="tab" :aria-selected="setupMode === 'cli'" aria-controls="cli-panel" @click="setupMode = 'cli'"><UIcon name="i-heroicons-command-line" />CLI</button>
              </div>
            </div>

            <div v-if="setupMode === 'desktop'" id="desktop-panel" role="tabpanel">
              <ol class="setup-steps setup-steps--desktop">
                <li v-for="step in desktopSteps" :key="step.number" class="setup-step"><span>{{ step.number }}</span><h3>{{ step.title }}</h3><p>{{ step.description }}</p></li>
              </ol>
            </div>
            <div v-else id="cli-panel" role="tabpanel">
              <ol v-if="config" class="setup-steps setup-steps--cli">
                <li v-for="step in cliSteps" :key="step.number" class="setup-step">
                  <span>{{ step.number }}</span><h3>{{ step.title }}</h3>
                  <div class="command-list"><CommandBlock v-for="command in cliCommands(step.command)" :key="command" class="mcp-command" :value="command" :label="`${step.title} command`" wrap :copied="isCopied(command)" @copy="copy(command, `${step.title} command`)" /></div>
                </li>
              </ol>
              <p v-else class="setup-unavailable">Load the MCP URL before using CLI setup.</p>
            </div>
          </div>
        </div>

        <div class="workflow-band">
          <div class="band-number">03</div>
          <div class="band-content">
            <div class="band-heading"><div><h2>Try it in a new task</h2><p>GHOST is ready when Codex shows the connection as enabled.</p></div></div>
            <div class="question-row">
              <blockquote>{{ examplePrompt }}</blockquote>
              <UButton :icon="isCopied(examplePrompt) ? 'i-heroicons-check' : 'i-heroicons-clipboard'" color="gray" variant="soft" @click="copy(examplePrompt, 'Example prompt')">{{ isCopied(examplePrompt) ? 'Copied' : 'Copy example' }}</UButton>
            </div>
          </div>
        </div>
      </section>

      <section class="source-section" aria-labelledby="sources-heading">
        <header><p class="eyebrow">What is connected</p><h2 id="sources-heading">Three sources, one connection</h2><p>GHOST MCP gathers the context before Codex answers.</p></header>
        <div class="funnel">
          <div class="funnel-stage">
            <div class="source-row">
              <article class="source-card source-card--handbook"><div class="source-logo"><img src="/images/mcp/gdms-cloud-logo.png" alt=""></div><div><strong>Handbook</strong><span>Approved guidance</span><em>What should be deployed?</em></div></article>
              <article class="source-card source-card--aws"><div class="source-logo"><UIcon name="i-simple-icons-amazonaws" /></div><div><strong>Live AWS</strong><span>Current environment</span><em>What is deployed now?</em></div></article>
              <article class="source-card source-card--ghost"><div class="source-logo"><img src="/favicon.svg" alt=""></div><div><strong>GHOST</strong><span>Ownership and access</span><em>Who owns it?</em></div></article>
            </div>
            <div class="feed-row" aria-hidden="true"><span class="feed feed--handbook" /><span class="feed feed--aws" /><span class="feed feed--ghost" /></div>
            <div class="merge-shell">
              <div class="merge-chamber"><div class="merge-field" aria-hidden="true" /><strong>GHOST MCP</strong><span>Combines the context</span></div>
            </div>
            <div class="funnel-neck" aria-hidden="true" />
            <div class="codex-node"><UIcon name="i-simple-icons-openai" /><strong>Codex</strong><span>One grounded answer</span></div>
          </div>
        </div>
      </section>

      <details class="advanced-section">
        <summary><span>Help, capabilities, and manual configuration</span><UIcon name="i-heroicons-chevron-down" /></summary>
        <div class="advanced-links">
          <UButton to="/support/docs?topic=mcp-connections-guide" icon="i-heroicons-lifebuoy" color="gray" variant="ghost">Help and troubleshooting</UButton>
          <UButton to="/chat/mcp/details" icon="i-heroicons-command-line" color="gray" variant="ghost">View capabilities</UButton>
        </div>
        <div v-if="config" class="advanced-content">
          <section><h3>Reconnect GHOST</h3><p class="advanced-copy">Authorizations last 90 days. If Codex reports that reauthentication is required, authenticate the GHOST connection in MCP settings or run these commands.</p><div class="command-list"><CommandBlock :value="config.codex.resetCommands[0]" label="Logout command" wrap :copied="isCopied(config.codex.resetCommands[0])" @copy="copy(config.codex.resetCommands[0], 'Logout command')" /><CommandBlock :value="config.codex.loginCommand" label="Login command" wrap :copied="isCopied(config.codex.loginCommand)" @copy="copy(config.codex.loginCommand, 'Login command')" /></div></section>
          <section><h3>Manual Codex configuration</h3><CommandBlock class="mcp-command mt-3" :value="config.codex.configToml" label="TOML configuration" multiline :copied="isCopied(config.codex.configToml)" @copy="copy(config.codex.configToml, 'TOML configuration')" /></section>
          <section><h3>Connection details</h3><dl class="technical-list"><div><dt>MCP protocol</dt><dd>{{ config.protocolVersion }}</dd></div><div><dt>Authorization server</dt><dd><code>{{ config.authorizationServer }}</code></dd></div></dl></section>
          <section><h3>Sign out or remove GHOST</h3><div class="command-list"><CommandBlock v-for="command in config.codex.resetCommands" :key="command" class="mcp-command" :value="command" label="Reset command" wrap :copied="isCopied(command)" @copy="copy(command, 'Reset command')" /></div></section>
        </div>
      </details>
    </main>
  </div>
</template>

<style scoped>
.mcp-page { --mcp-blue: 82 158 255; --mcp-amber: 244 167 43; --mcp-green: 33 213 156; --mcp-violet: 168 116 242; position: relative; padding-top: 2rem; overflow: hidden; color: var(--ghost-text); }
.mcp-page::before { position: absolute; z-index: -1; inset: 0 -8% auto; height: 28rem; pointer-events: none; content: ''; background: linear-gradient(115deg, transparent 5%, rgb(var(--mcp-blue) / .09) 28%, transparent 44% 58%, rgb(var(--mcp-amber) / .07) 72%, rgb(var(--mcp-green) / .08) 82%, transparent 96%); background-size: 220% 100%; mask-image: linear-gradient(to bottom, black, transparent 88%); animation: page-trace 18s ease-in-out infinite; }
.eyebrow { margin: 0; color: rgb(5 150 105); font-size: .6875rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.page-intro { max-width: 42rem; margin-bottom: 1.5rem; }.page-intro h1 { margin: .3rem 0 0; font-size: clamp(1.9rem, 5vw, 2.75rem); line-height: 1.08; letter-spacing: 0; }.page-intro > p:last-child { margin: .55rem 0 0; color: var(--ghost-text-muted); font-size: .875rem; line-height: 1.55; }
.workflow { overflow: hidden; background: var(--ghost-surface); border: 1px solid var(--ghost-border); border-radius: .5rem; box-shadow: 0 18px 45px rgb(15 23 42 / .1); }
.workflow-band { display: grid; grid-template-columns: 4.875rem minmax(0, 1fr); background: var(--ghost-surface); border-bottom: 1px solid var(--ghost-border); }.workflow-band:nth-child(even) { background: color-mix(in srgb, var(--ghost-surface) 76%, var(--ghost-surface-2)); }.workflow-band:last-child { border-bottom: 0; }
.band-number { display: grid; place-items: start center; padding-top: 1.75rem; color: color-mix(in srgb, var(--ghost-text-muted) 34%, transparent); font-size: 1.625rem; font-weight: 800; border-right: 1px solid var(--ghost-border); }.band-content { min-width: 0; padding: 1.625rem 1.75rem 1.75rem; }.band-heading { margin-bottom: 1rem; }.band-heading--switch { display: flex; align-items: end; justify-content: space-between; gap: 1rem; }.band-heading h2 { margin: 0; font-size: 1.125rem; letter-spacing: 0; }.band-heading p { margin: .25rem 0 0; color: var(--ghost-text-muted); font-size: .6875rem; line-height: 1.4; }
.connection-shell { position: relative; padding: 1px; overflow: hidden; background: conic-gradient(from var(--trace-angle), rgb(var(--mcp-green)), rgb(var(--mcp-blue)), rgb(var(--mcp-violet)), rgb(var(--mcp-amber)), rgb(var(--mcp-green))); border-radius: .4375rem; box-shadow: 0 0 30px rgb(var(--mcp-green) / .1); animation: border-trace 10s linear infinite; }.connection-inner { padding: .95rem; background: rgb(3 11 23); border-radius: .375rem; }.connection-meta { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-bottom: .65rem; }.connection-name { display: flex; gap: .5rem; align-items: center; }.ghost-mark { display: grid; width: 1.9rem; height: 1.9rem; place-items: center; padding: .4rem; background: rgb(var(--mcp-green) / .08); border: 1px solid rgb(var(--mcp-green) / .38); border-radius: .3125rem; box-shadow: 0 0 15px rgb(var(--mcp-green) / .18); }.ghost-mark img { width: 100%; height: 100%; }.connection-name span { color: rgb(148 163 184); font-size: .5625rem; }.connection-name strong { display: block; margin-top: .05rem; color: white; font-size: .75rem; }.connection-status { display: flex; gap: .35rem; align-items: center; color: rgb(184 234 217); font-size: .5625rem; }.connection-status::before { width: .375rem; height: .375rem; content: ''; background: rgb(var(--mcp-green)); border-radius: 50%; box-shadow: 0 0 8px rgb(var(--mcp-green) / .75); }.url-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; overflow: hidden; border: 1px solid rgb(var(--mcp-green) / .48); border-radius: .3125rem; }.url-row code { min-width: 0; padding: .75rem .8rem; color: rgb(226 232 240); font-size: .6875rem; overflow-wrap: anywhere; }.copy-url { border-radius: 0 .25rem .25rem 0 !important; }.connection-note { margin: .55rem 0 0; color: rgb(148 163 184); font-size: .5625rem; }.connection-loading { min-height: 7.5rem; }
.setup-tabs { display: inline-flex; flex: 0 0 auto; padding: .2rem; background: var(--ghost-surface-2); border: 1px solid var(--ghost-border); border-radius: .375rem; }.setup-tabs button { display: flex; gap: .35rem; align-items: center; padding: .45rem .7rem; color: var(--ghost-text-muted); font-size: .625rem; font-weight: 700; background: transparent; border: 0; border-radius: .25rem; cursor: pointer; }.setup-tabs button svg { width: .9rem; height: .9rem; }.setup-tabs button.active { color: rgb(6 95 70); background: var(--ghost-surface); box-shadow: 0 1px 4px rgb(15 23 42 / .15); }:global(.dark) .setup-tabs button.active { color: rgb(186 245 226); background: color-mix(in srgb, var(--ghost-surface-2) 65%, white); }
.setup-steps { display: grid; margin: 0; padding: 0; list-style: none; }.setup-steps--desktop { grid-template-columns: repeat(4, minmax(0, 1fr)); }.setup-steps--cli { grid-template-columns: repeat(3, minmax(0, 1fr)); }.setup-step { min-width: 0; padding: 0 1rem; border-right: 1px solid var(--ghost-border); }.setup-step:first-child { padding-left: 0; }.setup-step:last-child { padding-right: 0; border-right: 0; }.setup-step > span { display: grid; width: 1.4rem; height: 1.4rem; margin-bottom: .5rem; place-items: center; color: rgb(217 119 6); border: 1px solid rgb(var(--mcp-amber) / .42); border-radius: 50%; font-size: .5rem; font-weight: 800; }.setup-step h3 { margin: 0; font-size: .6875rem; }.setup-step p { margin: .25rem 0 0; color: var(--ghost-text-muted); font-size: .5625rem; line-height: 1.45; }.setup-step :deep(.mcp-command) { margin-top: .55rem; }.command-list { display: grid; gap: .5rem; margin-top: .55rem; }.setup-unavailable { color: var(--ghost-text-muted); font-size: .6875rem; }
:deep(.mcp-command) { border-color: transparent !important; background: linear-gradient(rgb(3 11 23), rgb(3 11 23)) padding-box, conic-gradient(from var(--trace-angle), rgb(var(--mcp-blue)), rgb(var(--mcp-green)), rgb(var(--mcp-amber)), rgb(var(--mcp-violet)), rgb(var(--mcp-blue))) border-box !important; animation: border-trace 5s linear infinite; }
.question-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .75rem; align-items: center; }.question-row blockquote { position: relative; margin: 0; padding: .95rem 1rem; overflow: hidden; color: var(--ghost-text); background: var(--ghost-surface-2); border: 1px solid var(--ghost-border); border-radius: .375rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .6875rem; line-height: 1.6; }.question-row blockquote::after { position: absolute; inset: auto 0 0; height: 2px; content: ''; background: linear-gradient(90deg, rgb(var(--mcp-blue)), rgb(var(--mcp-green)), rgb(var(--mcp-amber))); }
.source-section { margin-top: 2rem; }.source-section > header { margin-bottom: .875rem; }.source-section h2 { margin: .2rem 0 0; font-size: 1.125rem; }.source-section header > p:last-child { margin: .3rem 0 0; color: var(--ghost-text-muted); font-size: .625rem; }.funnel { padding: 1.25rem; overflow: hidden; background: var(--ghost-surface); border: 1px solid var(--ghost-border); border-radius: .5rem; }.funnel-stage { width: min(47.5rem, 100%); margin: 0 auto; }
.source-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; }.source-card { --source: var(--mcp-blue); display: grid; min-width: 0; min-height: 7rem; place-items: center; align-content: center; padding: .8rem; text-align: center; background: rgb(var(--source) / .07); border: 1px solid rgb(var(--source) / .4); border-radius: .375rem; animation: source-glow 5s ease-in-out infinite; }.source-card--aws { --source: var(--mcp-amber); animation-delay: -1.7s; }.source-card--ghost { --source: var(--mcp-green); animation-delay: -3.4s; }.source-logo { display: grid; width: 2.25rem; height: 2.25rem; place-items: center; padding: .375rem; color: rgb(15 23 42); background: white; border: 1px solid rgb(var(--source) / .55); border-radius: .3125rem; box-shadow: 0 0 16px rgb(var(--source) / .28); }.source-logo img, .source-logo svg { width: 100%; height: 100%; object-fit: contain; }.source-card strong { display: block; margin-top: .45rem; font-size: .6875rem; }.source-card span { display: block; margin-top: .2rem; color: var(--ghost-text-muted); font-size: .5625rem; }.source-card em { display: block; margin-top: .5rem; color: rgb(var(--source)); font-size: .5625rem; font-style: normal; font-weight: 700; }
.feed-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; height: 2.625rem; }.feed { --feed: var(--mcp-blue); position: relative; width: 2px; height: 100%; margin: 0 auto; overflow: hidden; background: linear-gradient(rgb(var(--feed) / .25), rgb(var(--feed) / .8)); box-shadow: 0 0 8px rgb(var(--feed) / .28); }.feed--aws { --feed: var(--mcp-amber); }.feed--ghost { --feed: var(--mcp-green); }.feed::after { position: absolute; top: -.5rem; left: -2px; width: .375rem; height: .625rem; content: ''; background: rgb(var(--feed)); border-radius: 999px; box-shadow: 0 0 10px rgb(var(--feed) / .8); animation: feed-drop 2.2s linear infinite; }.feed--aws::after { animation-delay: -.75s; }.feed--ghost::after { animation-delay: -1.5s; }
.merge-shell { position: relative; width: 80%; height: 6rem; margin: 0 auto; filter: drop-shadow(0 0 14px rgb(var(--mcp-violet) / .15)); }.merge-shell::before { position: absolute; inset: 0; content: ''; background: radial-gradient(ellipse at 50% 108%, rgb(194 115 255) 0 16%, rgb(102 92 255) 32%, transparent 58%), linear-gradient(90deg, rgb(var(--mcp-blue)) 0%, rgb(90 167 255) 19%, rgb(155 112 239) 34%, rgb(var(--mcp-amber)) 50%, rgb(165 206 104) 67%, rgb(56 210 165) 82%, rgb(var(--mcp-green)) 100%); clip-path: polygon(0 0, 100% 0, 64% 100%, 36% 100%); }.merge-chamber { position: absolute; inset: 1px; display: grid; place-items: center; align-content: center; padding: 1rem 20% 1.4rem; text-align: center; background: rgb(11 23 40); clip-path: polygon(0 0, 100% 0, 64% 100%, 36% 100%); }.merge-field { position: absolute; z-index: 0; inset: -1.75rem; background: radial-gradient(ellipse 34% 145% at 13% -6%, rgb(44 145 255 / .98) 0 20%, rgb(74 118 255 / .68) 40%, transparent 72%), radial-gradient(ellipse 36% 150% at 50% -8%, rgb(255 176 35 / .96) 0 18%, rgb(225 91 196 / .54) 44%, transparent 72%), radial-gradient(ellipse 34% 145% at 87% -6%, rgb(20 231 165 / .94) 0 20%, rgb(22 178 205 / .62) 42%, transparent 72%), radial-gradient(ellipse 62% 70% at 50% 92%, rgb(193 77 255 / .92) 0 20%, rgb(82 92 255 / .72) 45%, transparent 76%); filter: blur(22px) saturate(1.55) brightness(1.12); transform: translateZ(0); animation: field-breathe 5.5s ease-in-out infinite; }.merge-chamber::after { position: absolute; z-index: 1; inset: 0; content: ''; background: radial-gradient(ellipse at 50% 108%, rgb(204 90 255 / .42), transparent 50%), linear-gradient(100deg, transparent 18%, rgb(255 255 255 / .04) 48%, transparent 72%); background-size: 100% 100%, 220% 100%; animation: merge-scan 5.5s ease-in-out infinite; }.merge-chamber strong { position: relative; z-index: 2; color: white; font-size: .9375rem; text-shadow: 0 1px 8px rgb(0 0 0 / .7); }.merge-chamber > span { position: relative; z-index: 2; margin-top: .25rem; color: rgb(176 189 208); font-size: .5625rem; text-shadow: 0 1px 6px rgb(0 0 0 / .75); }
.funnel-neck { position: relative; width: .375rem; height: 2.125rem; margin: 0 auto; background: linear-gradient(90deg, rgb(var(--mcp-blue)), rgb(var(--mcp-violet)) 48%, rgb(var(--mcp-green))); box-shadow: 0 0 10px rgb(var(--mcp-violet) / .6); }.funnel-neck::before { position: absolute; top: -.25rem; left: -.125rem; width: .625rem; height: .625rem; content: ''; background: rgb(var(--mcp-violet)); border-radius: 50%; box-shadow: 0 0 12px rgb(var(--mcp-violet) / .8); animation: neck-drop 1.8s linear infinite; }.funnel-neck::after { position: absolute; right: 50%; bottom: 0; width: .5rem; height: .5rem; content: ''; border-right: 2px solid rgb(var(--mcp-violet)); border-bottom: 2px solid rgb(var(--mcp-violet)); transform: translateX(50%) rotate(45deg); }.codex-node { display: grid; width: min(13.75rem, 100%); min-height: 4rem; margin: 0 auto; place-items: center; align-content: center; text-align: center; background: linear-gradient(var(--ghost-surface-2), var(--ghost-surface-2)) padding-box, linear-gradient(90deg, rgb(var(--mcp-blue)), rgb(var(--mcp-violet)), rgb(var(--mcp-green))) border-box; border: 1px solid transparent; border-radius: .375rem; box-shadow: 0 0 22px rgb(var(--mcp-violet) / .14); }.codex-node svg { width: 1rem; height: 1rem; margin-bottom: .25rem; }.codex-node strong { font-size: .75rem; }.codex-node span { margin-top: .2rem; color: var(--ghost-text-muted); font-size: .5rem; }
.advanced-section { margin-top: 1.125rem; border-top: 1px solid var(--ghost-border); border-bottom: 1px solid var(--ghost-border); }.advanced-section summary { display: flex; align-items: center; justify-content: space-between; padding: .85rem 0; font-size: .6875rem; font-weight: 700; cursor: pointer; list-style: none; }.advanced-section summary::-webkit-details-marker { display: none; }.advanced-section summary svg { width: 1rem; height: 1rem; transition: transform 180ms ease; }.advanced-section[open] summary svg { transform: rotate(180deg); }.advanced-links { display: flex; flex-wrap: wrap; gap: .4rem; padding-bottom: .75rem; }.advanced-content { display: grid; gap: 1.5rem; padding: .25rem 0 1rem; }.advanced-content h3 { margin: 0; font-size: .75rem; }.advanced-copy { margin: .35rem 0 0; color: var(--ghost-text-muted); font-size: .6875rem; line-height: 1.5; }.technical-list { margin-top: .55rem; border-top: 1px solid var(--ghost-border); }.technical-list > div { display: grid; grid-template-columns: 9rem minmax(0, 1fr); gap: .75rem; padding: .55rem 0; border-bottom: 1px solid var(--ghost-border); font-size: .6875rem; }.technical-list dt { color: var(--ghost-text-muted); }.technical-list dd { min-width: 0; margin: 0; }.technical-list code { overflow-wrap: anywhere; }
@property --trace-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes border-trace { to { --trace-angle: 360deg; } }
@keyframes page-trace { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@keyframes source-glow { 0%, 100% { box-shadow: 0 0 14px rgb(var(--source) / .07); } 50% { box-shadow: 0 0 22px rgb(var(--source) / .18); } }
@keyframes feed-drop { from { transform: translateY(0); } to { transform: translateY(3.25rem); } }
@keyframes merge-scan { 0%, 100% { background-position: 0 50%; } 50% { background-position: 100% 50%; } }
@keyframes field-breathe { 0%, 100% { opacity: .86; transform: scaleX(.98) translateY(0); } 50% { opacity: 1; transform: scaleX(1.04) translateY(2px); } }
@keyframes neck-drop { from { transform: translateY(0); } to { transform: translateY(2rem); } }
@media (max-width: 800px) { .workflow-band { grid-template-columns: 3rem minmax(0, 1fr); }.band-number { padding-top: 1.35rem; font-size: 1.25rem; }.band-content { padding: 1.3rem 1.1rem 1.4rem; }.setup-steps--desktop, .setup-steps--cli { grid-template-columns: repeat(2, minmax(0, 1fr)); }.setup-step { padding: .75rem; border-bottom: 1px solid var(--ghost-border); }.setup-step:nth-child(odd) { padding-left: 0; }.setup-step:nth-child(even) { padding-right: 0; border-right: 0; }.source-row { grid-template-columns: 1fr; }.source-card { grid-template-columns: 2.25rem minmax(0, 1fr); min-height: auto; text-align: left; }.source-card strong { margin-top: 0; }.source-card em { grid-column: 2; margin-top: .15rem; }.feed-row { display: block; height: 2rem; }.feed { height: 2rem; }.feed-row .feed:not(:first-child) { display: none; }.merge-shell { width: 100%; } }
@media (max-width: 540px) { .mcp-page { padding-top: 1.25rem; }.workflow-band { display: block; }.band-number { display: none; }.band-content { padding: 1.15rem .9rem 1.25rem; }.band-heading--switch { align-items: flex-start; flex-direction: column; }.setup-tabs { width: 100%; }.setup-tabs button { flex: 1; justify-content: center; }.url-row { grid-template-columns: 1fr; }.copy-url { width: 100%; justify-content: center; border-radius: 0 0 .25rem .25rem !important; }.setup-steps--desktop, .setup-steps--cli { grid-template-columns: 1fr; }.setup-step, .setup-step:nth-child(odd), .setup-step:nth-child(even) { padding: .75rem 0; border-right: 0; }.question-row { grid-template-columns: 1fr; }.question-row :deep(button) { width: 100%; justify-content: center; }.funnel { padding: .9rem; }.merge-shell { height: 5.875rem; }.merge-chamber { padding-right: 16%; padding-left: 16%; }.technical-list > div { grid-template-columns: 1fr; gap: .2rem; } }
@media (prefers-reduced-motion: reduce) { .mcp-page::before, .connection-shell, :deep(.mcp-command), .source-card, .feed::after, .merge-field, .merge-chamber::after, .funnel-neck::before { animation: none; transition: none; } }
</style>
