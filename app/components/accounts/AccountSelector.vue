<template>
  <div class="w-full">
    <UPopover :popper="{ placement: 'bottom-end' }" mode="click">
      <UButton
        color="gray"
        variant="soft"
        class="w-full md:w-64 justify-between"
      >
        <div class="flex items-center gap-2 truncate">
          <UIcon name="i-heroicons-building-office" />
          <span class="truncate">Select Account</span>
        </div>
        <UIcon name="i-heroicons-chevron-down" />
      </UButton>

      <template #panel="{ close }">
        <div class="w-full md:w-80 p-2 bg-gray-900 border border-gray-700 rounded-lg shadow-lg">
          <!-- Search Input -->
          <UInput
            v-model="searchQuery"
            color="white"
            variant="outline"
            icon="i-heroicons-magnifying-glass"
            placeholder="Search accounts..."
            class="mb-2"
          />
          
          <!-- Account List -->
          <div class="max-h-64 overflow-y-auto">
            <UButton
              v-for="account in filteredAccounts"
              :key="account.id"
              color="gray"
              variant="ghost"
              class="w-full justify-start mb-1 truncate"
              @click="selectAccount(account, close)"
            >
              <div class="flex items-center gap-2 w-full">
                <UIcon name="i-heroicons-building-office" class="flex-shrink-0" />
                <div class="truncate">
                  <div class="font-medium truncate">{{ account.label }}</div>
                  <div class="text-xs text-gray-400 truncate">{{ account.id }}</div>
                </div>
              </div>
            </UButton>
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const accounts = ref([]);
const searchQuery = ref('');

const filteredAccounts = computed(() => {
  const query = searchQuery.value.toLowerCase();
  return accounts.value.filter(account => 
    account.label.toLowerCase().includes(query) || 
    account.id.includes(query)
  );
});

async function fetchAccounts() {
  try {
    const response = await fetch('/api/list-accounts');
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
    const data = await response.json();
    accounts.value = data.map(account => ({
      id: account.Id,
      label: account.Name,
    }));
  } catch (error) {
    console.error('Error fetching account info:', error);
  }
}

function selectAccount(account, close) {
  router.push(`/account/${account.id}`);
  close();
}

onMounted(() => {
  fetchAccounts();
});
</script>

<style scoped>
.max-h-64 {
  max-height: 16rem;
}

/* Custom scrollbar for the account list */
.max-h-64::-webkit-scrollbar {
  width: 6px;
}

.max-h-64::-webkit-scrollbar-track {
  background: transparent;
}

.max-h-64::-webkit-scrollbar-thumb {
  background: #4B5563;
  border-radius: 3px;
}

.max-h-64::-webkit-scrollbar-thumb:hover {
  background: #6B7280;
}
</style>