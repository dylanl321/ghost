<template>
  <div class="m-8">
    <div class="border-2 p-4 mb-4 rounded-md">Hello!</div>
    <button
      class="bg-primary text-black px-4 py-2 rounded-lg"
      :onclick="() => {count += 1;}"
    >
      Click
    </button>
    <div>Count: {{ count }}</div>

    <!-- <UButton class="mt-20" :onclick="handleLogout">Logout</UButton> -->
    <button class="mt-20 border-1 p-1 rounded-md hover:bg-emerald-600 hover:cursor-pointer" :onclick="handleLogout">Logout</button>
  </div>
</template>

<script setup lang="ts">
const { user, logout } = useOidcAuth();
// console.log(user.value);

const loginTime = ref('');

const handleLogout = () => {
  console.log('logging out');
  logout();
};

onMounted(() => {
  const temp = new Date((user?.value?.loggedInAt || 0) * 1000);
  loginTime.value = temp.toLocaleString();
});

const count = ref(0);
</script>
