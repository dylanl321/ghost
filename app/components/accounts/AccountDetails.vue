<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="text-sm font-semibold text-gray-900 dark:text-white">Account Details</div>

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

    <UTabs v-model="selectedTab" :items="tabs">
      <!-- General Tab -->
      <template #general>
        <div class="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6 pt-4">
          <!-- Project Details -->
          <UCard class="bg-gray-50 dark:bg-gray-800/50 md:row-span-2">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-briefcase" class="text-blue-500 w-5 h-5" />
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Project Details</h4>
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
          <UCard class="bg-gray-50 dark:bg-gray-800/50">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-shield-check" class="text-blue-500 w-5 h-5" />
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Platform Info</h4>
              </div>
            </template>

            <div class="space-y-2 text-sm">
              <AccountDetailsRow label="Department #" :value="enclave?.departmentNumber" />
              <AccountDetailsRow label="Platform" :value="enclave?.platformType" />
              <AccountDetailsRow label="Approved Data Type" :value="enclave?.approvedDataType" />
            </div>
          </UCard>

          <!-- Cost Details -->
          <UCard class="bg-gray-50 dark:bg-gray-800/50">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-currency-dollar" class="text-green-500 w-5 h-5" />
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Cost Details</h4>
              </div>
            </template>

            <div class="space-y-2 text-sm">
              <AccountDetailsRow label="Budget" :value="formatCurrency(getMonthlyBudget(enclave), 0)" />
              <AccountDetailsRow label="Current Spend (Proforma)" :value="formatCurrency(props.currentSpend, 0)" />
              <AccountDetailsRow label="Utilization" :value="utilization + '%'" />
            </div>
          </UCard>

          <!-- Network Config -->
          <UCard class="bg-gray-50 dark:bg-gray-800/50">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-server" class="text-purple-500 w-5 h-5" />
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Network Configuration</h4>
              </div>
            </template>

            <div class="space-y-2 text-sm">
              <AccountDetailsRow label="Direct Connect VPC CIDR" :value="enclave?.dc_cidr" />
              <AccountDetailsRow label="Subnet Mask" :value="enclave?.dc_subnet_mask ? '/' + enclave.dc_subnet_mask : undefined" />
              <AccountDetailsRow label="TGW Subnet Mask" :value="enclave?.dc_tgw_subnet_mask ? '/' + enclave.dc_tgw_subnet_mask : undefined" />
            </div>
          </UCard>

          <!-- Account Admins -->
          <UCard class="bg-gray-50 dark:bg-gray-800/50">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-user-group" class="text-orange-500 w-5 h-5" />
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Account Admins</h4>
              </div>
            </template>

            <div class="space-y-3 text-sm">
              <!-- Primary Admin -->
              <div v-if="enclave?.primaryAccountAdminUsername" class="flex items-center gap-2 gap-y-2 flex-wrap">
                <span class="text-gray-600 dark:text-gray-400 text-xs min-w-[60px]">Primary:</span>
                <NuxtLink
                  :to="`/account/user/${convertToUsernameSlug(enclave.primaryAccountAdminUsername)}`"
                  class="flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                >
                  <UserAvatar
                    :user-principal-name="`${enclave.primaryAccountAdminUsername}@gd-ms.com`"
                    :display-name="formatUsername(enclave.primaryAccountAdminUsername)"
                    size="xs"
                    class="flex-shrink-0"
                  />
                  <span class="text-gray-900 dark:text-white truncate">{{ formatUsername(enclave.primaryAccountAdminUsername) }}</span>
                </NuxtLink>
              </div>

              <!-- Delegate Admin -->
              <div v-if="enclave?.delegateAccountAdminUsername" class="flex items-center gap-2 gap-y-2 flex-wrap">
                <span class="text-gray-600 dark:text-gray-400 text-xs min-w-[60px]">Delegate:</span>
                <NuxtLink
                  :to="`/account/user/${convertToUsernameSlug(enclave.delegateAccountAdminUsername)}`"
                  class="flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                >
                  <UserAvatar
                    :user-principal-name="`${enclave.delegateAccountAdminUsername}@gd-ms.com`"
                    :display-name="formatUsername(enclave.delegateAccountAdminUsername)"
                    size="xs"
                    class="flex-shrink-0"
                  />
                  <span class="text-gray-900 dark:text-white truncate">{{ formatUsername(enclave.delegateAccountAdminUsername) }}</span>
                </NuxtLink>
              </div>

              <!-- Cost Manager -->
              <div v-if="enclave?.costManagerUsername" class="flex items-center gap-2 gap-y-2 flex-wrap">
                <span class="text-gray-600 dark:text-gray-400 text-xs min-w-[60px]">Cost Mgr:</span>
                <NuxtLink
                  :to="`/account/user/${convertToUsernameSlug(enclave.costManagerUsername)}`"
                  class="flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                >
                  <UserAvatar
                    :user-principal-name="`${enclave.costManagerUsername}@gd-ms.com`"
                    :display-name="formatUsername(enclave.costManagerUsername)"
                    size="xs"
                    class="flex-shrink-0"
                  />
                  <span class="text-gray-900 dark:text-white truncate">{{ formatUsername(enclave.costManagerUsername) }}</span>
                </NuxtLink>
              </div>
            </div>
          </UCard>
        </div>
      </template>

      <!-- IT PEP Data Tab -->
      <template #it-pep-data>
        <div class="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6 pt-4">
          <!-- Environment Info -->
          <UCard class="bg-gray-50 dark:bg-gray-800/50">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-server-stack" class="text-blue-500 w-5 h-5" />
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Environment Info</h4>
              </div>
            </template>

            <div class="space-y-2 text-sm">
              <AccountDetailsRow label="Environment Name" :value="enclave?.pepEnvironmentName" />
              <AccountDetailsRow label="Environment Status" :value="enclave?.pepEnvironmentStatus" />
              <AccountDetailsRow label="Active" :value="enclave?.pepActive === true ? 'Yes' : enclave?.pepActive === false ? 'No' : undefined" />
              <AccountDetailsRow label="Network Type" :value="enclave?.pepNetworkType" />
              <AccountDetailsRow label="Classification Level" :value="enclave?.pepClassificationLevel" />
              <AccountDetailsRow label="Shared Environment" :value="enclave?.pepSharedEnvironment === true ? 'Yes' : enclave?.pepSharedEnvironment === false ? 'No' : undefined" />
            </div>
          </UCard>

          <!-- Location -->
          <UCard class="bg-gray-50 dark:bg-gray-800/50">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-map-pin" class="text-red-500 w-5 h-5" />
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Location</h4>
              </div>
            </template>

            <div class="space-y-2 text-sm">
              <AccountDetailsRow label="Address" :value="enclave?.pepLocationAddress" />
              <AccountDetailsRow label="State" :value="enclave?.pepLocationState" />
              <AccountDetailsRow label="Cloud Address ID" :value="enclave?.pepLocationCloudAddressID" />
            </div>
          </UCard>

          <!-- Contract Details -->
          <UCard class="bg-gray-50 dark:bg-gray-800/50">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-document-text" class="text-yellow-500 w-5 h-5" />
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Contract Details</h4>
              </div>
            </template>

            <div class="space-y-2 text-sm">
              <AccountDetailsRow label="Contract Header ID" :value="enclave?.pepContractHeaderID" />
              <AccountDetailsRow label="Contract Number" :value="enclave?.pepContractNumber" />
              <AccountDetailsRow label="Contract Alias" :value="enclave?.pepContractAlias" />
              <AccountDetailsRow label="Contract Type" :value="enclave?.pepContractType" />
              <AccountDetailsRow label="Contract LOB" :value="enclave?.pepContractLineOfBusiness" />
            </div>
          </UCard>

          <!-- Business Info -->
          <UCard class="bg-gray-50 dark:bg-gray-800/50">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-building-office-2" class="text-indigo-500 w-5 h-5" />
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Business Info</h4>
              </div>
            </template>

            <div class="space-y-2 text-sm">
              <AccountDetailsRow label="Cloud Type" :value="enclave?.pepCloudType" />
              <AccountDetailsRow label="Program Type" :value="enclave?.pepProgramType" />
              <AccountDetailsRow label="Business Area" :value="enclave?.pepBusinessArea" />
              <AccountDetailsRow label="Charge Type" :value="enclave?.pepChargeType" />
              <AccountDetailsRow label="Department" :value="enclave?.pepDepartment" />
              <AccountDetailsRow label="Line of Business" :value="enclave?.pepLob" />
            </div>
          </UCard>

          <!-- Budget -->
          <UCard class="bg-gray-50 dark:bg-gray-800/50 md:row-span-2">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-banknotes" class="text-green-500 w-5 h-5" />
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Budget</h4>
              </div>
            </template>

            <div class="space-y-3 text-sm">
              <AccountDetailsRow label="Budget Year" :value="enclave?.pepBudgetLatestYear" />
              <AccountDetailsRow label="Annual Total" :value="enclave?.pepBudget2026AnnualTotal ? formatCurrency(enclave.pepBudget2026AnnualTotal, 0) : undefined" />

              <!-- Monthly Budget Breakdown -->
              <div v-if="monthlyBudget && Object.keys(monthlyBudget).length > 0">
                <span class="text-gray-600 dark:text-gray-400">Monthly Breakdown:</span>
                <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  <div v-for="(amount, month) in monthlyBudget" :key="month" class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">{{ month }}:</span>
                    <span class="font-mono">{{ formatCurrency(amount, 0) }}</span>
                  </div>
                </div>
              </div>
              <div v-else>
                <AccountDetailsRow label="Monthly Breakdown" :value="undefined" />
              </div>
            </div>
          </UCard>

          <!-- Personnel -->
          <UCard class="bg-gray-50 dark:bg-gray-800/50 md:row-span-2">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-users" class="text-orange-500 w-5 h-5" />
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Personnel</h4>
              </div>
            </template>

            <div class="space-y-3 text-sm">
              <!-- LAA Manager -->
              <div class="flex items-center gap-2 gap-y-2 flex-wrap">
                <span class="text-gray-600 dark:text-gray-400 text-xs min-w-[100px]">LAA Manager:</span>
                <template v-if="enclave?.pepLAAManager">
                  <NuxtLink
                    :to="`/account/user/${convertToUsernameSlug(enclave.pepLAAManager)}`"
                    class="flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                  >
                    <UserAvatar
                      :user-principal-name="`${enclave.pepLAAManager}@gd-ms.com`"
                      :display-name="enclave.pepLAAManagerName || formatUsername(enclave.pepLAAManager)"
                      size="xs"
                      class="flex-shrink-0"
                    />
                    <span class="text-gray-900 dark:text-white truncate">{{ enclave.pepLAAManagerName || formatUsername(enclave.pepLAAManager) }}</span>
                  </NuxtLink>
                </template>
                <span v-else class="font-mono">-</span>
              </div>

              <!-- PM Migration -->
              <div class="flex items-center gap-2 gap-y-2 flex-wrap">
                <span class="text-gray-600 dark:text-gray-400 text-xs min-w-[100px]">PM Migration:</span>
                <template v-if="enclave?.pepPMMigration">
                  <NuxtLink
                    :to="`/account/user/${convertToUsernameSlug(enclave.pepPMMigration)}`"
                    class="flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                  >
                    <UserAvatar
                      :user-principal-name="`${enclave.pepPMMigration}@gd-ms.com`"
                      :display-name="enclave.pepPMMigrationName || formatUsername(enclave.pepPMMigration)"
                      size="xs"
                      class="flex-shrink-0"
                    />
                    <span class="text-gray-900 dark:text-white truncate">{{ enclave.pepPMMigrationName || formatUsername(enclave.pepPMMigration) }}</span>
                  </NuxtLink>
                </template>
                <span v-else class="font-mono">-</span>
              </div>

              <!-- IT PPM -->
              <AccountDetailsRow label="IT PPM" :value="enclave?.pepITPPM" />

              <!-- Primary IT LAASA -->
              <AccountDetailsRow label="Primary IT LAASA" :value="enclave?.pepPrimaryITLAASA" />

              <!-- LAA Proposal Lead -->
              <AccountDetailsRow label="LAA Proposal Lead" :value="enclave?.pepLAAProposalLead" />

              <!-- Program Manager -->
              <AccountDetailsRow label="Program Manager" :value="enclave?.pepProgramManager" />

              <!-- Program CAM -->
              <AccountDetailsRow label="Program CAM" :value="enclave?.pepProgramCAM" />

              <!-- Program Environment Owner -->
              <AccountDetailsRow label="Env Owner" :value="enclave?.pepProgramEnvironmentOwner" />

              <!-- FSO -->
              <AccountDetailsRow label="FSO" :value="enclave?.pepFSO" />
            </div>
          </UCard>

          <!-- Project -->
          <UCard class="bg-gray-50 dark:bg-gray-800/50">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-folder" class="text-cyan-500 w-5 h-5" />
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Project</h4>
              </div>
            </template>

            <div class="space-y-2 text-sm">
              <AccountDetailsRow label="Project Number" :value="enclave?.pepProjectNumber" />
              <AccountDetailsRow label="Task Number" :value="enclave?.pepTaskNumber" />
              <AccountDetailsRow label="External Enclave ID" :value="enclave?.pepExternalEnclaveID" />
              <AccountDetailsRow label="External Source" :value="enclave?.pepExternalEnclaveSource" />
            </div>
          </UCard>

          <!-- Cloud Record -->
          <UCard class="bg-gray-50 dark:bg-gray-800/50">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-heroicons-cloud" class="text-sky-500 w-5 h-5" />
                <h4 class="text-sm font-semibold text-gray-900 dark:text-white">Cloud Record</h4>
              </div>
            </template>

            <div class="space-y-2 text-sm">
              <AccountDetailsRow label="Record Name" :value="enclave?.pepCloudRecordName" />
              <AccountDetailsRow label="Comment" :value="enclave?.pepCloudComment" />
            </div>
          </UCard>
        </div>
      </template>
    </UTabs>
  </UCard>
</template>

<script setup lang="ts">
import { convertToUsernameSlug, formatUsername } from '~/utils/userUtils'
import type { GraphUser } from '~/composables/useGroupMembers'
import { getMonthlyBudget } from '#shared/utils/budget-utils'

const enclaveStore = useEnclaveStore()

// Props
const props = defineProps<{
  accountId: string
  currentSpend: number
  users?: GraphUser[]
}>()

const enclave = computed(() => enclaveStore.enclaves[props.accountId])

// Tab state
const selectedTab = ref(0)
const tabs = [
  { label: 'General', slot: 'general', icon: 'i-heroicons-information-circle' },
  { label: 'IT PEP Data', slot: 'it-pep-data', icon: 'i-heroicons-document-text' }
]

const utilization = computed(() => {
  const budget = getMonthlyBudget(enclave.value)
  return budget > 0 ? ((props.currentSpend / budget) * 100).toFixed(1) : '0'
})

// Parse monthly budget JSON
const monthlyBudget = computed(() => {
  if (!enclave.value?.pepBudget2026Monthly) return null
  try {
    return JSON.parse(enclave.value.pepBudget2026Monthly) as Record<string, number>
  } catch {
    return null
  }
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
