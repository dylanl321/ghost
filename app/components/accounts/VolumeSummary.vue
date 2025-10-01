<template>
    <UCard class="w-full bg-gray-800">
      <template #header>
        <h4 class="font-semibold">Volume Optimization</h4>
      </template>
  
      <p>{{ summary }}</p>
  
      <NuxtLink 
        v-if="accountInfo?.dynamo_awsGovCloudAccountID || accountInfo?.dynamo_awsStandardAccountID"
        :to="`/account/${accountInfo?.dynamo_awsGovCloudAccountID || accountInfo?.dynamo_awsStandardAccountID}/volumes`" 
        class="flex justify-center items-center w-full mt-4 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      >
        View Findings
      </NuxtLink>
      <div 
        v-else
        class="flex justify-center items-center w-full mt-4 bg-gray-500 text-white font-bold py-2 px-4 rounded cursor-not-allowed">
        Account ID Required
      </div>
    </UCard>
  </template>
  
  <script setup>
  import { ref, onMounted, watch } from 'vue';
  
  const props = defineProps({
    accountId: {
      type: String,
      required: true
    }
  });
  
  const emit = defineEmits(['update:volumeoptimizedPercentage']);
  
  const summary = ref('');
  const volumeoptimizedPercentage = ref(0);
  const accountInfo = ref(null);
  const pending = ref(true);
  
  // Helper function to add fixed delay retries
  async function retryWithBackoff(fn, retries = 50, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1 || !error.message.includes("another request is already in progress")) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  const fetchAccountInfo = async () => {
    try {
      await retryWithBackoff(async () => {
        const response = await fetch(`/api/get-account-info-complete?accountId=${props.accountId}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        accountInfo.value = await response.json();
        await fetchVolumeSummaries();
      });
    } catch (error) {
      console.error('Error fetching account info:', error);
    } finally {
      pending.value = false;
    }
  };
  
  const fetchVolumeSummaries = async () => {
    if (!accountInfo.value) return;
  
    try {
      await retryWithBackoff(async () => {
        const response = await fetch(`/api/aws/config/summarize-volumes?accountId=${accountInfo.value.dynamo_awsGovCloudAccountID}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        summary.value = data.summary;
        volumeoptimizedPercentage.value = data.volumeoptimizedPercentage || 0;
        emit('update:volumeoptimizedPercentage', volumeoptimizedPercentage.value);
      });
    } catch (error) {
      console.error('Error fetching volume information:', error);
    }
  };
  
  onMounted(() => {
    fetchAccountInfo();
  });
  
  watch(() => props.accountId, async (newId) => {
    if (newId) await fetchAccountInfo();
  });
  </script>
  
  <style scoped>
  </style>
  