<template>
  <div></div>
</template>

<script setup>
import { onMounted } from 'vue';

const emits = defineEmits(['volumes-loaded']);

const fetchVolumes = async () => {
  const accountId = '461760157232'; // Replace with dynamic value if needed
  const response = await fetch(`api/aws/config/fetch-volumes?accountId=${accountId}`);
  const data = await response.json();
  emits('volumes-loaded', data.volumes);
};

onMounted(fetchVolumes);
</script>
