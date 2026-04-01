<template>
  <div
    v-if="isImpersonating && impersonatedUser"
    class="flex items-center gap-3 px-4 py-2.5 bg-amber-900/20 border-b border-amber-700/30"
  >
    <UIcon
      name="i-heroicons-eye"
      class="h-5 w-5 flex-shrink-0 text-amber-400"
    />
    <p class="flex-1 text-sm text-amber-200 leading-snug">
      Viewing as
      <span class="font-semibold text-amber-100">{{ impersonatedUser.displayName }}</span>
      <span class="text-amber-300/80">({{ impersonatedUser.userPrincipalName }})</span>
    </p>
    <div class="flex items-center gap-2">
      <UBadge
        v-for="role in userRoles"
        :key="role.id"
        color="amber"
        variant="soft"
        size="xs"
      >
        {{ role.name }}
      </UBadge>
    </div>
    <UButton
      icon="i-heroicons-x-mark"
      color="amber"
      variant="soft"
      size="xs"
      @click="stopImpersonation"
    >
      Stop Impersonating
    </UButton>
  </div>
</template>

<script setup lang="ts">
const { isImpersonating, impersonatedUser, stopImpersonation } = useImpersonation()
const { userRoles } = useUserRoles()
</script>
