<template>
  <div></div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

// Define the emit function for the 'optimizations-loaded' event
const emit = defineEmits(['optimizations-loaded']);

const accountId = '374673712317'; // Replace with your actual account ID
const optimizations = ref([]);
const instanceIds = ref([]);

onMounted(async () => {
  try {
    instanceIds.value = await fetchInstanceIds();
    const fetchedOptimizations = await fetchOptimizations(instanceIds.value);
    optimizations.value = fetchedOptimizations;
    emit('optimizations-loaded', fetchedOptimizations);
  } catch (error) {
    console.error("Error fetching optimizations:", error);
  }
});

const fetchInstanceIds = async () => {
  try {
    const response = await fetch(`/api/aws/config/fetch-instances?accountId=${accountId}`);
    const data = await response.json();
    return data.instances.map(instance => instance.InstanceId);
  } catch (error) {
    console.error("Error fetching instance IDs:", error);
    return [];
  }
};

const fetchOptimizations = async (resourceId) => {
  try {
    const response = await fetch(`/api/aws/config/fetch-optimizations?resourceId=${resourceId}`);
    const data = await response.json();
    return data.Finding; // Adjust according to your API response structure
  } catch (error) {
    console.error("Error fetching optimizations:", error);
    return [];
  }
};
</script>
