<template>
  <div class="account-info">
    <h3 class="text-lg font-bold mb-4">
      <UIcon name="i-heroicons-building-office-2" class="mr-2" /> Account Information
    </h3>
    <div v-if="pending" class="flex justify-center">
      <UIcon name="i-heroicons-arrow-path" class="animate-spin" />
    </div>
    <div v-else class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Primary Info Card -->
      <UCard class="col-span-2 bg-gray-800">
        <template #header>
          <div class="flex items-center justify-between">
            <h4 class="font-semibold">{{ accountInfo?.org_Name }}</h4>
            <UBadge :color="getStatusColor(accountInfo?.org_Status)">
              {{ accountInfo?.org_Status }}
            </UBadge>
          </div>
        </template>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <UIcon name="i-heroicons-identification" class="mr-2" />
            <span class="text-gray-400">Account ID:</span>
            <p class="font-mono">{{ accountInfo?.org_Id }}</p>
          </div>
          <div>
            <UIcon name="i-heroicons-envelope" class="mr-2" />
            <span class="text-gray-400">Email:</span>
            <p>{{ accountInfo?.org_Email }}</p>
          </div>
        </div>

        <UDivider />

        <div class="space-y-1">
          <p class="text-xs text-gray-500">Intended Use:</p>
          <div class="p-2 bg-gray-800/50 rounded border border-gray-700">
            <p class="text-sm text-gray-300">
              {{ accountInfo?.dynamo_intendedUse || 'No intended use specified' }}
            </p>
          </div>
        </div>
      </UCard>

      <!-- Quick Stats Card -->
      <UCard class="bg-gray-800">
        <template #header>
          <h4 class="font-semibold">Quick Stats</h4>
        </template>

        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <span>Est. Monthly Cost</span>
            <UBadge color="yellow" variant="solid">
              ${{ accountInfo?.dynamo_estimatedMonthlyCharge }}
            </UBadge>
          </div>
          <div class="flex items-center justify-between">
            <span>Platform Type</span>
            <UBadge color="blue">
              {{ accountInfo?.dynamo_platformType }}
            </UBadge>
          </div>
          <div class="flex items-center justify-between">
            <span>Data Type</span>
            <UBadge :color="getDataTypeColor(accountInfo?.dynamo_dataType)">
              {{ accountInfo?.dynamo_dataType }}
            </UBadge>
          </div>
        </div>
      </UCard>

      <!-- Project Details -->
      <UCard class="bg-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-briefcase" />
            <h4 class="font-semibold">Project Details</h4>
          </div>
        </template>

        <div class="space-y-3">
          <div>
            <span class="text-gray-400">Project Name:</span>
            <p class="font-semibold">{{ accountInfo?.dynamo_projectName }}</p>
          </div>
          <div class="flex gap-2">
            <UBadge>{{ accountInfo?.dynamo_projectType }}</UBadge>
            <UBadge>{{ accountInfo?.dynamo_linesOfBusiness }}</UBadge>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <span class="text-gray-400">Project #:</span>
              <p>{{ accountInfo?.dynamo_projectNumber }}</p>
            </div>
            <div>
              <span class="text-gray-400">Task #:</span>
              <p>{{ accountInfo?.dynamo_taskNumber }}</p>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Network Configuration -->
      <UCard class="bg-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-server" />
            <h4 class="font-semibold">Network Configuration</h4>
          </div>
        </template>

        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <UBadge :color="accountInfo?.dynamo_isDirectConnect ? 'green' : 'gray'">
              {{ accountInfo?.dynamo_isDirectConnect ? 'Direct Connect' : 'No Direct Connect' }}
            </UBadge>
            <UBadge color="blue">{{ accountInfo?.dynamo_dc_region }}</UBadge>
          </div>
          <div>
            <span class="text-gray-400">CIDR:</span>
            <p class="font-mono">{{ accountInfo?.dynamo_dc_cidr }}</p>
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div>
              <span class="text-gray-400">Subnet Mask:</span>
              <p>/{{ accountInfo?.dynamo_dc_subnet_mask }}</p>
            </div>
            <div>
              <span class="text-gray-400">TGW Subnet:</span>
              <p>/{{ accountInfo?.dynamo_dc_tgw_subnet_mask }}</p>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Account Administrators -->
      <UCard class="bg-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-users" />
            <h4 class="font-semibold">Account Administrators</h4>
          </div>
        </template>

        <div class="space-y-4">
          <div v-for="admin in administrators" :key="admin.role" class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UserAvatar 
                :user-principal-name="admin.email"
                :display-name="admin.name"
                size="sm" 
                class="flex-shrink-0"
              />
              <div>
                <NuxtLink :to="`/account/explorer?search=${encodeURIComponent(admin.searchTerm)}&type=admin`"
                  class="font-semibold hover:text-primary-400 transition-colors"
                  :title="`View all accounts managed by ${admin.name}`">
                  {{ admin.name }}
                </NuxtLink>
                <p class="text-sm text-gray-400">{{ admin.role }}</p>
              </div>
            </div>
            <UButton color="gray" variant="ghost" icon="i-heroicons-envelope" size="xs" :to="`mailto:${admin.email}`"
              target="_blank" />
          </div>
        </div>
      </UCard>

      <!-- Account IDs -->
      <UCard class="bg-gray-800">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-key" />
            <h4 class="font-semibold">Account Identifiers</h4>
          </div>
        </template>

        <div class="space-y-3">
          <div>
            <span class="text-gray-400">Standard Account:</span>
            <p class="font-mono">{{ accountInfo?.dynamo_awsStandardAccountID }}</p>
          </div>
          <div>
            <span class="text-gray-400">GovCloud Account:</span>
            <p class="font-mono">{{ accountInfo?.dynamo_awsGovCloudAccountID }}</p>
          </div>
          <div>
            <span class="text-gray-400">Department:</span>
            <p>{{ accountInfo?.dynamo_departmentNumber }}</p>
          </div>
          <div>
            <span class="text-gray-400">Account Alias:</span>
            <p>{{ accountInfo?.dynamo_accountAlias }}</p>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import UserAvatar from '~/components/ui/UserAvatar.vue';
import TotalCost from '~/components/accounts/TotalCost.vue';
import CostDashboard from '~/components/accounts/CostDashboard.vue';
import ResourceUsage from '~/components/accounts/ResourceUsage.vue';

const props = defineProps({
  accountId: {
    type: String,
    required: true,
  },
});

const pending = ref(true);
const accountInfo = ref(null);

const emit = defineEmits(['update:accountInfo']);

const fetchAccountInfo = async () => {
  try {
    console.log('Fetching account info for:', props.accountId);
    const response = await fetch(`/api/get-account-info-complete?accountId=${props.accountId}`);
    console.log('Response status:', response.status);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Received account info:', data);

    accountInfo.value = data;
  } catch (error) {
    console.error('Error fetching account info:', error);
  } finally {
    pending.value = false;
  }
};

const formatUserName = (username) => {
  if (!username) return '';
  const [first, last] = username.split('.');
  return `${capitalize(first)} ${capitalize(last)}`;
};

const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);

const mailtoLink = (username) => {
  if (!username) return '';
  return `mailto:${username}@gd-ms.com`;
};

const administrators = computed(() => {
  if (!accountInfo.value) return [];
  return [
    {
      name: accountInfo.value.dynamo_primaryAccountAdminName,
      email: accountInfo.value.dynamo_primaryAccountAdminUsername + '@gd-ms.com',
      username: accountInfo.value.dynamo_primaryAccountAdminUsername,
      searchTerm: accountInfo.value.dynamo_primaryAccountAdminUsername?.toLowerCase(),
      role: 'Primary Admin'
    },
    {
      name: accountInfo.value.dynamo_delegateAccountAdminName,
      email: accountInfo.value.dynamo_delegateAccountAdminUsername + '@gd-ms.com',
      username: accountInfo.value.dynamo_delegateAccountAdminUsername,
      searchTerm: accountInfo.value.dynamo_delegateAccountAdminUsername?.toLowerCase(),
      role: 'Delegate Admin'
    },
    {
      name: accountInfo.value.dynamo_costManagerName,
      email: accountInfo.value.dynamo_costManagerUsername + '@gd-ms.com',
      username: accountInfo.value.dynamo_costManagerUsername,
      searchTerm: accountInfo.value.dynamo_costManagerUsername?.toLowerCase(),
      role: 'Cost Manager'
    }
  ];
});

const getStatusColor = (status) => {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'green';
    case 'suspended':
      return 'yellow';
    case 'pending':
      return 'blue';
    default:
      return 'gray';
  }
};

const getDataTypeColor = (type) => {
  switch (type?.toLowerCase()) {
    case 'cui':
      return 'red';
    case 'non-sensitive':
      return 'green';
    default:
      return 'gray';
  }
};

onMounted(() => {
  fetchAccountInfo();
});
</script>

<style scoped>
.account-info {
  max-width: 1200px;
  margin: auto;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}
</style>
