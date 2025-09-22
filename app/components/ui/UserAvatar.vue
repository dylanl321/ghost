<template>
  <div
    :class="[
      'rounded-full overflow-hidden flex items-center justify-center text-white',
      sizeClasses,
      (!photoUrl && initials) ? 'bg-gradient-to-br from-blue-500/20 to-purple-600/20' : 'bg-gray-700'
    ]"
  >
    <img
      v-if="photoUrl"
      :src="photoUrl"
      alt="User Avatar"
      class="w-full h-full object-cover"
      @error="onError"
    >

    <!-- Initials fallback -->
    <span v-else-if="initials" class="font-semibold select-none">
      {{ initials }}
    </span>

    <!-- Icon fallback -->
    <UIcon v-else name="i-heroicons-user" class="w-2/3 h-2/3" />
  </div>
</template>

<script setup lang="ts">

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'

const props = defineProps<{
  size?: Size
}>()

const { user } = useOidcAuth()
const errored = ref<boolean>(false)

const initials = computed<string | null>(() => {
  const email = (user.value?.claims?.email as string).trim() ?? ''
  const name = email.split('@')[0]?.split('.')
  if (!name) return null

  const first = name[0]?.toUpperCase().slice(0, 1) || ''
  const last = name[1]?.toUpperCase().slice(0, 1) || ''

  if (first && last) {
    return first + last
  } else {
    return null
  }
})

const userId = computed<string | null>(() => {
  const email = user.value?.claims?.email as string | undefined
  if (!email) return null
  return email.split('@')[0]?.toLowerCase() ?? null
})

const photoUrl = computed<string | null>(() => {
  if (!userId.value || errored.value) return null
  return `https://employeephoto.gd-ms.us/${userId.value}.jpg`
})

function onError(): void {
  errored.value = true
}

const sizeClasses = computed<string>(() => {
  const sizes: Record<Size, string> = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
    '2xl': 'w-20 h-20 text-xl'
  }
  return sizes[props.size ?? 'md']
})
</script>
