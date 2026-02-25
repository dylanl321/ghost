<template>
  <div class="p-3">
    <div class="mb-3">
      <span class="text-sm text-gray-900 dark:text-gray-300">{{ label }} ({{ groups.length }})</span>
    </div>
    
    <div class="space-y-2">
      <div
        v-for="group in groups"
        :key="groupKey(group)"
        class="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-transparent"
      >
        <!-- Group Header -->
        <div 
          class="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded-t-lg min-h-[4rem]"
          @click="$emit('toggle-group', groupKey(group))"
        >
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <Icon
              :name="groupIcon(group)"
              class="w-4 h-4 flex-shrink-0"
              :class="groupIconColor(group)"
            />
            <div class="min-w-0">
              <div class="font-medium text-gray-900 dark:text-gray-200 truncate flex items-center gap-1">
                {{ groupDisplayName(group) }}
                <!-- Favorites help link (smart groups only) -->
                <UTooltip v-if="groupType === 'smart' && group.id === 'favorites'" text="Learn about favorites">
                  <NuxtLink to="/support/docs?topic=favorites-guide" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300" @click.stop>
                    <UIcon name="i-heroicons-question-mark-circle" class="w-3.5 h-3.5" />
                  </NuxtLink>
                </UTooltip>
              </div>
              <!-- Smart groups show a description line -->
              <div v-if="groupType === 'smart' && group.description" class="text-xs text-gray-600 dark:text-gray-400 truncate">
                {{ group.description }}
              </div>
              <div class="text-xs text-gray-600 dark:text-gray-400">{{ group.accounts.length }} accounts</div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="text-right flex flex-col space-y-1 items-end">
              <UTooltip text="Total Budget">
                <div class="text-xs text-gray-700 dark:text-gray-300">
                  {{ formatCurrency(group.totalBudget) }}
                </div>
              </UTooltip>
              <UTooltip text="Total Spend">
                <div class="text-xs text-green-400">
                  {{ formatCurrency(group.totalSpend) }}
                </div>
              </UTooltip>
              <UTooltip v-if="group.totalBudget > 0" text="Group Utilization">
                <div class="text-xs" :class="utilizationColorClass(group)">
                  {{ ((group.totalSpend / group.totalBudget) * 100).toFixed(2) }}%
                </div>
              </UTooltip>
            </div>
            <UTooltip text="Select Group">
              <UButton
                size="xs"
                variant="ghost"
                color="blue"
                icon="i-heroicons-check-circle"
                class="px-2"
                @click.stop="$emit('select-group', group.accounts.map((acc: any) => getAccountKey(acc)))"
              />
            </UTooltip>
          </div>
        </div>
        
        <!-- Expanded Account List -->
        <div v-if="expandedGroups.has(groupKey(group))" class="px-3 pb-3">
          <div class="space-y-1 ml-4 border-l border-gray-200 dark:border-gray-600 pl-3">
            <SidebarAccountItem
              v-for="account in group.accounts"
              :key="getAccountKey(account)"
              :account="account"
              :account-key="getAccountKey(account)"
              :selected="selectedAccounts.includes(getAccountKey(account))"
              :budget="getBudget(account)"
              :spend="getSpend(account)"
              :format-currency="formatCurrency"
              @toggle="(key: string) => $emit('toggle-account', key)"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SidebarGroupList - Reusable sidebar group component for LOB, Department, and Smart group tabs.
 * Renders a list of groups with expand/collapse, budget/spend summary, and nested account items.
 */
import SidebarAccountItem from '~/components/costs/SidebarAccountItem.vue'

interface GroupBase {
  name: string
  accounts: any[]
  totalBudget: number
  totalSpend: number
  // Smart group extensions
  id?: string
  description?: string
  icon?: string
  iconColor?: string
}

const props = defineProps<{
  /** The list of group objects to render */
  groups: GroupBase[]
  /** Set of currently expanded group keys (e.g. 'lob-Finance') */
  expandedGroups: Set<string>
  /** All currently selected account IDs */
  selectedAccounts: string[]
  /** Currency formatting function */
  formatCurrency: (value: number) => string
  /** Group type discriminator for key prefix and icon selection */
  groupType: 'lob' | 'department' | 'smart'
  /** Display label shown above the list, e.g. "Lines of Business" */
  label: string
  /** Default icon name when groupType is lob or department */
  defaultIcon?: string
  /** Default icon color class when groupType is lob or department */
  defaultIconColor?: string
  /** Helper to extract the account key from an account object */
  getAccountKey: (account: any) => string
  /** Helper to extract budget from an account object */
  getBudget: (account: any) => number
  /** Helper to extract spend from an account object */
  getSpend: (account: any) => number
}>()

defineEmits<{
  /** Emitted when a group header is clicked to expand/collapse */
  'toggle-group': [groupKey: string]
  /** Emitted when the "Select Group" button is clicked, with account IDs in the group */
  'select-group': [accountIds: string[]]
  /** Emitted when an individual account is toggled */
  'toggle-account': [accountKey: string]
}>()

/**
 * Builds the expansion key for a group. Uses group.id for smart groups,
 * group.name for lob/department, prefixed with the groupType.
 */
function groupKey(group: GroupBase): string {
  const identifier = props.groupType === 'smart' ? (group.id ?? group.name) : group.name
  return `${props.groupType === 'department' ? 'dept' : props.groupType}-${identifier}`
}

/** Returns the display name, with a fallback for lob/department groups */
function groupDisplayName(group: GroupBase): string {
  if (props.groupType === 'lob') return group.name || 'Unknown LOB'
  if (props.groupType === 'department') return group.name || 'Unknown Dept'
  return group.name
}

/** Returns the icon for a group; smart groups have per-group icons */
function groupIcon(group: GroupBase): string {
  if (props.groupType === 'smart' && group.icon) return group.icon
  return props.defaultIcon ?? 'i-heroicons-squares-2x2'
}

/** Returns the icon color class for a group; smart groups have per-group colors */
function groupIconColor(group: GroupBase): string {
  if (props.groupType === 'smart' && group.iconColor) return group.iconColor
  return props.defaultIconColor ?? 'text-gray-400'
}

/** Returns the Tailwind color class for budget utilization */
function utilizationColorClass(group: GroupBase): string {
  if (group.totalSpend > group.totalBudget) return 'text-red-400'
  if (group.totalSpend > group.totalBudget * 0.9) return 'text-yellow-400'
  return 'text-green-400'
}
</script>
