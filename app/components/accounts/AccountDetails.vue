<template>
  <UCard>
    <template #header>
      <div class="text-lg font-semibold">Account Details</div>
    </template>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
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
          <AccountDetailsRow label="Current Spend" :value="formatCurrency(currentSpend, 0)" />
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

        <div class="space-y-2 text-sm">
          <AccountDetailsRow label="Primary Admin" :value="enclave?.primaryAccountAdminUsername" />
          <AccountDetailsRow label="Delegate Admin" :value="enclave?.delegateAccountAdminUsername" />
          <AccountDetailsRow label="Cost Manager" :value="enclave?.costManagerUsername" />
        </div>
      </UCard>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const enclaveStore = useEnclaveStore()

// Assume accountId is passed as prop or pulled from route
const props = defineProps<{ accountId: string }>()

const enclave = computed(() => enclaveStore.enclaves[props.accountId])

// Placeholder values for cost details until API is wired in
const currentSpend = 120000
const utilization = computed(() => {
  const budget = Number(enclave.value?.estimatedMonthlyCharge) || 0
  return budget > 0 ? ((currentSpend / budget) * 100).toFixed(1) : '0'
})

</script>
