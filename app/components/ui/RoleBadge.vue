<template>
  <UBadge 
    :color="badgeColor" 
    :variant="variant"
    :size="size"
    class="inline-flex items-center gap-1"
  >
    <UIcon v-if="showIcon" :name="roleIcon" class="w-3 h-3" />
    <span>{{ displayRole }}</span>
  </UBadge>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  role: string
  variant?: 'solid' | 'outline' | 'soft' | 'subtle'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'soft',
  size: 'sm',
  showIcon: true
})

// Determine badge color based on role type
const badgeColor = computed(() => {
  const roleLower = props.role.toLowerCase()
  
  if (roleLower.includes('admin') || roleLower.includes('administrator')) {
    return 'red'
  }
  if (roleLower.includes('power') || roleLower.includes('developer')) {
    return 'orange'
  }
  if (roleLower.includes('readwrite') || roleLower.includes('contributor')) {
    return 'yellow'
  }
  if (roleLower.includes('readonly') || roleLower.includes('viewer')) {
    return 'blue'
  }
  if (roleLower.includes('limited') || roleLower.includes('restricted')) {
    return 'gray'
  }
  
  return 'primary'
})

// Determine icon based on role type
const roleIcon = computed(() => {
  const roleLower = props.role.toLowerCase()
  
  if (roleLower.includes('admin') || roleLower.includes('administrator')) {
    return 'i-heroicons-shield-exclamation'
  }
  if (roleLower.includes('power') || roleLower.includes('developer')) {
    return 'i-heroicons-code-bracket'
  }
  if (roleLower.includes('readwrite') || roleLower.includes('contributor')) {
    return 'i-heroicons-pencil'
  }
  if (roleLower.includes('readonly') || roleLower.includes('viewer')) {
    return 'i-heroicons-eye'
  }
  if (roleLower.includes('limited') || roleLower.includes('restricted')) {
    return 'i-heroicons-lock-closed'
  }
  
  return 'i-heroicons-user'
})

// Format role for display
const displayRole = computed(() => {
  // Remove common prefixes and clean up
  let cleaned = props.role
    .replace(/^AWS[-_]/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // Add space between camelCase
  
  // Capitalize words
  return cleaned
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
})
</script>