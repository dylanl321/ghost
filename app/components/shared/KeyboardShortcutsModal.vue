<template>
  <UModal
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="bg-gray-900 rounded-xl p-6 w-full max-w-md">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-white font-semibold text-lg">Keyboard Shortcuts</h2>
        <button
          class="text-gray-400 hover:text-white transition-colors"
          @click="$emit('update:modelValue', false)"
        >
          <UIcon name="i-heroicons-x-mark" class="w-5 h-5" />
        </button>
      </div>

      <!-- Global -->
      <div class="mb-5">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Global</h3>
        <div class="space-y-2">
          <ShortcutRow :keys="['⌘', 'K']" label="Open command palette" />
          <ShortcutRow :keys="['?']" label="Show shortcuts" />
          <ShortcutRow :keys="['Esc']" label="Close modal / palette" />
        </div>
      </div>

      <!-- Navigation -->
      <div>
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Navigation <span class="text-gray-600 normal-case font-normal">(g prefix)</span></h3>
        <div class="space-y-2">
          <ShortcutRow :keys="['g', 'd']" label="Dashboard" />
          <ShortcutRow :keys="['g', 'c']" label="Costs" />
          <ShortcutRow :keys="['g', 'e']" label="Explorer" />
          <ShortcutRow :keys="['g', 's']" label="Security" />
          <ShortcutRow :keys="['g', 'a']" label="Admin" />
          <ShortcutRow :keys="['g', 'o']" label="Org Chart" />
          <ShortcutRow :keys="['g', 'r']" label="Reports" />
          <ShortcutRow :keys="['g', 'h']" label="AI Chat" />
          <ShortcutRow :keys="['g', 'p']" label="Profile" />
          <ShortcutRow :keys="['g', 'l']" label="Changelog" />
        </div>
      </div>
    </div>
  </UModal>
</template>

<script setup lang="ts">
defineProps<{
  modelValue: boolean
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
}>()

// Inline sub-component for a shortcut row
const ShortcutRow = defineComponent({
  props: {
    keys: { type: Array as PropType<string[]>, required: true },
    label: { type: String, required: true }
  },
  setup(props) {
    return () => h('div', { class: 'flex items-center justify-between' }, [
      h('span', { class: 'text-gray-300 text-sm' }, props.label),
      h('div', { class: 'flex items-center gap-1' },
        props.keys.map(key =>
          h('kbd', {
            class: 'inline-flex items-center px-2 py-0.5 text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 rounded'
          }, key)
        )
      )
    ])
  }
})
</script>
