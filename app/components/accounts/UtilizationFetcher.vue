<template>
  <div v-if="loading" class="loading">
    Fetching utilization data...
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  instances: Array
});
const emits = defineEmits(['utilization-loaded']);

const loading = ref(true);

const fetchUtilization = async (instanceId) => {
  const response = await fetch(`/api/aws/config/get-utilization?resourceId=${instanceId}`);
  const data = await response.json();
  return data.averageUtilization;
};

const fetchMaxUtilization = async (instanceId) => {
  const response = await fetch(`/api/aws/config/get-max-utilization?resourceId=${instanceId}`);
  const data = await response.json();
  return data.peakUtilization;
};

const fetchAllUtilization = async () => {
  const updatedInstances = await Promise.all(
    props.instances.map(async (instance) => {
      const [averageUtilization, peakUtilization] = await Promise.all([
        fetchUtilization(instance.InstanceId),
        fetchMaxUtilization(instance.InstanceId)
      ]);
      return {
        ...instance,
        utilization: averageUtilization,
        peakUtilization: peakUtilization
      };
    })
  );

  emits('utilization-loaded', updatedInstances);
  loading.value = false;
};

watch(() => props.instances, fetchAllUtilization, { immediate: true });
</script>

<style>
.loading {
  font-size: 20px;
  text-align: center;
  padding: 50px;
}
</style>
