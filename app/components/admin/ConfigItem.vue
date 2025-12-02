<template>
  <UCard class="hover:shadow-md transition-all duration-200 group">
    <div class="space-y-3">
      <!-- Header with icon and label -->
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <UIcon
            :name="getTypeIcon(config.type)"
            class="text-lg text-gray-400 dark:text-gray-500 flex-shrink-0"
          />
          <h4 class="font-semibold text-sm text-gray-900 dark:text-white truncate">
            {{ config.label }}
          </h4>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <UBadge
            v-if="!config.isPublic"
            color="orange"
            variant="soft"
            size="xs"
          >
            Admin
          </UBadge>
          <UBadge
            v-if="!isDefaultValue"
            color="blue"
            variant="soft"
            size="xs"
          >
            Modified
          </UBadge>
        </div>
      </div>

      <!-- Description -->
      <p v-if="config.description" class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
        {{ config.description }}
      </p>
      <p v-else class="text-xs text-gray-400 italic">
        No description available
      </p>

      <!-- Value Editor -->
      <div v-if="config.type" class="pt-2 border-t border-gray-100 dark:border-gray-800">
        <!-- Boolean Toggle -->
        <div v-if="config.type === 'boolean'" class="flex items-center justify-between">
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300">
            {{ localValue ? 'Enabled' : 'Disabled' }}
          </span>
          <UToggle
            :model-value="localValue"
            :disabled="!config.isEditable || saving"
            @update:model-value="handleBooleanChange"
          />
        </div>

        <!-- Number Input -->
        <div v-else-if="config.type === 'number'" class="space-y-1">
          <label class="text-xs font-medium text-gray-700 dark:text-gray-300">Value</label>
          <UInput
            v-model="localValue"
            type="number"
            :min="config.validation?.min"
            :max="config.validation?.max"
            :disabled="!config.isEditable || saving"
            size="sm"
            @blur="handleInputChange"
          />
          <p v-if="config.validation?.min !== undefined || config.validation?.max !== undefined" class="text-xs text-gray-400">
            Range: {{ config.validation?.min ?? '∞' }} - {{ config.validation?.max ?? '∞' }}
          </p>
        </div>

        <!-- String Input -->
        <div v-else-if="config.type === 'string'" class="space-y-1">
          <label class="text-xs font-medium text-gray-700 dark:text-gray-300">Value</label>
          <UInput
            v-model="localValue"
            type="text"
            :disabled="!config.isEditable || saving"
            :placeholder="String(config.defaultValue)"
            size="sm"
            @blur="handleInputChange"
          />
        </div>

        <!-- Unknown/Unsupported Type -->
        <div v-else class="text-xs text-gray-500 italic">
          Unsupported config type: {{ config.type }}
          <div class="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded">
            <code class="text-xs">{{ JSON.stringify(config.value) }}</code>
          </div>
        </div>
      </div>

      <!-- No type specified -->
      <div v-else class="pt-2 border-t border-gray-100 dark:border-gray-800">
        <p class="text-xs text-red-500">
          Error: Configuration type not specified
        </p>
      </div>

      <!-- Footer with actions and metadata -->
      <div class="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <!-- Config Key -->
          <code class="text-xs text-gray-500 dark:text-gray-400 truncate">
            {{ config.key }}
          </code>
        </div>

        <div class="flex items-center gap-1 flex-shrink-0">
          <!-- Save Indicator -->
          <div v-if="saving" class="flex items-center gap-1 text-xs text-primary-500 mr-2">
            <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
            <span>Saving</span>
          </div>

          <!-- Reset Button -->
          <UTooltip text="Reset to default">
            <UButton
              icon="i-heroicons-arrow-uturn-left"
              color="gray"
              variant="ghost"
              size="xs"
              :disabled="!config.isEditable || saving || isDefaultValue"
              :loading="resetting"
              @click="handleReset"
            />
          </UTooltip>
        </div>
      </div>

      <!-- Metadata tooltip on hover -->
      <div v-if="config.updatedAt" class="text-xs text-gray-400 dark:text-gray-500">
        Updated {{ formatDate(config.updatedAt) }}
        <span v-if="config.updatedBy"> by {{ config.updatedBy }}</span>
      </div>
    </div>
  </UCard>
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

function getTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    boolean: 'i-heroicons-check-circle',
    number: 'i-heroicons-hashtag',
    string: 'i-heroicons-document-text',
    object: 'i-heroicons-cube',
    array: 'i-heroicons-queue-list',
  };
  return icons[type] || 'i-heroicons-cog';
}
</script>
