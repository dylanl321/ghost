<template>
  <div class="flex items-start justify-between gap-4 p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
    <div class="flex-1 min-w-0">
      <!-- Label and Badge -->
      <div class="flex items-center gap-2 mb-1">
        <h4 class="font-medium text-gray-900 dark:text-white">
          {{ config.label }}
        </h4>
        <UBadge
          v-if="!config.isPublic"
          color="orange"
          variant="soft"
          size="xs"
        >
          Admin Only
        </UBadge>
        <UBadge
          v-if="!config.isEditable"
          color="gray"
          variant="soft"
          size="xs"
        >
          Read Only
        </UBadge>
      </div>

      <!-- Description -->
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-2">
        {{ config.description }}
      </p>

      <!-- Config Key -->
      <code class="text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
        {{ config.key }}
      </code>

      <!-- Metadata -->
      <div v-if="config.updatedAt" class="mt-2 text-xs text-gray-400 dark:text-gray-500">
        Last updated: {{ formatDate(config.updatedAt) }}
        <span v-if="config.updatedBy"> by {{ config.updatedBy }}</span>
      </div>
    </div>

    <!-- Value Editor -->
    <div class="flex items-center gap-2">
      <!-- Boolean Toggle -->
      <UToggle
        v-if="config.type === 'boolean'"
        :model-value="localValue"
        :disabled="!config.isEditable || saving"
        @update:model-value="handleBooleanChange"
      />

      <!-- Number Input -->
      <div v-else-if="config.type === 'number'" class="flex items-center gap-2">
        <UInput
          v-model="localValue"
          type="number"
          :min="config.validation?.min"
          :max="config.validation?.max"
          :disabled="!config.isEditable || saving"
          class="w-32"
          @blur="handleInputChange"
        />
      </div>

      <!-- String Input -->
      <div v-else-if="config.type === 'string'" class="flex items-center gap-2">
        <UInput
          v-model="localValue"
          type="text"
          :disabled="!config.isEditable || saving"
          :placeholder="String(config.defaultValue)"
          class="w-64"
          @blur="handleInputChange"
        />
      </div>

      <!-- Reset Button -->
      <UTooltip text="Reset to default">
        <UButton
          icon="i-heroicons-arrow-uturn-left"
          color="gray"
          variant="ghost"
          size="sm"
          :disabled="!config.isEditable || saving || isDefaultValue"
          :loading="resetting"
          @click="handleReset"
        />
      </UTooltip>

      <!-- Save Indicator -->
      <div v-if="saving" class="flex items-center gap-1 text-xs text-gray-500">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
        <span>Saving...</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SiteConfigItem } from '~/shared/types/site-config';

const props = defineProps<{
  config: SiteConfigItem;
}>();

const emit = defineEmits<{
  update: [key: string, value: any];
  reset: [key: string];
}>();

const localValue = ref(props.config.value);
const saving = ref(false);
const resetting = ref(false);

// Watch for external changes to config
watch(
  () => props.config.value,
  (newValue) => {
    localValue.value = newValue;
  }
);

const isDefaultValue = computed(() => {
  return JSON.stringify(localValue.value) === JSON.stringify(props.config.defaultValue);
});

async function handleBooleanChange(value: boolean) {
  localValue.value = value;
  await saveValue(value);
}

async function handleInputChange() {
  let value = localValue.value;

  // Convert number strings to actual numbers
  if (props.config.type === 'number' && typeof value === 'string') {
    value = parseFloat(value);
    if (isNaN(value)) {
      localValue.value = props.config.value;
      return;
    }
  }

  // Only save if value changed
  if (JSON.stringify(value) !== JSON.stringify(props.config.value)) {
    await saveValue(value);
  }
}

async function saveValue(value: any) {
  saving.value = true;
  try {
    emit('update', props.config.key, value);
    // Wait a bit for the parent to handle the update
    await new Promise((resolve) => setTimeout(resolve, 500));
  } finally {
    saving.value = false;
  }
}

async function handleReset() {
  resetting.value = true;
  try {
    emit('reset', props.config.key);
    await new Promise((resolve) => setTimeout(resolve, 500));
  } finally {
    resetting.value = false;
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
</script>
