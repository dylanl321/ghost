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
              <!-- Search Input -->
              <div class="relative">
                <UIcon
                  name="i-heroicons-magnifying-glass"
                  class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                />
                <input
                  ref="inputRef"
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search settings, pages, or commands..."
                  class="w-full border-0 bg-transparent py-4 pl-12 pr-4 text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-0 text-base"
                  @keydown="handleInputKeydown"
                />
                <div class="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <kbd class="hidden sm:inline-flex items-center px-2 py-0.5 text-xs font-medium text-gray-400 bg-gray-100 dark:bg-slate-700 rounded">
                    esc
                  </kbd>
                </div>
              </div>

              <!-- Results -->
              <div class="max-h-80 overflow-y-auto border-t border-gray-200 dark:border-slate-700">
                <!-- Empty State -->
                <div v-if="filteredCommands.length === 0" class="py-14 px-6 text-center">
                  <UIcon name="i-heroicons-magnifying-glass" class="mx-auto h-6 w-6 text-gray-400" />
                  <p class="mt-4 text-sm text-gray-900 dark:text-white">
                    No results found
                  </p>
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    Try a different search term
                  </p>
                </div>

                <!-- Results Groups -->
                <div v-else class="py-2">
                  <!-- Recent -->
                  <div v-if="groupedCommands.recent.length > 0 && !searchQuery" class="px-2 py-2">
                    <div class="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Recent
                    </div>
                    <CommandItem
                      v-for="(cmd, idx) in groupedCommands.recent"
                      :key="cmd.id"
                      :command="cmd"
                      :selected="selectedIndex === idx"
                      @select="executeCommand(cmd)"
                    />
                  </div>

                  <!-- Navigation -->
                  <div v-if="groupedCommands.navigation.length > 0" class="px-2 py-2">
                    <div class="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Navigation
                    </div>
                    <CommandItem
                      v-for="(cmd, idx) in groupedCommands.navigation"
                      :key="cmd.id"
                      :command="cmd"
                      :selected="selectedIndex === getGlobalIndex('navigation', idx)"
                      @select="executeCommand(cmd)"
                    />
                  </div>

                  <!-- Settings -->
                  <div v-if="groupedCommands.settings.length > 0" class="px-2 py-2">
                    <div class="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Settings
                    </div>
                    <CommandItem
                      v-for="(cmd, idx) in groupedCommands.settings"
                      :key="cmd.id"
                      :command="cmd"
                      :selected="selectedIndex === getGlobalIndex('settings', idx)"
                      @select="executeCommand(cmd)"
                    />
                  </div>

                  <!-- Admin -->
                  <div v-if="groupedCommands.admin.length > 0" class="px-2 py-2">
                    <div class="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Admin
                    </div>
                    <CommandItem
                      v-for="(cmd, idx) in groupedCommands.admin"
                      :key="cmd.id"
                      :command="cmd"
                      :selected="selectedIndex === getGlobalIndex('admin', idx)"
                      @select="executeCommand(cmd)"
                    />
                  </div>
                </div>
              </div>

              <!-- Footer -->
              <div class="border-t border-gray-200 dark:border-slate-700 px-4 py-2.5 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                <div class="flex items-center gap-4">
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
                <div class="flex items-center gap-1">
                  <span class="text-emerald-500">⌘K</span>
                  <span>to open</span>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import type { CommandItem as CommandItemType } from '~/composables/useCommandPalette'

const {
  isOpen,
  searchQuery,
  filteredCommands,
  groupedCommands,
  close,
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

// Calculate global index for a command in a category
function getGlobalIndex(category: string, localIndex: number): number {
  let offset = 0
  const categories = ['recent', 'navigation', 'settings', 'admin']

  for (const cat of categories) {
    if (cat === category) {
      return offset + localIndex
    }
    offset += groupedCommands.value[cat as keyof typeof groupedCommands.value]?.length || 0
  }

  return offset + localIndex
}

// Get all commands in order
const allCommandsFlat = computed(() => {
  const result: CommandItemType[] = []
  if (!searchQuery.value && groupedCommands.value.recent) {
    result.push(...groupedCommands.value.recent)
  }
  if (groupedCommands.value.navigation) {
    result.push(...groupedCommands.value.navigation)
  }
  if (groupedCommands.value.settings) {
    result.push(...groupedCommands.value.settings)
  }
  if (groupedCommands.value.admin) {
    result.push(...groupedCommands.value.admin)
  }
  return result
})

// Handle keyboard navigation
function handleInputKeydown(event: KeyboardEvent) {
  const total = allCommandsFlat.value.length

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
// CommandItem sub-component
const CommandItem = defineComponent({
  name: 'CommandItem',
  props: {
    command: {
      type: Object as PropType<CommandItemType>,
      required: true
    },
    selected: {
      type: Boolean,
      default: false
    }
  },
  emits: ['select'],
  setup(props, { emit }) {
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
            class: 'w-5 h-5 flex-shrink-0'
          })
        : null,
      h('div', { class: 'flex-1 min-w-0' }, [
        h('div', { class: 'font-medium truncate' }, props.command.label),
        props.command.description
          ? h('div', { class: 'text-xs text-gray-500 dark:text-gray-400 truncate' }, props.command.description)
          : null
      ]),
      props.selected
        ? h(resolveComponent('UIcon'), {
            name: 'i-heroicons-arrow-return-left',
            class: 'w-4 h-4 text-gray-400'
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
