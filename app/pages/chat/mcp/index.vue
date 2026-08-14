<script setup lang="ts">
definePageMeta({
  title: 'MCP Connections',
  description: 'Connect your AI client to GHOST MCP'
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

type SetupMode = 'desktop' | 'cli'

interface SourceDefinition {
  id: 'handbook' | 'aws' | 'ghost'
  label: string
  shortLabel: string
  description: string
  example: string
  image?: string
  icon?: string
}

const config = ref<McpConfig | null>(null)
const pending = ref(true)
const error = ref<Error | null>(null)
const copiedValues = ref<string[]>([])
const setupMode = ref<SetupMode>('desktop')
const toast = useToast()
const { acknowledge: acknowledgeMcpOffering } = useMcpOfferingDiscovery()

const sources: SourceDefinition[] = [
  {
    id: 'handbook',
    label: 'GDMS AWS Operations Handbook',
    shortLabel: 'Handbook',
    description: 'Approved offerings, standards, architecture, and operational guidance.',
    example: 'What is the approved GDMS pattern for external collaboration in AWS?',
    image: '/images/mcp/gdms-cloud-logo.png'
  },
  {
    id: 'aws',
    label: 'Live AWS',
    shortLabel: 'AWS',
    description: 'Resources, costs, security findings, compliance, and recent activity.',
    example: 'What changed in account 123456789012 during the last 7 days?',
    icon: 'i-simple-icons-amazonaws'
  },
  {
    id: 'ghost',
    label: 'GHOST platform',
    shortLabel: 'GHOST',
    description: 'Account pairings, ownership, access, budgets, pipelines, and reports.',
    example: 'Find Project Atlas and summarize its account IDs, owners, access, and status.',
    image: '/favicon.svg'
  }
]

const combinedPrompt = 'Which EC2 instances in account 123456789012 are not using an approved Golden AMI, who owns them, and what is the remediation path?'

const sourceContributions = [
  { source: 'Handbook', className: 'handbook', detail: 'Finds the approved images and documented remediation guidance.' },
  { source: 'AWS', className: 'aws', detail: 'Checks the live instance inventory and current deployment state.' },
  { source: 'GHOST', className: 'ghost', detail: 'Resolves account ownership, access, and relevant pipeline context.' }
] as const

const desktopSteps = [
  { number: '01', title: 'Open Custom MCP', description: 'In Codex, open Settings, select Plugins, choose MCP, then open Custom.' },
  { number: '02', title: 'Add the connection', description: 'Use the name GHOST and paste the MCP server URL shown above.' },
  { number: '03', title: 'Authorize GHOST', description: 'Save the connection and complete your normal GHOST sign-in when prompted.' },
  { number: '04', title: 'Start a new task', description: 'Confirm GHOST is connected, then open a new Codex task.' }
] as const

const cliSteps = [
  { number: '01', title: 'Add GHOST', description: 'Register the remote GHOST MCP server in Codex.', command: 'addCommand' },
  { number: '02', title: 'Sign in', description: 'Open the browser flow and authenticate with your Entra ID.', command: 'loginCommand' },
  { number: '03', title: 'Verify the connection', description: 'Confirm GHOST is enabled and available to new Codex tasks.', command: undefined }
] as const

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
  <div class="mcp-page mx-auto max-w-7xl px-4 pb-12 sm:px-6">
    <header class="mcp-hero" aria-labelledby="mcp-title">
      <div class="hero-copy">
        <p class="mcp-kicker">GHOST MCP</p>
        <h1 id="mcp-title">One connection to your AWS context</h1>
        <p class="hero-intro">
          Ask Codex or another compatible MCP client questions across the GDMS AWS Operations Handbook,
          live AWS services, and GHOST without switching systems or rebuilding the context yourself.
        </p>
        <div class="hero-actions">
          <UButton to="#connect-ghost" icon="i-heroicons-link" color="green">Connect GHOST</UButton>
          <UButton to="/chat/mcp/details" icon="i-heroicons-command-line" color="gray" variant="ghost">View capabilities</UButton>
        </div>
        <ul class="hero-benefits" aria-label="GHOST MCP benefits">
          <li><UIcon name="i-heroicons-arrows-right-left" />Less tab switching</li>
          <li><UIcon name="i-heroicons-check-badge" />Official guidance plus live state</li>
          <li><UIcon name="i-heroicons-shield-check" />Your existing permissions</li>
        </ul>
      </div>

      <div class="source-flow" aria-label="The Handbook, AWS, and GHOST combine through GHOST MCP for Codex and compatible clients">
        <div class="source-grid">
          <article v-for="source in sources" :key="source.id" class="source-node" :class="`source-node--${source.id}`">
            <div class="source-logo">
              <img v-if="source.image" :src="source.image" alt="">
              <UIcon v-else :name="source.icon" />
            </div>
            <div class="min-w-0">
              <p>{{ source.shortLabel }}</p>
              <span>{{ source.description }}</span>
            </div>
          </article>
        </div>
        <div class="flow-trace" aria-hidden="true"><span /></div>
        <div class="mcp-hub">
          <div class="mcp-hub-core"><UIcon name="i-heroicons-link" /><strong>GHOST MCP</strong><span>One trusted context</span></div>
        </div>
        <div class="flow-trace flow-trace--out" aria-hidden="true"><span /></div>
        <div class="client-node">
          <UIcon name="i-simple-icons-openai" />
          <strong>Codex</strong>
          <span>and compatible clients</span>
        </div>
      </div>
    </header>

    <main>
      <section class="mcp-section scenario-section" aria-labelledby="scenario-heading">
        <div class="section-heading">
          <p class="mcp-kicker">Why use it</p>
          <h2 id="scenario-heading">Ask across systems, not one at a time</h2>
          <p>GHOST MCP brings the right sources together for questions that normally require several tools and handoffs.</p>
        </div>

        <div class="scenario-grid">
          <article class="combined-question">
            <div class="question-heading">
              <div><span>Combined example</span><h3>One question, grounded across three sources</h3></div>
              <UTooltip :text="isCopied(combinedPrompt) ? 'Prompt copied' : 'Copy combined prompt'">
                <UButton :icon="isCopied(combinedPrompt) ? 'i-heroicons-check' : 'i-heroicons-clipboard'" color="gray" variant="ghost" square size="xs" @click="copy(combinedPrompt, 'Combined prompt')" />
              </UTooltip>
            </div>
            <blockquote>{{ combinedPrompt }}</blockquote>
            <div class="source-tags" aria-label="Sources used">
              <span class="source-tag source-tag--handbook">Handbook</span>
              <span class="source-tag source-tag--aws">AWS</span>
              <span class="source-tag source-tag--ghost">GHOST</span>
            </div>
          </article>

          <div class="answer-path" aria-label="How GHOST builds the answer">
            <div v-for="item in sourceContributions" :key="item.source" class="answer-step">
              <span class="answer-marker" :class="`answer-marker--${item.className}`" />
              <div><strong>{{ item.source }}</strong><p>{{ item.detail }}</p></div>
            </div>
            <div class="answer-outcome"><UIcon name="i-heroicons-sparkles" /><span>A single answer with evidence and a practical next step.</span></div>
          </div>
        </div>

        <div class="source-examples">
          <article v-for="source in sources" :key="`${source.id}-example`" class="source-example" :class="`source-example--${source.id}`">
            <div class="example-label"><span>{{ source.shortLabel }}</span><UTooltip :text="isCopied(source.example) ? 'Prompt copied' : `Copy ${source.shortLabel} prompt`"><UButton :icon="isCopied(source.example) ? 'i-heroicons-check' : 'i-heroicons-clipboard'" color="gray" variant="ghost" square size="xs" @click="copy(source.example, `${source.shortLabel} prompt`)" /></UTooltip></div>
            <p>{{ source.example }}</p>
          </article>
        </div>
      </section>

      <section id="connect-ghost" class="mcp-section connection-section" aria-labelledby="connect-heading">
        <div class="section-heading section-heading--actions">
          <div><p class="mcp-kicker">Connection</p><h2 id="connect-heading">Add GHOST to your AI client</h2><p>Use this remote MCP endpoint in any compatible client that supports OAuth.</p></div>
          <div class="section-actions"><UButton to="/support/docs?topic=mcp-connections-guide" icon="i-heroicons-lifebuoy" color="gray" variant="ghost" size="xs">Help and troubleshooting</UButton></div>
        </div>

        <div class="connection-tool">
          <div class="connection-identity">
            <div class="connection-icon"><img src="/favicon.svg" alt=""></div>
            <div><span>Connection name</span><strong>GHOST</strong><p>Remote MCP with browser-based GHOST sign-in</p></div>
          </div>

          <div v-if="pending" class="connection-loading" aria-live="polite">
            <USkeleton class="h-3 w-32" />
            <USkeleton class="mt-3 h-11 w-full" />
          </div>
          <UAlert v-else-if="error" color="red" variant="soft" title="MCP configuration is unavailable" :description="error.message">
            <template #actions><UButton icon="i-heroicons-arrow-path" color="red" variant="soft" size="xs" @click="refresh">Retry</UButton></template>
          </UAlert>
          <div v-else-if="config" class="connection-url">
            <span>MCP server URL</span>
            <CommandBlock class="mcp-command mt-2" :value="config.serverUrl" label="GHOST server URL" wrap :copied="isCopied(config.serverUrl)" @copy="copy(config.serverUrl, 'GHOST server URL')" />
          </div>

          <div class="connection-facts">
            <span><UIcon name="i-heroicons-globe-alt" />Remote MCP</span>
            <span><UIcon name="i-heroicons-key" />OAuth sign-in</span>
            <span><UIcon name="i-heroicons-shield-check" />Existing access only</span>
          </div>
        </div>

        <section v-if="config" class="codex-setup" aria-labelledby="codex-heading">
          <div class="codex-heading">
            <div><h3 id="codex-heading">Set up Codex</h3><p>Choose the Codex experience you use on this computer.</p></div>
            <div class="setup-switch" role="tablist" aria-label="Codex setup method">
              <button :class="{ active: setupMode === 'desktop' }" role="tab" :aria-selected="setupMode === 'desktop'" aria-controls="desktop-setup" @click="setupMode = 'desktop'"><UIcon name="i-heroicons-window" />Desktop app</button>
              <button :class="{ active: setupMode === 'cli' }" role="tab" :aria-selected="setupMode === 'cli'" aria-controls="cli-setup" @click="setupMode = 'cli'"><UIcon name="i-heroicons-command-line" />CLI</button>
            </div>
          </div>

          <div v-if="setupMode === 'desktop'" id="desktop-setup" role="tabpanel" class="setup-panel">
            <ol class="setup-list">
              <li v-for="step in desktopSteps" :key="`desktop-${step.number}`" class="setup-step">
                <span class="step-number">{{ step.number }}</span><div><h4>{{ step.title }}</h4><p>{{ step.description }}</p></div>
              </li>
            </ol>
          </div>

          <div v-else id="cli-setup" role="tabpanel" class="setup-panel">
            <ol class="setup-list">
              <li v-for="step in cliSteps" :key="`cli-${step.number}`" class="setup-step">
                <span class="step-number">{{ step.number }}</span>
                <div class="min-w-0">
                  <h4>{{ step.title }}</h4><p>{{ step.description }}</p>
                  <CommandBlock v-if="step.command" class="mcp-command mt-4" :value="config.codex[step.command]" :label="`${step.title} command`" wrap :copied="isCopied(config.codex[step.command])" @copy="copy(config.codex[step.command], `${step.title} command`)" />
                  <div v-else class="mt-4 space-y-3"><CommandBlock v-for="command in config.codex.verifyCommands" :key="command" class="mcp-command" :value="command" label="Verify command" wrap :copied="isCopied(command)" @copy="copy(command, 'Verify command')" /></div>
                  <div v-if="step.command === 'loginCommand'" class="reauth-note"><UIcon name="i-heroicons-exclamation-triangle" /><span>If Codex reports "failed to reauthenticate" or "not logged in," close Codex, run the login command again, then reopen it.</span></div>
                </div>
              </li>
            </ol>
          </div>

          <div class="permission-note"><UIcon name="i-heroicons-shield-check" /><span>Connecting GHOST does not grant additional AWS accounts or roles. Sensitive credential requests still require explicit confirmation.</span></div>
        </section>

        <details v-if="config" class="advanced-section">
          <summary><span>Manual configuration and maintenance</span><UIcon name="i-heroicons-chevron-down" /></summary>
          <div class="advanced-content">
            <section><h3>Manual Codex configuration</h3><p>For managed Codex settings, use the equivalent TOML configuration.</p><CommandBlock class="mcp-command mt-3" :value="config.codex.configToml" label="TOML configuration" multiline :copied="isCopied(config.codex.configToml)" @copy="copy(config.codex.configToml, 'TOML configuration')" /></section>
            <section><h3>Connection details</h3><dl class="technical-list"><div><dt>Server URL</dt><dd><code>{{ config.serverUrl }}</code><UTooltip text="Copy server URL"><UButton icon="i-heroicons-clipboard" color="gray" variant="ghost" square size="xs" @click="copy(config.serverUrl, 'Server URL')" /></UTooltip></dd></div><div><dt>MCP protocol</dt><dd>{{ config.protocolVersion }}</dd></div><div><dt>Authorization server</dt><dd><code>{{ config.authorizationServer }}</code></dd></div></dl></section>
            <section><h3>Sign out or remove GHOST</h3><div class="mt-3 space-y-3"><CommandBlock v-for="command in config.codex.resetCommands" :key="command" class="mcp-command" :value="command" label="Reset command" wrap :copied="isCopied(command)" @copy="copy(command, 'Reset command')" /></div></section>
          </div>
        </details>
      </section>
    </main>
  </div>
</template>

<style scoped>
.mcp-page { position: relative; isolation: isolate; padding-top: 1.5rem; overflow: hidden; color: var(--ghost-text); }
.mcp-page::before { position: absolute; z-index: -2; inset: 0 -8% auto; height: 34rem; pointer-events: none; content: ''; background: linear-gradient(115deg, transparent 4%, rgb(59 130 246 / .12) 27%, transparent 42% 55%, rgb(245 158 11 / .1) 68%, rgb(16 185 129 / .1) 78%, transparent 94%); background-size: 220% 100%; mask-image: linear-gradient(to bottom, black, transparent 88%); animation: page-trace 18s ease-in-out infinite; }
.mcp-kicker { margin: 0; color: rgb(5 150 105); font-size: .6875rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.mcp-hero { position: relative; padding: clamp(1.4rem, 3vw, 2.25rem); overflow: hidden; background: linear-gradient(var(--ghost-surface), var(--ghost-surface)) padding-box, conic-gradient(from var(--trace-angle), rgb(59 130 246 / .85), rgb(16 185 129 / .85), rgb(245 158 11 / .8), rgb(168 85 247 / .8), rgb(59 130 246 / .85)) border-box; border: 1px solid transparent; border-radius: .5rem; box-shadow: 0 14px 38px rgb(15 23 42 / .12); animation: border-trace 16s linear infinite; }
.mcp-hero::after { position: absolute; inset: 0; pointer-events: none; content: ''; background: linear-gradient(100deg, transparent 15%, rgb(255 255 255 / .05) 44%, transparent 67%); background-size: 240% 100%; animation: hero-scan 10s ease-in-out infinite; }
.hero-copy { position: relative; z-index: 1; max-width: 52rem; }
.hero-copy h1 { margin: .3rem 0 0; font-size: clamp(1.8rem, 4vw, 2.75rem); font-weight: 750; line-height: 1.08; letter-spacing: 0; }
.hero-intro { max-width: 49rem; margin: .85rem 0 0; color: var(--ghost-text-muted); font-size: .9375rem; line-height: 1.7; }
.hero-actions { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: 1.25rem; }
.hero-benefits { display: flex; flex-wrap: wrap; gap: .55rem 1.25rem; margin: 1.25rem 0 0; padding: 0; color: var(--ghost-text-muted); font-size: .75rem; list-style: none; }
.hero-benefits li { display: flex; align-items: center; gap: .4rem; }.hero-benefits svg { width: 1rem; height: 1rem; color: rgb(5 150 105); }
.source-flow { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1.8fr) 3.5rem minmax(8rem, .6fr) 3.5rem minmax(8rem, .6fr); gap: .75rem; align-items: center; margin-top: 2rem; }
.source-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .65rem; }
.source-node { --source-rgb: 59 130 246; display: flex; min-width: 0; min-height: 6rem; gap: .7rem; align-items: center; padding: .8rem; background: color-mix(in srgb, var(--ghost-surface-2) 90%, rgb(var(--source-rgb))); border: 1px solid rgb(var(--source-rgb) / .42); border-radius: .375rem; box-shadow: 0 0 18px rgb(var(--source-rgb) / .1); animation: source-breathe 5.5s ease-in-out infinite; }
.source-node--aws { --source-rgb: 245 158 11; animation-delay: -1.8s; }.source-node--ghost { --source-rgb: 16 185 129; animation-delay: -3.6s; }
.source-logo { display: grid; width: 2.65rem; height: 2.65rem; flex: 0 0 auto; place-items: center; padding: .42rem; background: rgb(255 255 255 / .92); border: 1px solid rgb(var(--source-rgb) / .5); border-radius: .375rem; box-shadow: 0 0 16px rgb(var(--source-rgb) / .28); animation: logo-pulse 3.8s ease-in-out infinite; }
.source-node--aws .source-logo { animation-delay: -1.2s; }.source-node--ghost .source-logo { animation-delay: -2.4s; }
.source-logo img, .source-logo svg { width: 100%; height: 100%; object-fit: contain; }.source-node--aws .source-logo svg { color: #111827; }
.source-node p { margin: 0; font-size: .8125rem; font-weight: 800; }.source-node span { display: block; margin-top: .2rem; color: var(--ghost-text-muted); font-size: .6875rem; line-height: 1.4; }
.flow-trace { position: relative; height: 2px; overflow: hidden; background: var(--ghost-border); }.flow-trace::after { position: absolute; inset: 0; content: ''; background: linear-gradient(90deg, transparent, rgb(59 130 246), rgb(16 185 129), transparent); background-size: 200% 100%; animation: flow-forward 2.4s linear infinite; }.flow-trace span::after { position: absolute; top: 50%; right: 0; width: .45rem; height: .45rem; content: ''; border-top: 2px solid rgb(16 185 129); border-right: 2px solid rgb(16 185 129); transform: translateY(-50%) rotate(45deg); }
.flow-trace--out::after { background: linear-gradient(90deg, transparent, rgb(168 85 247), rgb(59 130 246), transparent); background-size: 200% 100%; }.flow-trace--out span::after { border-color: rgb(59 130 246); }
.mcp-hub { position: relative; padding: 1px; background: conic-gradient(from var(--trace-angle), rgb(59 130 246), rgb(16 185 129), rgb(245 158 11), rgb(168 85 247), rgb(59 130 246)); border-radius: .5rem; box-shadow: 0 0 26px rgb(99 102 241 / .28); animation: border-trace 6s linear infinite, hub-glow 4s ease-in-out infinite; }
.mcp-hub-core { display: grid; min-height: 6.5rem; place-items: center; align-content: center; padding: .75rem; text-align: center; background: var(--ghost-surface); border-radius: calc(.5rem - 1px); }.mcp-hub-core svg { width: 1.4rem; height: 1.4rem; color: rgb(16 185 129); }.mcp-hub-core strong { margin-top: .35rem; font-size: .8125rem; }.mcp-hub-core span, .client-node span { margin-top: .2rem; color: var(--ghost-text-muted); font-size: .625rem; line-height: 1.35; }
.client-node { display: grid; min-height: 6.5rem; place-items: center; align-content: center; padding: .75rem; text-align: center; background: var(--ghost-surface-2); border: 1px solid color-mix(in srgb, var(--ghost-border) 62%, rgb(59 130 246)); border-radius: .5rem; box-shadow: 0 0 22px rgb(59 130 246 / .13); }.client-node svg { width: 1.45rem; height: 1.45rem; }.client-node strong { margin-top: .35rem; font-size: .8125rem; }
.mcp-section { padding: clamp(2.5rem, 6vw, 4.5rem) clamp(.25rem, 1vw, .75rem) 0; }.section-heading { max-width: 48rem; }.section-heading h2 { margin: .25rem 0 0; font-size: clamp(1.3rem, 2.5vw, 1.75rem); font-weight: 750; line-height: 1.25; letter-spacing: 0; }.section-heading > p:last-child, .section-heading > div > p:last-child { margin: .55rem 0 0; color: var(--ghost-text-muted); font-size: .8125rem; line-height: 1.6; }
.section-heading--actions { display: flex; max-width: none; align-items: end; justify-content: space-between; gap: 1rem; }.section-actions { flex: 0 0 auto; }
.scenario-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(18rem, .85fr); gap: 1.5rem; margin-top: 1.5rem; }
.combined-question { position: relative; padding: 1.25rem; overflow: hidden; background: linear-gradient(var(--ghost-surface-2), var(--ghost-surface-2)) padding-box, linear-gradient(120deg, rgb(59 130 246 / .75), rgb(16 185 129 / .75), rgb(245 158 11 / .7)) border-box; border: 1px solid transparent; border-radius: .5rem; box-shadow: 0 8px 24px rgb(15 23 42 / .07); }.combined-question::after { position: absolute; inset: auto -20% 0; height: 2px; content: ''; background: linear-gradient(90deg, transparent, rgb(59 130 246), rgb(16 185 129), rgb(245 158 11), transparent); animation: flow-forward 4s linear infinite; }
.question-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }.question-heading span { color: rgb(5 150 105); font-size: .625rem; font-weight: 800; text-transform: uppercase; }.question-heading h3 { margin: .25rem 0 0; font-size: .9375rem; }.combined-question blockquote { margin: 1.15rem 0 0; color: var(--ghost-text); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .875rem; line-height: 1.65; }
.source-tags { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: 1.15rem; }.source-tag { padding: .2rem .5rem; border-radius: .25rem; font-size: .625rem; font-weight: 800; }.source-tag--handbook { color: rgb(30 64 175); background: rgb(219 234 254); }.source-tag--aws { color: rgb(146 64 14); background: rgb(254 243 199); }.source-tag--ghost { color: rgb(6 95 70); background: rgb(209 250 229); }
.answer-path { display: grid; align-content: center; }.answer-step { display: grid; grid-template-columns: .75rem minmax(0, 1fr); gap: .75rem; padding: .75rem 0; border-bottom: 1px solid var(--ghost-border); }.answer-marker { width: .65rem; height: .65rem; margin-top: .2rem; background: rgb(59 130 246); border-radius: 50%; box-shadow: 0 0 10px rgb(59 130 246 / .55); }.answer-marker--aws { background: rgb(245 158 11); box-shadow: 0 0 10px rgb(245 158 11 / .55); }.answer-marker--ghost { background: rgb(16 185 129); box-shadow: 0 0 10px rgb(16 185 129 / .55); }.answer-step strong { font-size: .75rem; }.answer-step p { margin: .2rem 0 0; color: var(--ghost-text-muted); font-size: .75rem; line-height: 1.5; }.answer-outcome { display: flex; gap: .55rem; align-items: center; margin-top: .85rem; color: rgb(5 150 105); font-size: .75rem; font-weight: 700; }.answer-outcome svg { width: 1rem; height: 1rem; }
.source-examples { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .65rem; margin-top: 1.25rem; }.source-example { --source-rgb: 59 130 246; padding: .8rem 1rem; background: var(--ghost-surface-2); border: 1px solid rgb(var(--source-rgb) / .35); border-radius: .375rem; transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease; }.source-example--aws { --source-rgb: 245 158 11; }.source-example--ghost { --source-rgb: 16 185 129; }.source-example:hover { border-color: rgb(var(--source-rgb) / .7); box-shadow: 0 0 18px rgb(var(--source-rgb) / .12); transform: translateY(-2px); }.example-label { display: flex; align-items: center; justify-content: space-between; gap: .5rem; }.example-label > span { color: rgb(var(--source-rgb)); font-size: .6875rem; font-weight: 800; text-transform: uppercase; }.source-example p { margin: .45rem 0 0; color: var(--ghost-text-muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .6875rem; line-height: 1.5; }
.connection-section { scroll-margin-top: 5rem; }.connection-tool { margin-top: 1.5rem; padding: 1.25rem; background: linear-gradient(var(--ghost-surface), var(--ghost-surface)) padding-box, conic-gradient(from var(--trace-angle), rgb(16 185 129), rgb(59 130 246), rgb(168 85 247), rgb(245 158 11), rgb(16 185 129)) border-box; border: 1px solid transparent; border-radius: .5rem; box-shadow: 0 10px 30px rgb(15 23 42 / .08), 0 0 26px rgb(16 185 129 / .08); animation: border-trace 12s linear infinite; }.connection-identity { display: flex; gap: .75rem; align-items: center; }.connection-icon { display: grid; width: 2.7rem; height: 2.7rem; place-items: center; padding: .55rem; background: color-mix(in srgb, var(--ghost-surface-2) 80%, rgb(16 185 129)); border: 1px solid rgb(16 185 129 / .4); border-radius: .375rem; box-shadow: 0 0 16px rgb(16 185 129 / .18); }.connection-icon img { width: 100%; height: 100%; }.connection-identity span, .connection-url > span { display: block; color: var(--ghost-text-muted); font-size: .6875rem; }.connection-identity strong { display: block; margin-top: .05rem; font-size: .9375rem; }.connection-identity p { margin: .1rem 0 0; color: var(--ghost-text-muted); font-size: .6875rem; }.connection-url, .connection-loading { margin-top: 1.25rem; }.connection-facts { display: flex; flex-wrap: wrap; gap: .5rem 1.25rem; margin-top: 1rem; color: var(--ghost-text-muted); font-size: .6875rem; }.connection-facts span { display: flex; align-items: center; gap: .35rem; }.connection-facts svg { width: .9rem; height: .9rem; color: rgb(5 150 105); }
:deep(.mcp-command) { border-color: transparent !important; background: linear-gradient(rgb(3 11 23), rgb(3 11 23)) padding-box, conic-gradient(from var(--trace-angle), rgb(59 130 246), rgb(16 185 129), rgb(245 158 11), rgb(168 85 247), rgb(59 130 246)) border-box !important; animation: border-trace 5s linear infinite; }
.codex-setup { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--ghost-border); }.codex-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }.codex-heading h3 { margin: 0; font-size: 1rem; }.codex-heading p { margin: .25rem 0 0; color: var(--ghost-text-muted); font-size: .75rem; }.setup-switch { display: inline-flex; flex: 0 0 auto; padding: .2rem; background: var(--ghost-surface-2); border: 1px solid var(--ghost-border); border-radius: .375rem; }.setup-switch button { display: flex; gap: .4rem; align-items: center; padding: .45rem .7rem; color: var(--ghost-text-muted); font-size: .75rem; font-weight: 700; background: transparent; border: 0; border-radius: .25rem; cursor: pointer; }.setup-switch button svg { width: 1rem; height: 1rem; }.setup-switch button.active { color: rgb(6 95 70); background: var(--ghost-surface); box-shadow: 0 1px 3px rgb(15 23 42 / .12); }:global(.dark) .setup-switch button.active { color: rgb(110 231 183); }
.setup-panel { margin-top: 2rem; }.setup-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; padding: 0; list-style: none; }.setup-step { display: grid; grid-template-columns: 2rem minmax(0, 1fr); gap: .75rem; min-width: 0; padding: 1rem; border-bottom: 1px solid var(--ghost-border); }.setup-step:nth-child(odd) { padding-left: 0; padding-right: 1.5rem; border-right: 1px solid var(--ghost-border); }.setup-step:nth-child(even) { padding-right: 0; padding-left: 1.5rem; }.step-number { display: grid; width: 1.55rem; height: 1.55rem; place-items: center; color: rgb(217 119 6); font-size: .6rem; font-weight: 800; border: 1px solid color-mix(in srgb, var(--ghost-border) 65%, rgb(245 158 11)); border-radius: 999px; }.setup-step h4 { margin: 0; font-size: .8125rem; }.setup-step p { margin: .25rem 0 0; color: var(--ghost-text-muted); font-size: .75rem; line-height: 1.5; }.permission-note, .reauth-note { display: flex; gap: .5rem; margin-top: 1rem; padding: .7rem .8rem; font-size: .75rem; line-height: 1.5; }.permission-note { color: color-mix(in srgb, var(--ghost-text) 45%, rgb(16 185 129)); background: color-mix(in srgb, var(--ghost-surface-2) 90%, rgb(16 185 129)); border-left: 3px solid rgb(16 185 129); }.permission-note svg, .reauth-note svg { width: 1rem; height: 1rem; flex: 0 0 auto; margin-top: .1rem; }.reauth-note { color: color-mix(in srgb, var(--ghost-text) 68%, rgb(245 158 11)); background: color-mix(in srgb, var(--ghost-surface-2) 88%, rgb(245 158 11)); border-left: 3px solid rgb(245 158 11); }
.advanced-section { margin-top: 1.5rem; border-top: 1px solid var(--ghost-border); border-bottom: 1px solid var(--ghost-border); }.advanced-section summary { display: flex; align-items: center; justify-content: space-between; padding: 1rem 0; font-size: .8125rem; font-weight: 700; cursor: pointer; list-style: none; }.advanced-section summary::-webkit-details-marker { display: none; }.advanced-section summary svg { width: 1rem; height: 1rem; transition: transform 180ms ease; }.advanced-section[open] summary svg { transform: rotate(180deg); }.advanced-content { display: grid; gap: 2rem; padding: .5rem 0 1.25rem; }.advanced-content h3 { margin: 0; font-size: .875rem; }.advanced-content p { margin: .35rem 0 0; color: var(--ghost-text-muted); font-size: .75rem; line-height: 1.5; }.technical-list { margin-top: .75rem; border-top: 1px solid var(--ghost-border); }.technical-list > div { display: grid; grid-template-columns: 10rem minmax(0, 1fr); gap: 1rem; padding: .65rem 0; border-bottom: 1px solid var(--ghost-border); font-size: .75rem; }.technical-list dt { color: var(--ghost-text-muted); }.technical-list dd { display: flex; align-items: center; gap: .35rem; min-width: 0; margin: 0; }.technical-list code { overflow-wrap: anywhere; }
:global(.dark) .source-tag--handbook { color: rgb(147 197 253); background: rgb(30 58 138); }:global(.dark) .source-tag--aws { color: rgb(253 230 138); background: rgb(120 53 15); }:global(.dark) .source-tag--ghost { color: rgb(167 243 208); background: rgb(6 78 59); }
@property --trace-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
@keyframes border-trace { to { --trace-angle: 360deg; } }
@keyframes page-trace { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@keyframes hero-scan { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@keyframes flow-forward { from { background-position: 100% 0; } to { background-position: -100% 0; } }
@keyframes source-breathe { 0%, 100% { box-shadow: 0 0 16px rgb(var(--source-rgb) / .08); } 50% { box-shadow: 0 0 24px rgb(var(--source-rgb) / .2); } }
@keyframes logo-pulse { 0%, 100% { transform: translateY(0); box-shadow: 0 0 12px rgb(var(--source-rgb) / .2); } 50% { transform: translateY(-2px); box-shadow: 0 0 24px rgb(var(--source-rgb) / .45); } }
@keyframes hub-glow { 0%, 100% { box-shadow: 0 0 18px rgb(99 102 241 / .2); } 50% { box-shadow: 0 0 32px rgb(99 102 241 / .4); } }
@media (max-width: 1100px) { .source-flow { grid-template-columns: 1fr; }.source-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }.flow-trace { width: 2px; height: 2rem; margin: 0 auto; }.flow-trace::after { background: linear-gradient(180deg, transparent, rgb(59 130 246), rgb(16 185 129), transparent); background-size: 100% 200%; animation-name: flow-down; }.flow-trace span::after { top: auto; right: 50%; bottom: 0; transform: translateX(50%) rotate(135deg); }.mcp-hub, .client-node { width: min(100%, 22rem); margin: 0 auto; } }
@keyframes flow-down { from { background-position: 0 100%; } to { background-position: 0 -100%; } }
@media (max-width: 800px) { .scenario-grid { grid-template-columns: 1fr; }.source-examples { grid-template-columns: 1fr; }.section-heading--actions, .codex-heading { align-items: flex-start; flex-direction: column; }.setup-list { grid-template-columns: 1fr; }.setup-step, .setup-step:nth-child(odd), .setup-step:nth-child(even) { padding: 1rem 0; border-right: 0; }.source-grid { grid-template-columns: 1fr; }.source-node { min-height: auto; }.source-flow { margin-top: 1.5rem; } }
@media (max-width: 520px) { .mcp-hero { padding: 1rem; }.hero-copy h1 { font-size: 1.75rem; }.hero-actions :deep(a) { width: 100%; justify-content: center; }.setup-switch { width: 100%; }.setup-switch button { flex: 1; justify-content: center; }.technical-list > div { grid-template-columns: 1fr; gap: .25rem; }.connection-tool { padding: 1rem; } }
@media (prefers-reduced-motion: reduce) { .mcp-page::before, .mcp-hero, .mcp-hero::after, .source-node, .source-logo, .flow-trace::after, .mcp-hub, .combined-question::after, .connection-tool, :deep(.mcp-command) { animation: none; transition: none; } }
</style>
