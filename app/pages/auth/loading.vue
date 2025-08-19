<template>
  <div class="flex flex-col items-center justify-center h-screen">
    <p>Loading your groups...</p>
  </div>
</template>

<script setup lang="ts">
const { user } = useOidcAuth();
const { fetchGroups } = useGraphApi();
// const userGroupStore = useUserGroupStore();

onMounted(async () => {
  const groups = await fetchGroups(user.value?.accessToken || '');
  // const awsRoles = 

  // const response = await fetch('/api/bulk-account-info');
  // const bulkAccountInfo: FullAccountInfo[] = await response.json();

  const response = await fetch('/api/accounts/list');
  const listAccountInfo = await response.json();

  console.log('groups', groups);
  // console.log('bulk account info', bulkAccountInfo);
  console.log("list account info", listAccountInfo);
});

</script>