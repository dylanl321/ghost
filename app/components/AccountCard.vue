<template>
  <UCard class="w-full max-w-md">
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UBadge 
            :color="statusColor" 
            variant="soft"
            size="sm"
          >
            {{ account.accountStatus }}
          </UBadge>
          
          <UBadge 
            v-if="account.hasGovCloud"
            color="info" 
            variant="soft"
            size="sm"
          >
            GovCloud
          </UBadge>
        </div>
        
        <div v-if="showActions" class="flex gap-1">
          <button 
            @click="$emit('view-details', account)"
            class="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            title="View Details"
          >
            👁️
          </button>
          <button 
            @click="$emit('edit-account', account)"
            class="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            title="Edit Account"
          >
            ✏️
          </button>
          <button 
            @click="$emit('delete-account', account)"
            class="p-1 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            title="Delete Account"
          >
            🗑️
          </button>
        </div>
      </div>
    </template>

    <div class="space-y-4">
      <!-- Account Name & Email -->
      <div>
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ account.accountName || 'Unnamed Account' }}
        </h3>
        <p class="text-sm text-gray-600 dark:text-gray-300">
          {{ account.accountEmail || 'No email provided' }}
        </p>
      </div>

      <!-- Account IDs -->
      <div class="space-y-2">
        <div class="flex justify-between items-center">
          <span class="text-sm font-medium text-gray-500 dark:text-gray-400">Account ID</span>
          <UBadge variant="outline" size="sm">
            {{ account.accountId }}
          </UBadge>
        </div>
        
        <div v-if="account.govCloudAccountId" class="flex justify-between items-center">
          <span class="text-sm font-medium text-gray-500 dark:text-gray-400">GovCloud ID</span>
          <UBadge color="info" variant="outline" size="sm">
            {{ account.govCloudAccountId }}
          </UBadge>
        </div>
      </div>

      <!-- Environment & Project -->
      <div v-if="account.environment || account.projectCode" class="grid grid-cols-2 gap-3">
        <div v-if="account.environment" class="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400">Environment</div>
          <div class="text-sm font-semibold capitalize">{{ account.environment }}</div>
        </div>
        
        <div v-if="account.projectCode" class="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div class="text-xs text-gray-500 dark:text-gray-400">Project</div>
          <div class="text-sm font-semibold">{{ account.projectCode }}</div>
        </div>
      </div>

      <!-- Organization Unit -->
      <div v-if="account.organizationalUnit">
        <div class="flex justify-between items-center">
          <span class="text-sm font-medium text-gray-500 dark:text-gray-400">Organization Unit</span>
          <span class="text-sm text-gray-900 dark:text-white">{{ account.organizationalUnit }}</span>
        </div>
      </div>

      <!-- Contacts -->
      <div v-if="account.technicalContact || account.businessContact" class="space-y-2">
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Contacts</h4>
        
        <div v-if="account.technicalContact" class="flex justify-between items-center">
          <span class="text-xs text-gray-500 dark:text-gray-400">Technical</span>
          <span class="text-xs text-gray-700 dark:text-gray-300">{{ account.technicalContact }}</span>
        </div>
        
        <div v-if="account.businessContact" class="flex justify-between items-center">
          <span class="text-xs text-gray-500 dark:text-gray-400">Business</span>
          <span class="text-xs text-gray-700 dark:text-gray-300">{{ account.businessContact }}</span>
        </div>
      </div>
    </div>

    <template #footer v-if="showFooter">
      <div class="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
        <span v-if="account.createdDate">
          Created: {{ formatDate(account.createdDate) }}
        </span>
        <span v-if="account.modifiedDate">
          Updated: {{ formatDate(account.modifiedDate) }}
        </span>
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AccountInfo } from '../../server/types/aws'

export interface Props {
  account: AccountInfo
  showActions?: boolean
  showFooter?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showActions: true,
  showFooter: true
})

const emit = defineEmits<{
  'view-details': [account: AccountInfo]
  'edit-account': [account: AccountInfo]
  'delete-account': [account: AccountInfo]
}>()

const statusColor = computed(() => {
  switch (props.account.accountStatus?.toLowerCase()) {
    case 'active': return 'success'
    case 'suspended': return 'warning'
    case 'closed': return 'error'
    default: return 'neutral'
  }
})

const formatDate = (dateString: string) => {
  try {
    return new Date(dateString).toLocaleDateString()
  } catch {
    return dateString
  }
}
</script>