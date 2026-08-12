<script setup lang="ts">
definePageMeta({
  title: 'MCP Connections',
  description: 'Connect Codex and other MCP clients to GHOST'
})

interface McpConfig {
  name: string
  protocolVersion: string
  transport: string
  serverUrl: string
  resource: string
  authorizationServer: string
  protectedResourceMetadata: string
  scopes: Array<{ id: string; label: string; description: string }>
  codex: {
    addCommand: string
    loginCommand: string
    verifyCommands: string[]
    resetCommands: string[]
    configToml: string
  }
}

type ViewId = 'overview' | 'codex' | 'prompts' | 'authentication' | 'manual'

const config = ref<McpConfig | null>(null)
const pending = ref(true)
const error = ref<Error | null>(null)
const activeView = ref<ViewId>('overview')
const toast = useToast()

const views: Array<{ id: ViewId; label: string; icon: string }> = [
  { id: 'overview', label: 'Overview', icon: 'i-heroicons-signal' },
  { id: 'codex', label: 'Codex setup', icon: 'i-simple-icons-openai' },
  { id: 'prompts', label: 'Prompt examples', icon: 'i-heroicons-chat-bubble-left-ellipsis' },
  { id: 'authentication', label: 'Authentication', icon: 'i-heroicons-shield-check' },
  { id: 'manual', label: 'Manual config', icon: 'i-heroicons-command-line' }
]

const promptExamples = [
  {
    title: 'Account lookup',
    icon: 'i-heroicons-magnifying-glass',
    prompt: 'Find the GHOST account named "Project Atlas". Summarize its Commercial and GovCloud IDs, owners, status, department, and line of business.'
  },
  {
    title: 'Cost investigation',
    icon: 'i-heroicons-currency-dollar',
    prompt: 'Compare billable AWS spend for account 123456789012 this month versus last month. Break down the change by service and call out the largest drivers.'
  },
  {
    title: 'User access review',
    icon: 'i-heroicons-users',
    prompt: 'Show every GHOST-managed AWS account that jane.doe@gd-ms.com can access, including the Entra group and role that grants each mapping.'
  },
  {
    title: 'Security posture',
    icon: 'i-heroicons-shield-exclamation',
    prompt: 'Review the security posture of account 123456789012. Prioritize critical and high findings, patch compliance issues, and recent write activity.'
  },
  {
    title: 'Pipeline triage',
    icon: 'i-heroicons-arrow-path',
    prompt: 'Find failed pipelines affecting account 123456789012 in the last 30 days. Group recurring errors and identify which resources were not applied.'
  },
  {
    title: 'AI usage',
    icon: 'i-heroicons-sparkles',
    prompt: 'Summarize organization AI usage for the last 30 days by model and account. Include invocations, tokens, cost, errors, and throttling.'
  }
]

const authenticationSteps = [
  { title: 'Client registration', description: 'Codex dynamically registers itself with the GHOST authorization server.' },
  { title: 'Entra sign-in', description: 'Your browser opens for normal Government Entra authentication.' },
  { title: 'Scope consent', description: 'GHOST displays the requested read, AI, and personal-workflow permissions.' },
  { title: 'Short-lived access', description: 'Codex stores the issued OAuth tokens and refreshes them without exposing server credentials.' }
]

async function copy(value: string, label: string) {
  await navigator.clipboard.writeText(value)
  toast.add({ title: `${label} copied`, icon: 'i-heroicons-check-circle', color: 'green' })
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
  <div class="max-w-6xl mx-auto px-4 sm:px-6 pb-12">
    <header class="py-5 border-b border-gray-200 dark:border-gray-700">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-start gap-3">
          <div class="size-10 flex items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
            <UIcon name="i-heroicons-link" class="size-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">MCP Connections</h1>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">Use GHOST account, cost, access, security, pipeline, and AI data from Codex.</p>
          </div>
        </div>
        <div v-if="config" class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <span class="size-2 rounded-full bg-emerald-500" />
          Available · MCP {{ config.protocolVersion }}
        </div>
      </div>
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
      <nav class="flex gap-1 py-4 overflow-x-auto border-b border-gray-200 dark:border-gray-700" aria-label="MCP connection views">
        <UButton
          v-for="view in views"
          :key="view.id"
          :icon="view.icon"
          :variant="activeView === view.id ? 'soft' : 'ghost'"
          color="gray"
          class="shrink-0"
          @click="activeView = view.id"
        >
          {{ view.label }}
        </UButton>
      </nav>

      <section v-if="activeView === 'overview'" class="py-6 space-y-8">
        <div>
          <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Connection</h2>
          <dl class="mt-3 border-y border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            <div class="py-3 grid gap-1 sm:grid-cols-[11rem_1fr]">
              <dt class="text-gray-500">Server URL</dt>
              <dd class="flex items-center gap-2 min-w-0">
                <code class="font-mono text-gray-900 dark:text-gray-100 break-all">{{ config.serverUrl }}</code>
                <UTooltip text="Copy server URL">
                  <UButton icon="i-heroicons-clipboard" color="gray" variant="ghost" square size="xs" @click="copy(config.serverUrl, 'Server URL')" />
                </UTooltip>
              </dd>
            </div>
            <div class="py-3 grid gap-1 sm:grid-cols-[11rem_1fr]"><dt class="text-gray-500">Transport</dt><dd class="text-gray-900 dark:text-gray-100">Streamable HTTP</dd></div>
            <div class="py-3 grid gap-1 sm:grid-cols-[11rem_1fr]"><dt class="text-gray-500">Authentication</dt><dd class="text-gray-900 dark:text-gray-100">Government Entra ID · OAuth 2.1 · PKCE</dd></div>
            <div class="py-3 grid gap-1 sm:grid-cols-[11rem_1fr]"><dt class="text-gray-500">Network</dt><dd class="text-gray-900 dark:text-gray-100">Corporate network or VPN</dd></div>
          </dl>
        </div>

        <div>
          <div class="flex items-center justify-between gap-3">
            <div><h2 class="text-sm font-semibold text-gray-900 dark:text-white">Quick connect with Codex</h2><p class="mt-1 text-sm text-gray-500">Run these commands once, then start a new Codex thread.</p></div>
            <UButton label="Full setup" icon="i-heroicons-arrow-right" trailing variant="ghost" color="gray" @click="activeView = 'codex'" />
          </div>
          <div class="mt-3 space-y-2">
            <CommandBlock :value="config.codex.addCommand" label="Add command" @copy="copy(config.codex.addCommand, 'Add command')" />
            <CommandBlock :value="config.codex.loginCommand" label="Login command" @copy="copy(config.codex.loginCommand, 'Login command')" />
          </div>
        </div>

        <UAlert icon="i-heroicons-lock-closed" color="green" variant="soft" title="No credentials to copy" description="Codex obtains user-bound OAuth tokens after Entra sign-in. GHOST signing keys and application credentials remain server-side." />
      </section>

      <section v-else-if="activeView === 'codex'" class="py-6">
        <ol class="space-y-7">
          <li class="grid gap-3 sm:grid-cols-[2rem_1fr]">
            <span class="size-7 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-sm font-semibold">1</span>
            <div><h2 class="font-semibold text-gray-900 dark:text-white">Confirm Codex is installed</h2><p class="text-sm text-gray-500 mt-1">The MCP commands are available in current Codex CLI releases.</p><CommandBlock class="mt-3" value="codex --version" label="Version command" @copy="copy('codex --version', 'Version command')" /></div>
          </li>
          <li class="grid gap-3 sm:grid-cols-[2rem_1fr]">
            <span class="size-7 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-sm font-semibold">2</span>
            <div><h2 class="font-semibold text-gray-900 dark:text-white">Add GHOST</h2><p class="text-sm text-gray-500 mt-1">This writes the GHOST Streamable HTTP endpoint to your Codex MCP configuration.</p><CommandBlock class="mt-3" :value="config.codex.addCommand" label="Add command" @copy="copy(config.codex.addCommand, 'Add command')" /></div>
          </li>
          <li class="grid gap-3 sm:grid-cols-[2rem_1fr]">
            <span class="size-7 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-sm font-semibold">3</span>
            <div><h2 class="font-semibold text-gray-900 dark:text-white">Authenticate</h2><p class="text-sm text-gray-500 mt-1">Codex opens your browser for Entra sign-in and scope approval.</p><CommandBlock class="mt-3" :value="config.codex.loginCommand" label="Login command" @copy="copy(config.codex.loginCommand, 'Login command')" /></div>
          </li>
          <li class="grid gap-3 sm:grid-cols-[2rem_1fr]">
            <span class="size-7 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-sm font-semibold">4</span>
            <div><h2 class="font-semibold text-gray-900 dark:text-white">Verify</h2><p class="text-sm text-gray-500 mt-1">Confirm the server is enabled, then open a new Codex thread.</p><div class="mt-3 space-y-2"><CommandBlock v-for="command in config.codex.verifyCommands" :key="command" :value="command" label="Verify command" @copy="copy(command, 'Verify command')" /></div></div>
          </li>
        </ol>
      </section>

      <section v-else-if="activeView === 'prompts'" class="py-6">
        <div class="mb-4"><h2 class="font-semibold text-gray-900 dark:text-white">Example prompts</h2><p class="mt-1 text-sm text-gray-500">Paste one into Codex after the GHOST MCP server is connected.</p></div>
        <div class="border-y border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
          <div v-for="example in promptExamples" :key="example.title" class="py-5 grid gap-3 sm:grid-cols-[2rem_10rem_1fr_2rem] sm:items-start">
            <UIcon :name="example.icon" class="size-5 text-emerald-600 dark:text-emerald-400" />
            <h3 class="text-sm font-medium text-gray-900 dark:text-white">{{ example.title }}</h3>
            <p class="font-mono text-xs leading-5 text-gray-700 dark:text-gray-300">{{ example.prompt }}</p>
            <UTooltip :text="`Copy ${example.title.toLowerCase()} prompt`"><UButton icon="i-heroicons-clipboard" color="gray" variant="ghost" square size="xs" @click="copy(example.prompt, `${example.title} prompt`)" /></UTooltip>
          </div>
        </div>
      </section>

      <section v-else-if="activeView === 'authentication'" class="py-6 space-y-8">
        <div>
          <h2 class="font-semibold text-gray-900 dark:text-white">Authentication flow</h2>
          <ol class="mt-4 grid gap-4 md:grid-cols-4">
            <li v-for="(step, index) in authenticationSteps" :key="step.title" class="border-t-2 border-emerald-500 pt-3">
              <span class="text-xs font-semibold text-emerald-600 dark:text-emerald-400">0{{ index + 1 }}</span>
              <h3 class="mt-1 text-sm font-medium text-gray-900 dark:text-white">{{ step.title }}</h3>
              <p class="mt-1 text-xs leading-5 text-gray-500">{{ step.description }}</p>
            </li>
          </ol>
        </div>

        <div>
          <h2 class="font-semibold text-gray-900 dark:text-white">Requested scopes</h2>
          <div class="mt-3 border-y border-gray-200 dark:border-gray-700 divide-y divide-gray-200 dark:divide-gray-700">
            <div v-for="scope in config.scopes" :key="scope.id" class="py-4 grid gap-1 sm:grid-cols-[12rem_1fr]">
              <div><p class="text-sm font-medium text-gray-900 dark:text-white">{{ scope.label }}</p><code class="text-xs text-emerald-600 dark:text-emerald-400">{{ scope.id }}</code></div>
              <p class="text-sm text-gray-600 dark:text-gray-400">{{ scope.description }}</p>
            </div>
          </div>
        </div>

        <UAlert icon="i-heroicons-shield-check" color="blue" variant="soft" title="User-bound access" description="Tokens represent your Entra identity and granted scopes. Administrative tools, server credentials, and direct AWS infrastructure mutations are not exposed." />
      </section>

      <section v-else class="py-6 space-y-7">
        <div><h2 class="font-semibold text-gray-900 dark:text-white">Codex config.toml</h2><p class="text-sm text-gray-500 mt-1">Equivalent configuration for managed Codex settings.</p><CommandBlock class="mt-3" :value="config.codex.configToml" label="TOML configuration" multiline @copy="copy(config.codex.configToml, 'TOML configuration')" /></div>
        <div><h2 class="font-semibold text-gray-900 dark:text-white">Verify the registration</h2><div class="mt-3 space-y-2"><CommandBlock v-for="command in config.codex.verifyCommands" :key="command" :value="command" label="Verify command" @copy="copy(command, 'Verify command')" /></div></div>
        <div><h2 class="font-semibold text-gray-900 dark:text-white">Sign out or remove GHOST</h2><div class="mt-3 space-y-2"><CommandBlock v-for="command in config.codex.resetCommands" :key="command" :value="command" label="Reset command" @copy="copy(command, 'Reset command')" /></div></div>
      </section>
    </template>
  </div>
</template>

