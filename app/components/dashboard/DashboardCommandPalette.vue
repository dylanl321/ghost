<template>
  <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 h-full overflow-hidden flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <UIcon name="i-heroicons-command-line" class="w-4.5 h-4.5 text-emerald-500" />
        </div>
        <div>
          <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Command Palette</h2>
          <p class="text-[11px] text-gray-400 dark:text-gray-500">Navigate anywhere instantly</p>
        </div>
      </div>
      <button
        class="px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors group"
        @click="open"
      >
        <span class="text-xs font-medium text-gray-500 dark:text-gray-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
          {{ isMac ? '⌘' : 'Ctrl+' }}K
        </span>
      </button>
    </div>

    <!-- Third layout: compact -->
    <template v-if="displayStyle === 'third'">
      <!-- Search trigger -->
      <button
        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-sm mb-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
        @click="open"
      >
        <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4" />
        <span>Search pages, accounts...</span>
      </button>

      <!-- Helper text for new users -->
      <div v-if="recentCommandItems.length === 0" class="flex-1 space-y-2 text-xs text-gray-500 dark:text-gray-400">
        <p class="leading-relaxed">Search accounts, jump to pages, run actions, or ask AI questions — all from one place.</p>
        <p class="text-[11px]">
          <NuxtLink to="/support/docs?topic=command-palette-guide" class="text-emerald-600 dark:text-emerald-400 hover:underline">Learn more</NuxtLink>
        </p>
      </div>

      <!-- Recent commands -->
      <div v-else class="flex-1 space-y-1">
        <p class="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Recent</p>
        <button
          v-for="cmd in recentCommandItems.slice(0, 3)"
          :key="cmd.id"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left truncate"
          @click="executeCommand(cmd)"
        >
          <UIcon v-if="cmd.icon" :name="cmd.icon" class="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
          <span class="truncate">{{ cmd.label }}</span>
        </button>
      </div>

      <!-- Shortcut hints -->
      <div class="mt-auto pt-2 border-t border-gray-100 dark:border-gray-700/50 flex items-center gap-3 text-[10px] text-gray-400">
        <span><kbd class="px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded">g</kbd><kbd class="px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded ml-0.5">d</kbd> home</span>
        <span><kbd class="px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded">g</kbd><kbd class="px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded ml-0.5">c</kbd> costs</span>
        <span><kbd class="px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded">g</kbd><kbd class="px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded ml-0.5">e</kbd> explorer</span>
      </div>
    </template>

    <!-- Half layout -->
    <template v-else-if="displayStyle === 'half'">
      <!-- Search trigger -->
      <button
        class="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-sm mb-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
        @click="open"
      >
        <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4" />
        <span class="flex-1">Search pages, accounts, or ask a question...</span>
        <kbd class="text-[10px] px-1.5 py-0.5 bg-white dark:bg-slate-600 rounded text-gray-400 border border-gray-200 dark:border-gray-600">{{ isMac ? '⌘K' : 'Ctrl+K' }}</kbd>
      </button>

      <!-- Helper text for new users -->
      <div v-if="recentCommandItems.length === 0" class="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30">
        <p class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mb-2">Search accounts, jump to pages, toggle theme, or ask AI — all from one keyboard shortcut.</p>
        <div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
          <span>Search accounts by name or ID</span>
          <span>Select an account to drill into costs, security, tags</span>
          <span>Type a question to ask AI</span>
        </div>
        <NuxtLink to="/support/docs?topic=command-palette-guide" class="inline-block mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline">Full guide</NuxtLink>
      </div>

      <!-- Recent commands -->
      <div v-if="recentCommandItems.length > 0" class="mb-4">
        <p class="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Recent</p>
        <div class="space-y-1">
          <button
            v-for="cmd in recentCommandItems.slice(0, 5)"
            :key="cmd.id"
            class="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
            @click="executeCommand(cmd)"
          >
            <UIcon v-if="cmd.icon" :name="cmd.icon" class="w-4 h-4 flex-shrink-0 text-gray-400" />
            <span class="truncate flex-1">{{ cmd.label }}</span>
            <span v-if="cmd.description" class="text-[10px] text-gray-400 truncate max-w-[120px]">{{ cmd.description }}</span>
          </button>
        </div>
      </div>

      <!-- Shortcuts grid -->
      <div class="mt-auto pt-3 border-t border-gray-100 dark:border-gray-700/50">
        <p class="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Shortcuts</p>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          <div class="flex items-center justify-between">
            <span>Dashboard</span>
            <span><kbd class="px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded text-[10px]">g d</kbd></span>
          </div>
          <div class="flex items-center justify-between">
            <span>Costs</span>
            <span><kbd class="px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded text-[10px]">g c</kbd></span>
          </div>
          <div class="flex items-center justify-between">
            <span>Explorer</span>
            <span><kbd class="px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded text-[10px]">g e</kbd></span>
          </div>
          <div class="flex items-center justify-between">
            <span>Security</span>
            <span><kbd class="px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded text-[10px]">g s</kbd></span>
          </div>
          <div class="flex items-center justify-between">
            <span>AI Chat</span>
            <span><kbd class="px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded text-[10px]">g h</kbd></span>
          </div>
          <div class="flex items-center justify-between">
            <span>Org Chart</span>
            <span><kbd class="px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded text-[10px]">g o</kbd></span>
          </div>
        </div>
      </div>
    </template>

    <!-- Full / Two-thirds layout -->
    <template v-else>
      <!-- Search trigger -->
      <button
        class="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-400 text-sm mb-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
        @click="open"
      >
        <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4" />
        <span class="flex-1">Search pages, accounts, actions, or ask a question...</span>
        <kbd class="text-[10px] px-1.5 py-0.5 bg-white dark:bg-slate-600 rounded text-gray-400 border border-gray-200 dark:border-gray-600">{{ isMac ? '⌘K' : 'Ctrl+K' }}</kbd>
      </button>

      <div class="flex gap-6 flex-1 min-h-0">
        <!-- Left column: Recent + Favorites -->
        <div class="flex-1 space-y-4">
          <!-- Helper explainer for new users -->
          <div v-if="recentCommandItems.length === 0" class="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30">
            <p class="text-xs font-medium text-gray-700 dark:text-gray-200 mb-1.5">Your power-user hub</p>
            <ul class="space-y-1 text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
              <li class="flex items-start gap-1.5">
                <UIcon name="i-heroicons-magnifying-glass" class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
                <span><strong>Search</strong> accounts by name or ID with fuzzy matching</span>
              </li>
              <li class="flex items-start gap-1.5">
                <UIcon name="i-heroicons-cursor-arrow-ripple" class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
                <span><strong>Drill down</strong> into an account's costs, security, tags, and resources</span>
              </li>
              <li class="flex items-start gap-1.5">
                <UIcon name="i-heroicons-bolt" class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
                <span><strong>Actions</strong> like toggle theme, copy URL, or toggle sidebar</span>
              </li>
              <li class="flex items-start gap-1.5">
                <UIcon name="i-heroicons-sparkles" class="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-emerald-500" />
                <span><strong>Ask AI</strong> — type a question and it routes to GHOST Chat</span>
              </li>
            </ul>
            <NuxtLink to="/support/docs?topic=command-palette-guide" class="inline-block mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline">Read the full guide</NuxtLink>
          </div>

          <!-- Recent commands -->
          <div v-if="recentCommandItems.length > 0">
            <p class="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Recent</p>
            <div class="space-y-1">
              <button
                v-for="cmd in recentCommandItems.slice(0, 5)"
                :key="cmd.id"
                class="w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
                @click="executeCommand(cmd)"
              >
                <UIcon v-if="cmd.icon" :name="cmd.icon" class="w-4 h-4 flex-shrink-0 text-gray-400" />
                <span class="truncate flex-1">{{ cmd.label }}</span>
                <span v-if="cmd.shortcut" class="text-[10px] text-gray-400">{{ cmd.shortcut }}</span>
              </button>
            </div>
          </div>

          <!-- Favorite accounts -->
          <div v-if="favoriteChips.length > 0">
            <p class="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Favorite Accounts</p>
            <div class="flex flex-wrap gap-1.5">
              <NuxtLink
                v-for="fav in favoriteChips.slice(0, 6)"
                :key="fav.id"
                :to="`/account/explorer?search=${fav.id}`"
                class="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                <span class="w-1.5 h-1.5 rounded-full" :class="fav.isGovCloud ? 'bg-blue-400' : 'bg-green-400'" />
                <span class="truncate max-w-[100px]">{{ fav.name }}</span>
              </NuxtLink>
            </div>
          </div>
        </div>

        <!-- Right column: Shortcuts -->
        <div class="w-48 flex-shrink-0">
          <p class="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Shortcuts</p>
          <div class="space-y-1.5 text-[11px] text-gray-500 dark:text-gray-400">
            <div v-for="s in allShortcuts" :key="s.label" class="flex items-center justify-between">
              <span>{{ s.label }}</span>
              <kbd class="px-1 py-0.5 bg-gray-100 dark:bg-slate-700 rounded text-[10px]">{{ s.keys }}</kbd>
            </div>
          </div>
        </div>
      </div>

      <!-- Tip -->
      <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50">
        <p class="text-[11px] text-gray-400 dark:text-gray-500 italic">
          {{ currentTip }}
        </p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { DisplayStyle } from '#shared/types/dashboard-layout'
import type { CommandItem } from '~/composables/useCommandPalette'

defineProps<{
  displayStyle: DisplayStyle
}>()

const { open, recentCommands, allCommands, executeCommand, currentTip } = useCommandPalette()

const isMac = computed(() => {
  if (!import.meta.client) return true
  return navigator.platform?.toLowerCase().includes('mac') || navigator.userAgent?.toLowerCase().includes('mac')
})

// Resolve recent command IDs to full command objects
const recentCommandItems = computed<CommandItem[]>(() => {
  const items: CommandItem[] = []
  for (const id of recentCommands.value) {
    const cmd = allCommands.value.find(c => c.id === id)
    if (cmd) items.push(cmd)
  }
  return items
})

// Favorite accounts for chips
const favoriteChips = computed(() => {
  try {
    const { favoriteIds } = useFavoriteAccounts()
    const accountsStore = useAwsAccountsStore()
    return favoriteIds.value.slice(0, 6).map(id => {
      const account = accountsStore.accountsList.find((a: any) => a.accountId === id)
      return {
        id,
        name: account?.accountName || account?.projectName || id,
        isGovCloud: account?.isGovCloud || false
      }
    })
  } catch {
    return []
  }
})

const allShortcuts = [
  { label: 'Dashboard', keys: 'g d' },
  { label: 'Costs', keys: 'g c' },
  { label: 'Explorer', keys: 'g e' },
  { label: 'Security', keys: 'g s' },
  { label: 'Admin', keys: 'g a' },
  { label: 'Org Chart', keys: 'g o' },
  { label: 'Reports', keys: 'g r' },
  { label: 'AI Chat', keys: 'g h' },
  { label: 'Profile', keys: 'g p' },
  { label: 'Changelog', keys: 'g l' },
]
</script>
