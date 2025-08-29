<template>
  <div>
    <UserEnclaves />
    <UButton @click="() => logout()">Logout</UButton>
  </div>
  
  <!-- <button class="mt-20 border-1 p-1 rounded-md hover:bg-emerald-600 hover:cursor-pointer" @click="() => logout()">Logout</button> -->
  <!-- <div class="m-8">
    <div class="border-2 p-4 mb-4 rounded-md">Hello!</div>
    <button
      class="bg-primary text-black px-4 py-2 rounded-lg"
      :onclick="() => {count += 1;}"
    >
      Click
    </button>
    <div>Count: {{ count }}</div>

    
    <button class="mt-20 border-1 p-1 rounded-md hover:bg-emerald-600 hover:cursor-pointer" @click="() => logout()">Logout</button>
  </div> -->
</template>

<script setup lang="ts">
const { logout, user } = useOidcAuth()
const userGroupStore = useUserGroupStore()

onMounted(async () => {
  console.log('aws roles from index', userGroupStore.awsRoles)

})

// const count = ref(0)

</script>
