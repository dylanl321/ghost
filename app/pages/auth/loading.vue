<template>
  <div class="flex flex-col items-center justify-center h-screen">
    <p>Loading your groups...</p>
  </div>
</template>

<script setup lang="ts">
const { user } = useOidcAuth();
const userGroupStore = useUserGroupStore();
const enclaveStore = useEnclaveStore();

onMounted(async () => {
  const accessToken: string = user.value?.accessToken!;

  // Store user groups
  await userGroupStore.initialize(accessToken);

  // Store account/enclave information for all AWS accounts
  await enclaveStore.initialize();

  console.log('role groups', userGroupStore.roleGroups);
  console.log('dist groups', userGroupStore.distributionGroups);
  console.log('enclaves', enclaveStore.enclaves);

  // const data = await fetchGroups(accessToken);
  // console.log("fetch groups", data);
  // this.roleGroups = data.awsRoleGroups;
  // this.distributionGroups = data.distributionGroups;




  // const groups = await fetchGroups(accessToken);

  // const response = await fetch('/api/bulk-account-info');
  // const bulkAccountInfo: FullAccountInfo[] = await response.json();

  // const response = await fetch('/api/accounts/list');
  // const listAccountInfo = await response.json();

  // console.log('groups', groups);
  // console.log('bulk account info', bulkAccountInfo);
  // console.log("list account info", listAccountInfo);
});

</script>