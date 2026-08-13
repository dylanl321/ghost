<script setup lang="ts">
definePageMeta({
  title: 'MCP Connections',
  description: 'Connect Codex and other MCP clients to GHOST'
})

interface McpConfig {
  protocolVersion: string
  serverUrl: string
  authorizationServer: string
  scopes: Array<{ id: string; label: string; description: string }>
  codex: {
    addCommand: string
    loginCommand: string
    verifyCommands: string[]
    resetCommands: string[]
    configToml: string
  }
}

type SetupStep = 'connect' | 'sign-in' | 'verify' | 'try-it'
type PromptCategory = 'security' | 'operations' | 'access'

const config = ref<McpConfig | null>(null)
const pending = ref(true)
const error = ref<Error | null>(null)
const activeStep = ref<SetupStep>('connect')
const copiedCommands = ref<string[]>([])
const promptCategory = ref<PromptCategory>('security')
const toast = useToast()

const steps: Array<{ id: SetupStep; label: string; shortLabel: string }> = [
  { id: 'connect', label: 'Add GHOST', shortLabel: 'Add' },
  { id: 'sign-in', label: 'Sign in', shortLabel: 'Sign in' },
  { id: 'verify', label: 'Verify', shortLabel: 'Verify' },
  { id: 'try-it', label: 'Try it', shortLabel: 'Ask' }
]

const promptCategories: Array<{ id: PromptCategory; label: string }> = [
  { id: 'security', label: 'Security' },
  { id: 'operations', label: 'Operations' },
  { id: 'access', label: 'Access' }
]

const promptExamples: Array<{ category: PromptCategory; title: string; icon: string; prompt: string }> = [
  {
    category: 'security',
    title: 'Compliance posture',
    icon: 'i-heroicons-shield-check',
    prompt: 'Summarize the current compliance posture for account 123456789012. Prioritize critical and high findings, patch compliance gaps, and the next actions to take.'
  },
  {
    category: 'security',
    title: 'Evidence bundle',
    icon: 'i-heroicons-document-check',
    prompt: 'Create an evidence bundle for the most important open security findings in account 123456789012, including owners, affected resources, and supporting details.'
  },
  {
    category: 'operations',
    title: 'Golden AMIs',
    icon: 'i-heroicons-cpu-chip',
    prompt: 'Which EC2 instances in account 123456789012 are not using an approved Golden AMI? Group them by owner and explain the remediation path.'
  },
  {
    category: 'operations',
    title: 'Account health',
    icon: 'i-heroicons-heart',
    prompt: 'Give me an account health review for account 123456789012: failed pipelines, recent write activity, security risks, and the highest-value remediation plan.'
  },
  {
    category: 'access',
    title: 'Access explanation',
    icon: 'i-heroicons-users',
    prompt: 'Explain why jane.doe@gd-ms.com has access to account 123456789012. Include the Entra group, mapped role, and any relevant account assignment.'
  },
  {
    category: 'access',
    title: 'Remediation plan',
    icon: 'i-heroicons-wrench-screwdriver',
    prompt: 'Build a remediation plan for the critical findings in account 123456789012. Sequence the work, identify likely owners, and call out approvals or evidence needed.'
  }
]

const authenticationSteps = [
  { title: 'Client registration', description: 'Codex dynamically registers itself with the GHOST authorization server.' },
  { title: 'Entra sign-in', description: 'Your browser opens for normal Government Entra authentication.' },
  { title: 'Scope consent', description: 'GHOST displays the requested read, AI, and personal-workflow permissions.' },
  { title: 'Short-lived access', description: 'Codex stores the issued OAuth tokens and refreshes them without exposing server credentials.' }
]

const currentStepIndex = computed(() => steps.findIndex(step => step.id === activeStep.value))
const visiblePrompts = computed(() => promptExamples.filter(example => example.category === promptCategory.value))

function isCopied(value: string) {
  return copiedCommands.value.includes(value)
}

function canVisit(step: SetupStep) {
  return steps.findIndex(item => item.id === step) <= currentStepIndex.value
}

function visitStep(step: SetupStep) {
  if (canVisit(step)) activeStep.value = step
}

function continueTo(step: SetupStep) {
  activeStep.value = step
}

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    if (!copiedCommands.value.includes(value)) copiedCommands.value.push(value)
    toast.add({ title: `${label} copied`, icon: 'i-heroicons-check-circle', color: 'green' })
  } catch {
    toast.add({ title: `Could not copy ${label.toLowerCase()}`, description: 'Select the command and copy it manually.', icon: 'i-heroicons-exclamation-circle', color: 'red' })
  }
}

async function refresh() {
  pending.value = true
  error.value = null
  try {
    config.value = await $fetch<McpConfig>('/api/mcp/config')
  } catch (cause: any) {
    error.value = cause instanceof Error ? cause : new Error('MCP configuration is unavailable')
  } finally {
    pending.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <div class="mcp-guide mx-auto max-w-6xl px-4 pb-14 sm:px-6">
    <header class="guide-header">
      <div class="guide-mark" aria-hidden="true"><UIcon name="i-heroicons-link" class="size-5" /></div>
      <div>
        <p class="guide-kicker">GHOST for Codex</p>
        <h1>Connect your AWS context.</h1>
      </div>
      <p class="guide-header-note">A short setup, then GHOST is available in every new Codex conversation.</p>
    </header>

    <div v-if="pending" class="py-20 text-center text-gray-500">
      <UIcon name="i-heroicons-arrow-path" class="size-6 animate-spin mx-auto" />
    </div>

    <div v-else-if="error" class="py-12">
      <UAlert color="red" variant="soft" title="MCP configuration is unavailable" :description="error.message">
        <template #actions>
          <UButton icon="i-heroicons-arrow-path" color="red" variant="soft" @click="refresh">Retry</UButton>
        </template>
      </UAlert>
    </div>

    <template v-else-if="config">
      <div class="guide-layout">
        <nav class="guide-rail" aria-label="MCP connection progress">
          <div class="rail-line" aria-hidden="true"><span :style="{ height: `${(currentStepIndex / (steps.length - 1)) * 100}%` }" /></div>
          <button v-for="(step, index) in steps" :key="step.id" class="rail-step" :class="{ 'is-active': activeStep === step.id, 'is-complete': index < currentStepIndex }" :disabled="!canVisit(step.id)" @click="visitStep(step.id)">
            <span class="rail-number"><UIcon v-if="index < currentStepIndex" name="i-heroicons-check" class="size-3.5" /><template v-else>{{ index + 1 }}</template></span>
            <span>{{ step.label }}</span>
          </button>
        </nav>

        <main class="guide-main">
          <div class="mobile-progress" aria-label="MCP connection progress">
            <span>{{ currentStepIndex + 1 }} of {{ steps.length }}</span><strong>{{ steps[currentStepIndex].shortLabel }}</strong>
          </div>

          <Transition name="guide-step" mode="out-in">
            <section :key="activeStep" class="guide-step">
              <template v-if="activeStep === 'connect'">
                <p class="step-eyebrow">Step 1</p>
                <h2>Add GHOST to Codex</h2>
                <p class="step-intro">Run this once in your terminal. It adds GHOST to your local Codex connection list.</p>
                <CommandBlock :value="config.codex.addCommand" label="Add GHOST command" :copied="isCopied(config.codex.addCommand)" @copy="copy(config.codex.addCommand, 'Add GHOST command')" />
                <p class="copy-confirmation" :class="{ visible: isCopied(config.codex.addCommand) }"><UIcon name="i-heroicons-check-circle" class="size-4" />Command copied. Run it in your terminal, then continue.</p>
                <UButton color="primary" trailing-icon="i-heroicons-arrow-right" class="guide-action" @click="continueTo('sign-in')">I added GHOST</UButton>
              </template>

              <template v-else-if="activeStep === 'sign-in'">
                <p class="step-eyebrow">Step 2</p>
                <h2>Sign in in your browser</h2>
                <p class="step-intro">This opens your usual Entra sign-in flow. There are no credentials, tokens, or keys to copy into Codex.</p>
                <CommandBlock :value="config.codex.loginCommand" label="Sign-in command" :copied="isCopied(config.codex.loginCommand)" @copy="copy(config.codex.loginCommand, 'Sign-in command')" />
                <p class="copy-confirmation" :class="{ visible: isCopied(config.codex.loginCommand) }"><UIcon name="i-heroicons-check-circle" class="size-4" />Command copied. Approve access in the browser, then return here.</p>
                <div class="credential-note"><UIcon name="i-heroicons-lock-closed" class="size-5" /><p><strong>Your access stays yours.</strong> Codex receives user-bound OAuth access after sign-in; GHOST credentials remain on the server.</p></div>
                <UButton color="primary" trailing-icon="i-heroicons-arrow-right" class="guide-action" @click="continueTo('verify')">I signed in</UButton>
              </template>

              <template v-else-if="activeStep === 'verify'">
                <p class="step-eyebrow">Step 3</p>
                <h2>Make sure GHOST is ready</h2>
                <p class="step-intro">Run either command. GHOST should appear as an enabled MCP connection before you start a new Codex conversation.</p>
                <div class="space-y-3">
                  <CommandBlock v-for="command in config.codex.verifyCommands" :key="command" :value="command" label="Verify command" :copied="isCopied(command)" @copy="copy(command, 'Verify command')" />
                </div>
                <UButton color="primary" trailing-icon="i-heroicons-arrow-right" class="guide-action" @click="continueTo('try-it')">GHOST is listed</UButton>
              </template>

              <template v-else>
                <p class="step-eyebrow">Step 4</p>
                <h2>Give GHOST something useful</h2>
                <p class="step-intro">Open a new Codex thread and start with one of these. Replace the account ID where needed.</p>
                <div class="prompt-selector" role="tablist" aria-label="Prompt categories">
                  <button v-for="category in promptCategories" :key="category.id" role="tab" :aria-selected="promptCategory === category.id" :class="{ 'is-selected': promptCategory === category.id }" @click="promptCategory = category.id">{{ category.label }}</button>
                </div>
                <div class="prompt-list">
                  <article v-for="example in visiblePrompts" :key="example.title" class="prompt-item">
                    <UIcon :name="example.icon" class="prompt-icon" />
                    <div><h3>{{ example.title }}</h3><p>{{ example.prompt }}</p></div>
                    <UTooltip :text="isCopied(example.prompt) ? 'Prompt copied' : `Copy ${example.title.toLowerCase()} prompt`"><UButton :icon="isCopied(example.prompt) ? 'i-heroicons-check' : 'i-heroicons-clipboard'" color="gray" variant="ghost" square size="xs" @click="copy(example.prompt, `${example.title} prompt`)" /></UTooltip>
                  </article>
                </div>
              </template>
            </section>
          </Transition>

          <details class="advanced-section">
            <summary><span>Advanced configuration</span><UIcon name="i-heroicons-chevron-down" class="size-4" /></summary>
            <div class="advanced-content">
              <section><h3>Manual Codex configuration</h3><p>For managed Codex settings, use this equivalent TOML configuration.</p><CommandBlock :value="config.codex.configToml" label="TOML configuration" multiline :copied="isCopied(config.codex.configToml)" @copy="copy(config.codex.configToml, 'TOML configuration')" /></section>
              <section><h3>Connection details</h3><dl class="technical-list"><div><dt>Server URL</dt><dd><code>{{ config.serverUrl }}</code><UTooltip text="Copy server URL"><UButton icon="i-heroicons-clipboard" color="gray" variant="ghost" square size="xs" @click="copy(config.serverUrl, 'Server URL')" /></UTooltip></dd></div><div><dt>MCP protocol</dt><dd>{{ config.protocolVersion }}</dd></div><div><dt>Transport</dt><dd>Streamable HTTP</dd></div><div><dt>Authentication</dt><dd>Government Entra ID, OAuth 2.1, PKCE</dd></div><div><dt>Network</dt><dd>Corporate network or VPN</dd></div><div><dt>Authorization server</dt><dd><code>{{ config.authorizationServer }}</code></dd></div></dl></section>
              <section><h3>Access and consent</h3><ol class="authentication-flow"><li v-for="(step, index) in authenticationSteps" :key="step.title"><span>0{{ index + 1 }}</span><div><strong>{{ step.title }}</strong><p>{{ step.description }}</p></div></li></ol><div class="scope-list"><div v-for="scope in config.scopes" :key="scope.id"><strong>{{ scope.label }}</strong><code>{{ scope.id }}</code><p>{{ scope.description }}</p></div></div></section>
              <section><h3>Verify, sign out, or remove GHOST</h3><div class="space-y-3"><CommandBlock v-for="command in [...config.codex.verifyCommands, ...config.codex.resetCommands]" :key="command" :value="command" :label="command.includes('logout') || command.includes('remove') ? 'Reset command' : 'Verify command'" :copied="isCopied(command)" @copy="copy(command, command.includes('logout') || command.includes('remove') ? 'Reset command' : 'Verify command')" /></div></section>
            </div>
          </details>
        </main>
      </div>
    </template>
  </div>
</template>

<style scoped>
.mcp-guide { color: rgb(31 41 55); }
.guide-header { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .75rem 1rem; align-items: center; padding: 2rem 0 1.5rem; border-bottom: 1px solid rgb(209 213 219); }
.guide-mark { display: grid; width: 2.5rem; height: 2.5rem; place-items: center; color: rgb(4 120 87); background: rgb(236 253 245); border: 1px solid rgb(167 243 208); border-radius: .375rem; }
.guide-kicker, .step-eyebrow { margin: 0; color: rgb(5 150 105); font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.guide-header h1, .guide-step h2 { margin: .1rem 0 0; color: rgb(17 24 39); font-family: Georgia, 'Times New Roman', serif; font-weight: 500; letter-spacing: 0; }
.guide-header h1 { font-size: clamp(1.8rem, 4vw, 2.4rem); line-height: 1.1; }
.guide-header-note { grid-column: 2; margin: 0; color: rgb(75 85 99); font-size: .875rem; line-height: 1.45; }
.guide-layout { display: grid; grid-template-columns: 11.5rem minmax(0, 1fr); gap: clamp(2rem, 7vw, 6rem); padding-top: 2.25rem; }
.guide-rail { position: sticky; top: 1.5rem; align-self: start; display: grid; gap: 1.25rem; padding-left: .1rem; }
.rail-line { position: absolute; top: 1rem; bottom: 1rem; left: .6rem; width: 1px; background: rgb(209 213 219); }
.rail-line span { display: block; width: 100%; background: rgb(5 150 105); transition: height 180ms ease; }
.rail-step { position: relative; z-index: 1; display: flex; align-items: center; gap: .75rem; width: max-content; padding: 0; color: rgb(107 114 128); font-size: .875rem; text-align: left; background: transparent; border: 0; cursor: pointer; }
.rail-step:disabled { cursor: default; }.rail-step.is-active { color: rgb(17 24 39); font-weight: 700; }.rail-step.is-complete { color: rgb(5 120 87); }
.rail-number { display: grid; width: 1.25rem; height: 1.25rem; place-items: center; color: rgb(107 114 128); font-size: .6875rem; background: white; border: 1px solid rgb(209 213 219); border-radius: 999px; }.is-active .rail-number { color: rgb(146 64 14); background: rgb(255 251 235); border-color: rgb(245 158 11); }.is-complete .rail-number { color: white; background: rgb(5 150 105); border-color: rgb(5 150 105); }
.guide-main { width: min(100%, 44rem); }.mobile-progress { display: none; }.guide-step { min-height: 22rem; }.guide-step h2 { font-size: clamp(1.8rem, 4vw, 2.5rem); line-height: 1.15; }.step-intro { max-width: 38rem; margin: 1rem 0 1.5rem; color: rgb(75 85 99); font-size: 1rem; line-height: 1.65; }.guide-action { margin-top: 1.5rem; }.copy-confirmation { display: flex; gap: .4rem; align-items: center; min-height: 1.5rem; margin: .5rem 0 0; color: rgb(5 120 87); font-size: .8125rem; opacity: 0; transition: opacity 180ms ease; }.copy-confirmation.visible { opacity: 1; }
.credential-note { display: flex; gap: .75rem; margin-top: 1.25rem; padding: 1rem 0; color: rgb(6 95 70); border-top: 1px solid rgb(167 243 208); border-bottom: 1px solid rgb(167 243 208); }.credential-note p { margin: 0; font-size: .875rem; line-height: 1.55; }.credential-note strong { color: rgb(6 78 59); }
.prompt-selector { display: inline-flex; padding: .1875rem; background: rgb(243 244 246); border: 1px solid rgb(229 231 235); border-radius: .375rem; }.prompt-selector button { padding: .4rem .7rem; color: rgb(75 85 99); font-size: .8125rem; font-weight: 600; background: transparent; border: 0; border-radius: .25rem; cursor: pointer; }.prompt-selector button.is-selected { color: rgb(6 78 59); background: white; box-shadow: 0 1px 2px rgb(0 0 0 / .08); }.prompt-list { margin-top: 1rem; border-top: 1px solid rgb(209 213 219); }.prompt-item { display: grid; grid-template-columns: 1.5rem minmax(0, 1fr) auto; gap: .75rem; padding: 1.15rem 0; border-bottom: 1px solid rgb(209 213 219); }.prompt-icon { width: 1.1rem; height: 1.1rem; margin-top: .1rem; color: rgb(5 150 105); }.prompt-item h3 { margin: 0; color: rgb(17 24 39); font-size: .875rem; font-weight: 700; }.prompt-item p { margin: .35rem 0 0; color: rgb(55 65 81); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .75rem; line-height: 1.55; overflow-wrap: anywhere; }
.advanced-section { margin-top: 3.5rem; border-top: 1px solid rgb(156 163 175); border-bottom: 1px solid rgb(209 213 219); }.advanced-section summary { display: flex; align-items: center; justify-content: space-between; padding: 1rem 0; color: rgb(31 41 55); font-size: .875rem; font-weight: 700; cursor: pointer; list-style: none; }.advanced-section summary::-webkit-details-marker { display: none; }.advanced-section[open] summary svg { transform: rotate(180deg); }.advanced-content { display: grid; gap: 2.5rem; padding: .5rem 0 2rem; }.advanced-content h3 { margin: 0; color: rgb(17 24 39); font-size: .9375rem; }.advanced-content section > p { margin: .4rem 0 1rem; color: rgb(107 114 128); font-size: .8125rem; }.technical-list { border-top: 1px solid rgb(229 231 235); }.technical-list > div { display: grid; grid-template-columns: 10rem minmax(0, 1fr); gap: 1rem; padding: .7rem 0; border-bottom: 1px solid rgb(229 231 235); font-size: .8125rem; }.technical-list dt { color: rgb(107 114 128); }.technical-list dd { display: flex; gap: .35rem; align-items: center; min-width: 0; margin: 0; color: rgb(31 41 55); }.technical-list code { overflow-wrap: anywhere; }.authentication-flow { display: grid; gap: .75rem; margin: 1rem 0; padding: 0; list-style: none; }.authentication-flow li { display: grid; grid-template-columns: 2rem minmax(0, 1fr); gap: .5rem; }.authentication-flow span, .scope-list code { color: rgb(5 150 105); font-size: .75rem; font-weight: 700; }.authentication-flow strong, .scope-list strong { font-size: .8125rem; }.authentication-flow p, .scope-list p { margin: .15rem 0 0; color: rgb(107 114 128); font-size: .75rem; line-height: 1.45; }.scope-list { border-top: 1px solid rgb(229 231 235); }.scope-list > div { padding: .7rem 0; border-bottom: 1px solid rgb(229 231 235); }.scope-list code { display: block; margin-top: .15rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 500; }
.guide-step-enter-active, .guide-step-leave-active { transition: opacity 180ms ease, transform 180ms ease; }.guide-step-enter-from { opacity: 0; transform: translateY(6px); }.guide-step-leave-to { opacity: 0; transform: translateY(-4px); }
:global(.dark) .mcp-guide { color: rgb(229 231 235); }:global(.dark) .guide-header { border-color: rgb(55 65 81); }:global(.dark) .guide-mark { color: rgb(110 231 183); background: rgb(6 78 59 / .35); border-color: rgb(6 95 70); }:global(.dark) .guide-header h1, :global(.dark) .guide-step h2, :global(.dark) .prompt-item h3, :global(.dark) .advanced-content h3 { color: white; }:global(.dark) .guide-header-note, :global(.dark) .step-intro, :global(.dark) .prompt-item p, :global(.dark) .technical-list dd { color: rgb(209 213 219); }:global(.dark) .rail-line, :global(.dark) .prompt-list, :global(.dark) .prompt-item, :global(.dark) .advanced-section { border-color: rgb(75 85 99); }:global(.dark) .rail-number { background: rgb(17 24 39); border-color: rgb(75 85 99); }:global(.dark) .rail-step.is-active { color: white; }:global(.dark) .prompt-selector { background: rgb(31 41 55); border-color: rgb(75 85 99); }:global(.dark) .prompt-selector button.is-selected { color: rgb(167 243 208); background: rgb(17 24 39); }:global(.dark) .technical-list, :global(.dark) .technical-list > div, :global(.dark) .scope-list, :global(.dark) .scope-list > div { border-color: rgb(55 65 81); }
@media (max-width: 767px) { .guide-header { padding-top: 1.25rem; }.guide-header-note { grid-column: 1 / -1; }.guide-layout { display: block; padding-top: 1.25rem; }.guide-rail { display: none; }.guide-main { width: 100%; }.mobile-progress { display: flex; justify-content: space-between; margin-bottom: 1.5rem; padding-bottom: .75rem; color: rgb(107 114 128); font-size: .75rem; border-bottom: 1px solid rgb(209 213 219); }.mobile-progress strong { color: rgb(5 120 87); }.guide-step { min-height: 25rem; }.technical-list > div { grid-template-columns: 1fr; gap: .25rem; }.prompt-item { grid-template-columns: 1.25rem minmax(0, 1fr) auto; gap: .5rem; } }
@media (prefers-reduced-motion: reduce) { .rail-line span, .copy-confirmation, .guide-step-enter-active, .guide-step-leave-active { transition: none; } }
</style>
