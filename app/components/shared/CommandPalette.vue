<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[100] overflow-y-auto"
        @click="close"
      >
        <!-- Backdrop -->
        <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" />

        <!-- Dialog -->
        <div class="flex min-h-full items-start justify-center p-4 pt-[15vh]">
          <Transition name="scale">
            <div
              v-if="isOpen"
              class="relative w-full max-w-xl transform rounded-xl bg-white dark:bg-slate-800 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 overflow-hidden"
              @click.stop
            >
              <!-- Account drill-down breadcrumb -->
              <div v-if="selectedAccount" class="flex items-center gap-2 px-4 pt-3 pb-1">
                <button
                  class="flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-500 transition-colors"
                  @click="goBack"
                >
                  <UIcon name="i-heroicons-arrow-left" class="w-3.5 h-3.5" />
                  Back
                </button>
                <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-gray-400" />
                <span class="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
                  <UIcon name="i-heroicons-building-office-2" class="w-4 h-4 text-gray-400" />
                  {{ selectedAccount.name }}
                  <span class="text-xs font-mono text-gray-400">{{ selectedAccount.id }}</span>
                  <span class="w-2 h-2 rounded-full" :class="selectedAccount.isGovCloud ? 'bg-blue-400' : 'bg-green-400'" />
                </span>
              </div>

              <!-- Search Input -->
              <div class="relative">
                <UIcon
                  name="i-heroicons-magnifying-glass"
                  class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                />
                <input
                  id="command-palette-search"
                  ref="inputRef"
                  v-model="searchQuery"
                  type="text"
                  :placeholder="selectedAccount ? `Filter actions for ${selectedAccount.name}...` : 'Search pages, accounts, actions, or ask a question...'"
                  class="w-full border-0 bg-transparent py-4 pl-12 pr-4 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 text-base"
                  @keydown="handleInputKeydown"
                />
                <div class="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <!-- Server search loading indicator -->
                  <span v-if="isServerSearching" class="animate-spin">
                    <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 text-gray-400" />
                  </span>
                  <kbd class="hidden sm:inline-flex items-center px-2 py-0.5 text-xs font-medium text-gray-400 bg-gray-100 dark:bg-slate-700 rounded">
                    esc
                  </kbd>
                </div>
              </div>

              <!-- Tip (shown when no query and not in drill-down) -->
              <div v-if="!searchQuery && !selectedAccount" class="px-4 pb-2 -mt-1">
                <p class="text-xs text-gray-400 dark:text-gray-500 italic">
                  {{ currentTip }}
                </p>
              </div>

              <!-- Results -->
              <div class="max-h-96 overflow-y-auto border-t border-gray-200 dark:border-slate-700">
                <!-- Empty State -->
                <div v-if="hasNoResults" class="py-14 px-6 text-center">
                  <UIcon name="i-heroicons-magnifying-glass" class="mx-auto h-6 w-6 text-gray-400" />
                  <p class="mt-4 text-sm text-gray-900 dark:text-white">
                    No results found
                  </p>
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Try a different search term or ask AI
                  </p>
                </div>

                <!-- Results Groups -->
                <div v-else class="py-2">
                  <!-- Suggested (context-aware) -->
                  <CommandGroup
                    v-if="groupedCommands.suggested.length > 0 && !searchQuery"
                    label="Suggested"
                    :commands="groupedCommands.suggested"
                    :selected-index="selectedIndex"
                    :get-global-index="(idx: number) => getGlobalIndex('suggested', idx)"
                    @select="executeCommand"
                  />

                  <!-- Recent -->
                  <CommandGroup
                    v-if="groupedCommands.recent.length > 0 && !searchQuery"
                    label="Recent"
                    :commands="groupedCommands.recent"
                    :selected-index="selectedIndex"
                    :get-global-index="(idx: number) => getGlobalIndex('recent', idx)"
                    @select="executeCommand"
                  />

                  <!-- Accounts (shown first when searching) -->
                  <CommandGroup
                    v-if="groupedCommands.accounts && groupedCommands.accounts.length > 0"
                    label="Accounts"
                    :commands="groupedCommands.accounts"
                    :selected-index="selectedIndex"
                    :get-global-index="(idx: number) => getGlobalIndex('accounts', idx)"
                    @select="executeCommand"
                  />

                  <!-- Server Search Results -->
                  <CommandGroup
                    v-if="groupedCommands['search-results'] && groupedCommands['search-results'].length > 0"
                    label="Search Results"
                    :commands="groupedCommands['search-results']"
                    :selected-index="selectedIndex"
                    :get-global-index="(idx: number) => getGlobalIndex('search-results', idx)"
                    @select="executeCommand"
                  />

                  <!-- Navigation (or account actions in drill-down) -->
                  <CommandGroup
                    v-if="groupedCommands.navigation.length > 0"
                    :label="selectedAccount ? `Go to — ${selectedAccount.name}` : 'Navigation'"
                    :commands="groupedCommands.navigation"
                    :selected-index="selectedIndex"
                    :get-global-index="(idx: number) => getGlobalIndex('navigation', idx)"
                    @select="executeCommand"
                  />

                  <!-- Actions -->
                  <CommandGroup
                    v-if="groupedCommands.actions.length > 0"
                    label="Actions"
                    :commands="groupedCommands.actions"
                    :selected-index="selectedIndex"
                    :get-global-index="(idx: number) => getGlobalIndex('actions', idx)"
                    @select="executeCommand"
                  />

                  <!-- Settings -->
                  <CommandGroup
                    v-if="groupedCommands.settings.length > 0"
                    label="Settings"
                    :commands="groupedCommands.settings"
                    :selected-index="selectedIndex"
                    :get-global-index="(idx: number) => getGlobalIndex('settings', idx)"
                    @select="executeCommand"
                  />

                  <!-- Admin -->
                  <CommandGroup
                    v-if="groupedCommands.admin.length > 0"
                    label="Admin"
                    :commands="groupedCommands.admin"
                    :selected-index="selectedIndex"
                    :get-global-index="(idx: number) => getGlobalIndex('admin', idx)"
                    @select="executeCommand"
                  />

                  <!-- AI -->
                  <CommandGroup
                    v-if="groupedCommands.ai && groupedCommands.ai.length > 0"
                    label="AI Assistant"
                    label-class="text-purple-400"
                    :commands="groupedCommands.ai"
                    :selected-index="selectedIndex"
                    :get-global-index="(idx: number) => getGlobalIndex('ai', idx)"
                    @select="executeCommand"
                  />

                  <!-- Fun (Easter Egg) -->
                  <div v-if="groupedCommands.fun && groupedCommands.fun.length > 0" class="px-2 py-2">
                    <div class="px-2 py-1 text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <span>👻</span> Secret Menu
                    </div>
                    <CommandItemRow
                      v-for="(cmd, idx) in groupedCommands.fun"
                      :key="cmd.id"
                      :command="cmd"
                      :selected="selectedIndex === getGlobalIndex('fun', idx)"
                      @select="executeCommand(cmd)"
                    />
                  </div>
                </div>
              </div>

              <!-- Footer -->
              <div class="border-t border-gray-200 dark:border-slate-700 px-4 py-2.5 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <div class="flex items-center gap-4">
                  <span v-if="selectedAccount" class="flex items-center gap-1">
                    <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 rounded">⌫</kbd>
                    go back
                  </span>
                  <span class="flex items-center gap-1">
                    <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 rounded">↑</kbd>
                    <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 rounded">↓</kbd>
                    to navigate
                  </span>
                  <span class="flex items-center gap-1">
                    <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 rounded">↵</kbd>
                    to select
                  </span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="flex items-center gap-1">
                    <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 rounded">?</kbd>
                    for shortcuts
                  </span>
                  <div class="flex items-center gap-1">
                    <span class="text-emerald-500">⌘K</span>
                    <span>to open</span>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>

    <KeyboardShortcutsModal v-model="showShortcutsModal" />
  </Teleport>
</template>

<script setup lang="ts">
import type { CommandItem as CommandItemType } from '~/composables/useCommandPalette'

const {
  isOpen,
  searchQuery,
  filteredCommands,
  groupedCommands,
  showShortcutsModal,
  isServerSearching,
  selectedAccount,
  currentTip,
  close,
  goBack,
  executeCommand
} = useCommandPalette()

const inputRef = ref<HTMLInputElement | null>(null)
const selectedIndex = ref(0)

// Focus input when opened
watch(isOpen, (open) => {
  if (open) {
    selectedIndex.value = 0
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
})

// Reset selection when search changes
watch(searchQuery, () => {
  selectedIndex.value = 0
})

// Category order for keyboard navigation — search results and accounts first when searching
const CATEGORY_ORDER = ['suggested', 'recent', 'accounts', 'search-results', 'navigation', 'actions', 'settings', 'admin', 'ai', 'fun']

// Check if there are truly no results
const hasNoResults = computed(() => {
  if (selectedAccount.value) {
    // In drill-down, check if filtered account actions are empty
    return searchQuery.value.trim().length > 0 && allCommandsFlat.value.length === 0
  }
  if (!searchQuery.value) return false
  return filteredCommands.value.length === 0 && !isServerSearching.value
})

// Calculate global index for a command in a category
function getGlobalIndex(category: string, localIndex: number): number {
  let offset = 0

  for (const cat of CATEGORY_ORDER) {
    if (cat === category) {
      return offset + localIndex
    }
    // For suggested/recent, only count when no query
    if ((cat === 'suggested' || cat === 'recent') && searchQuery.value) {
      continue
    }
    offset += groupedCommands.value[cat as keyof typeof groupedCommands.value]?.length || 0
  }

  return offset + localIndex
}

// Get all commands in order
const allCommandsFlat = computed(() => {
  const result: CommandItemType[] = []
  for (const cat of CATEGORY_ORDER) {
    if ((cat === 'suggested' || cat === 'recent') && searchQuery.value) {
      continue
    }
    const items = groupedCommands.value[cat as keyof typeof groupedCommands.value]
    if (items) {
      result.push(...items)
    }
  }
  return result
})

// Handle keyboard navigation
function handleInputKeydown(event: KeyboardEvent) {
  const total = allCommandsFlat.value.length

  // Backspace on empty input goes back from drill-down
  if (event.key === 'Backspace' && !searchQuery.value && selectedAccount.value) {
    event.preventDefault()
    goBack()
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % total
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    selectedIndex.value = (selectedIndex.value - 1 + total) % total
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const cmd = allCommandsFlat.value[selectedIndex.value]
    if (cmd) {
      executeCommand(cmd)
    }
  }
}
</script>

<script lang="ts">
import type { CommandItem as CmdItem } from '~/composables/useCommandPalette'

// CommandGroup sub-component for rendering a labeled section of commands
const CommandGroup = defineComponent({
  name: 'CommandGroup',
  props: {
    label: { type: String, required: true },
    labelClass: { type: String, default: '' },
    commands: { type: Array as PropType<CmdItem[]>, required: true },
    selectedIndex: { type: Number, required: true },
    getGlobalIndex: { type: Function as PropType<(idx: number) => number>, required: true }
  },
  emits: ['select'],
  setup(props, { emit }) {
    return () => h('div', { class: 'px-2 py-2' }, [
      h('div', {
        class: ['px-2 py-1 text-xs font-semibold uppercase tracking-wider', props.labelClass || 'text-gray-500 dark:text-gray-400']
      }, props.label),
      ...props.commands.map((cmd: CmdItem, idx: number) =>
        h(CommandItemRow, {
          key: cmd.id,
          command: cmd,
          selected: props.selectedIndex === props.getGlobalIndex(idx),
          onSelect: () => emit('select', cmd)
        })
      )
    ])
  }
})

// CommandItemRow sub-component
const CommandItemRow = defineComponent({
  name: 'CommandItemRow',
  props: {
    command: {
      type: Object as PropType<CmdItem>,
      required: true
    },
    selected: {
      type: Boolean,
      default: false
    }
  },
  emits: ['select'],
  setup(props, { emit }) {
    const isAccount = props.command.category === 'accounts'
    const isSearchResult = props.command.category === 'search-results'

    return () => h('button', {
      class: [
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
        props.selected
          ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
      ],
      onClick: () => emit('select')
    }, [
      props.command.icon
        ? h(resolveComponent('UIcon'), {
            name: props.command.icon,
            class: ['w-5 h-5 flex-shrink-0', props.command.category === 'ai' ? 'text-purple-400' : '']
          })
        : null,
      h('div', { class: 'flex-1 min-w-0 flex items-center gap-2' }, [
        h('div', { class: 'font-medium truncate' }, props.command.label),
        // Account ID badge
        (isAccount || isSearchResult) && props.command.accountId
          ? h('span', {
              class: 'flex-shrink-0 text-xs font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'
            }, props.command.accountId)
          : null,
        // Badge (Resource, Instance, etc.)
        props.command.badge
          ? h('span', {
              class: 'flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
            }, props.command.badge)
          : null,
        // Environment dot
        (isAccount || isSearchResult) && props.command.accountId
          ? h('span', {
              class: [
                'flex-shrink-0 w-2 h-2 rounded-full',
                props.command.isGovCloud ? 'bg-blue-400' : 'bg-green-400'
              ],
              title: props.command.isGovCloud ? 'GovCloud' : 'Commercial'
            })
          : null
      ]),
      // Description for non-account items
      !(isAccount || isSearchResult) && props.command.description
        ? h('div', { class: 'text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]' }, props.command.description)
        : null,
      // Shortcut hint
      props.command.shortcut && !props.selected
        ? h('div', { class: 'flex items-center gap-0.5 flex-shrink-0' },
            props.command.shortcut.split(' ').map(k =>
              h('kbd', {
                class: 'px-1 py-0.5 text-[10px] font-medium text-gray-400 bg-gray-100 dark:bg-slate-700 rounded'
              }, k)
            )
          )
        : null,
      props.selected
        ? h(resolveComponent('UIcon'), {
            name: 'i-heroicons-arrow-uturn-left',
            class: 'w-4 h-4 text-gray-400 flex-shrink-0'
          })
        : null
    ])
  }
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.scale-enter-active,
.scale-leave-active {
  transition: all 0.15s ease;
}
.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
