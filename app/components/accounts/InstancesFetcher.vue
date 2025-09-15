<template>
  <div></div>
</template>

<script setup>
import { onMounted } from 'vue';

const emits = defineEmits(['instances-loaded', 'instance-ids-loaded']);

const fetchInstances = async () => {
  const accountId = '374673712317'; // Replace with dynamic value if needed
  const response = await fetch(`api/aws/config/fetch-instances?accountId=${accountId}`);
  const data = await response.json();
  emits('instances-loaded', data.instances);
  emits('instance-ids-loaded', data.instances.map(instance => instance.InstanceId));
};

onMounted(fetchInstances);
</script>
