<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="text-lg font-semibold">Account Details</div>

        <div class="flex items-center gap-2">
          <!-- Email Account Button -->
          <UButton
            v-if="enclave?.accountEmail"
            :to="getAccountEmailLink()"
            icon="i-heroicons-envelope"
            color="blue"
            variant="soft"
            size="sm"
            :title="`Email account: ${enclave.accountEmail}`"
          >
            Email Account
          </UButton>

          <!-- Email All Users Button -->
          <UButton
            v-if="allUsersEmails.length > 0"
            :to="getAllUsersEmailLink()"
            icon="i-heroicons-user-group"
            color="purple"
            variant="soft"
            size="sm"
            :title="`Email all ${allUsersEmails.length} account users`"
          >
            Email All Users
          </UButton>
        </div>
      </div>
    </template>

    <div class="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
      <!-- Project Details -->
      <UCard class="bg-gray-800 md:row-span-2">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-briefcase" class="text-blue-500 w-5 h-5" />
            <h4 class="font-semibold">Project Details</h4>
          </div>
        </template>

        <div class="space-y-2 text-sm">
          <AccountDetailsRow label="Project Name" :value="enclave?.projectName" />
          <AccountDetailsRow label="Standard Account ID" :value="enclave?.awsStandardAccountID" />
          <AccountDetailsRow label="GovCloud Account ID" :value="enclave?.awsGovCloudAccountID" />
          <AccountDetailsRow label="Email" :value="enclave?.accountEmail" />
          <AccountDetailsRow label="Request ID" :value="enclave?.requestID" />
          <AccountDetailsRow label="Intended Use" :value="enclave?.intendedUse" />
          <AccountDetailsRow label="Project Number" :value="enclave?.projectNumber" />
          <AccountDetailsRow label="Task Number" :value="enclave?.taskNumber" />
        </div>
      </UCard>

      <!-- Platform Info -->
      <UCard class="bg-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-shield-check" class="text-blue-200 w-5 h-5" />
            <h4 class="font-semibold">Platform Info</h4>
          </div>
        </template>

        <div class="space-y-2 text-sm">
          <AccountDetailsRow label="Department #" :value="enclave?.departmentNumber" />
          <AccountDetailsRow label="Platform" :value="enclave?.platformType" />
          <AccountDetailsRow label="Approved Data Type" :value="enclave?.approvedDataType" />
        </div>
      </UCard>

      <!-- Cost Details -->
      <UCard class="bg-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-currency-dollar" class="text-green-500 w-5 h-5" />
            <h4 class="font-semibold">Cost Details</h4>
          </div>
        </template>

        <div class="space-y-2 text-sm">
          <AccountDetailsRow label="Budget" :value="formatCurrency(parseInt(enclave?.estimatedMonthlyCharge || '0'), 0)" />
          <AccountDetailsRow label="Current Spend (Proforma)" :value="formatCurrency(props.currentSpend, 0)" />
          <AccountDetailsRow label="Utilization" :value="utilization + '%'" />
        </div>
      </UCard>

      <!-- Network Config -->
      <UCard class="bg-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-server" class="text-purple-500 w-5 h-5" />
            <h4 class="font-semibold">Network Configuration</h4>
          </div>
        </template>

        <div class="space-y-2 text-sm">
          <AccountDetailsRow label="Direct Connect VPC CIDR" :value="enclave?.dc_cidr" />
          <AccountDetailsRow label="Subnet Mask" :value="'/' + enclave?.dc_subnet_mask" />
          <AccountDetailsRow label="TGW Subnet Mask" :value="'/' + enclave?.dc_tgw_subnet_mask" />
        </div>
      </UCard>

      <!-- Account Admins -->
      <UCard class="bg-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-user-group" class="text-orange-500 w-5 h-5" />
            <h4 class="font-semibold">Account Admins</h4>
          </div>
        </template>

        <div class="space-y-3 text-sm">
          <!-- Primary Admin -->
          <div v-if="enclave?.primaryAccountAdminUsername" class="flex items-center gap-2 gap-y-2 flex-wrap">
            <span class="text-gray-400 text-xs min-w-[60px]">Primary:</span>
            <NuxtLink
              :to="`/account/user/${convertToUsernameSlug(enclave.primaryAccountAdminUsername)}`"
              class="flex items-center gap-2 hover:bg-gray-700 rounded"
            >
              <UserAvatar
                :user-principal-name="`${enclave.primaryAccountAdminUsername}@gd-ms.com`"
                :display-name="formatUsername(enclave.primaryAccountAdminUsername)"
                size="xs"
                class="flex-shrink-0"
              />
              <span class="text-white truncate">{{ formatUsername(enclave.primaryAccountAdminUsername) }}</span>
            </NuxtLink>
          </div>

          <!-- Delegate Admin -->
          <div v-if="enclave?.delegateAccountAdminUsername" class="flex items-center gap-2 gap-y-2 flex-wrap">
            <span class="text-gray-400 text-xs min-w-[60px]">Delegate:</span>
            <NuxtLink
              :to="`/account/user/${convertToUsernameSlug(enclave.delegateAccountAdminUsername)}`"
              class="flex items-center gap-2 hover:bg-gray-700 rounded"
            >
              <UserAvatar
                :user-principal-name="`${enclave.delegateAccountAdminUsername}@gd-ms.com`"
                :display-name="formatUsername(enclave.delegateAccountAdminUsername)"
                size="xs"
                class="flex-shrink-0"
              />
              <span class="text-white truncate">{{ formatUsername(enclave.delegateAccountAdminUsername) }}</span>
            </NuxtLink>
          </div>

          <!-- Cost Manager -->
          <div v-if="enclave?.costManagerUsername" class="flex items-center gap-2 gap-y-2 flex-wrap">
            <span class="text-gray-400 text-xs min-w-[60px]">Cost Mgr:</span>
            <NuxtLink
              :to="`/account/user/${convertToUsernameSlug(enclave.costManagerUsername)}`"
              class="flex items-center gap-2 hover:bg-gray-700 rounded"
            >
              <UserAvatar
                :user-principal-name="`${enclave.costManagerUsername}@gd-ms.com`"
                :display-name="formatUsername(enclave.costManagerUsername)"
                size="xs"
                class="flex-shrink-0"
              />
              <span class="text-white truncate">{{ formatUsername(enclave.costManagerUsername) }}</span>
            </NuxtLink>
          </div>
        </div>
      </UCard>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import { convertToUsernameSlug, formatUsername } from '~/utils/userUtils'
import type { GraphUser } from '~/composables/useGroupMembers'

const enclaveStore = useEnclaveStore()

// Props
const props = defineProps<{
  accountId: string
  currentSpend: number
  users?: GraphUser[]
}>()

const enclave = computed(() => enclaveStore.enclaves[props.accountId])

const utilization = computed(() => {
  const budget = Number(enclave.value?.estimatedMonthlyCharge) || 0
  return budget > 0 ? ((props.currentSpend / budget) * 100).toFixed(1) : '0'
})

// Email functionality
const allUsersEmails = computed(() => {
  if (!props.users || props.users.length === 0) return []
  return props.users
    .map(user => user.userPrincipalName)
    .filter(email => email && email.includes('@'))
})

const getAccountEmailLink = () => {
  if (!enclave.value?.accountEmail) return ''
  return `mailto:${enclave.value.accountEmail}?subject=Regarding AWS Account: ${enclave.value.projectName || props.accountId}`
}

const getAllUsersEmailLink = () => {
  if (allUsersEmails.value.length === 0) return ''
  const emails = allUsersEmails.value.join(',')
  const subject = `Regarding AWS Account: ${enclave.value?.projectName || props.accountId}`
  return `mailto:${emails}?subject=${encodeURIComponent(subject)}`
}

</script>
