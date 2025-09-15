<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'

interface Props {
  userPrincipalName?: string
  displayName?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  fallbackToInitials?: boolean
  showOnlineStatus?: boolean
  detectRedirects?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  size: 'md',
  fallbackToInitials: true,
  showOnlineStatus: false,
  detectRedirects: true
})

// Component state
const photoLoaded = ref(false)
const photoError = ref(false)
const isLoading = ref(true)
const isRedirected = ref(false)

// Extract user ID from email (first.last format)
const userId = computed(() => {
  if (!props.userPrincipalName) return null
  
  // Extract the part before @ and convert to first.last format
  const emailPart = props.userPrincipalName.split('@')[0]
  
  // Handle different email formats
  if (emailPart.includes('.')) {
    return emailPart.toLowerCase()
  }
  
  // If no dot, assume it's already in the right format or needs conversion
  return emailPart.toLowerCase()
})

// Photo URL
const photoUrl = computed(() => {
  if (!userId.value) return null
  return `https://employeephoto.gd-ms.us/${userId.value}.jpg`
})

// User initials
const initials = computed(() => {
  if (!props.displayName && !props.userPrincipalName) return '?'
  
  const name = props.displayName || props.userPrincipalName?.split('@')[0] || ''
  
  // Handle different name formats
  if (name.includes(' ')) {
    // Full name with spaces
    return name.split(' ')
      .filter(part => part.length > 0)
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  } else if (name.includes('.')) {
    // first.last format
    return name.split('.')
      .filter(part => part.length > 0)
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  } else {
    // Single name
    return name.slice(0, 2).toUpperCase()
  }
})

// Size classes
const sizeClasses = computed(() => {
  const sizes = {
    'xs': 'w-6 h-6 text-xs',
    'sm': 'w-8 h-8 text-xs', 
    'md': 'w-10 h-10 text-sm',
    'lg': 'w-12 h-12 text-base',
    'xl': 'w-16 h-16 text-lg',
    '2xl': 'w-20 h-20 text-xl'
  }
  return sizes[props.size]
})

// Icon size for fallback
const iconSize = computed(() => {
  const sizes = {
    'xs': 'w-3 h-3',
    'sm': 'w-4 h-4',
    'md': 'w-5 h-5', 
    'lg': 'w-6 h-6',
    'xl': 'w-8 h-8',
    '2xl': 'w-10 h-10'
  }
  return sizes[props.size]
})

// Check if URL was redirected to a default image using image properties
const checkForRedirectFromImage = (img: HTMLImageElement, originalUrl: string): boolean => {
  if (!props.detectRedirects) return false
  
  try {
    // Method 1: Check if the image dimensions suggest it's a default/placeholder
    // Most user photos are reasonable sizes, default images are often very small or very large
    const isLikelyPlaceholder = (img.naturalWidth <= 50 && img.naturalHeight <= 50) || 
                                (img.naturalWidth === img.naturalHeight && img.naturalWidth <= 100)
    
    // Method 2: Check if the image source changed (some browsers update img.src to final URL)
    const urlChanged = img.src !== originalUrl && img.currentSrc !== originalUrl
    
    // Method 3: Check common default image patterns in the final src
    const defaultImagePatterns = [
      '/default_user_pic.svg',
      '/default-avatar.png',
      '/placeholder.jpg',
      '/no-photo.png',
      '/avatar-placeholder',
      '/default.jpg',
      '/user-default'
    ]
    
    const hasDefaultPattern = defaultImagePatterns.some(pattern => 
      img.src.toLowerCase().includes(pattern.toLowerCase()) ||
      (img.currentSrc && img.currentSrc.toLowerCase().includes(pattern.toLowerCase()))
    )
    
    return isLikelyPlaceholder || urlChanged || hasDefaultPattern
    
  } catch (error) {
    console.warn('Failed to check image for redirect indicators:', error)
    return false
  }
}

// Fallback method: Try fetch but gracefully handle CORS errors
const checkForRedirect = async (originalUrl: string): Promise<boolean> => {
  if (!props.detectRedirects) return false
  
  try {
    // Use fetch with HEAD method to check redirect without downloading image
    const response = await fetch(originalUrl, { 
      method: 'HEAD',
      redirect: 'follow',
      mode: 'no-cors' // This prevents CORS errors but limits what we can check
    })
    
    return false // If no-cors mode, we can't check much, so rely on image-based detection
    
  } catch (error) {
    // CORS or other fetch error - this is expected for cross-origin requests
    // We'll rely on image-based detection instead
    return false
  }
}

// Enhanced photo load handling with image-based redirect detection
const handlePhotoLoad = async (event: Event) => {
  const img = event.target as HTMLImageElement
  
  if (props.detectRedirects && photoUrl.value) {
    // Check using image properties (CORS-safe method)
    const wasRedirected = checkForRedirectFromImage(img, photoUrl.value)
    
    if (wasRedirected) {
      // Treat redirected default images as errors to show initials instead
      isRedirected.value = true
      photoLoaded.value = false
      photoError.value = true
      isLoading.value = false
      return
    }
  }
  
  // Normal photo load success
  photoLoaded.value = true
  photoError.value = false
  isRedirected.value = false
  isLoading.value = false
}

// Simplified pre-check that doesn't use CORS-blocked fetch
const preCheckRedirect = async () => {
  // Skip pre-check since fetch is CORS-blocked
  // We'll rely on post-load image analysis instead
  return
}

// Handle photo load error
const handlePhotoError = () => {
  photoLoaded.value = false
  photoError.value = true
  isRedirected.value = false
  isLoading.value = false
}

// Reset state when props change
const resetState = () => {
  photoLoaded.value = false
  photoError.value = false
  isRedirected.value = false
  isLoading.value = true
}

// Watch for changes in user info
watch([() => props.userPrincipalName, () => props.displayName], () => {
  resetState()
  // Optional: Pre-check on prop changes
  // preCheckRedirect()
})

// Initialize on mount
onMounted(() => {
  if (!photoUrl.value) {
    isLoading.value = false
  }
  // Optional: Pre-check on mount for faster fallback
  // preCheckRedirect()
})

// Computed property to determine if we should show the photo
const shouldShowPhoto = computed(() => {
  return photoUrl.value && photoLoaded.value && !isRedirected.value
})

// Computed property to determine if we should show initials
const shouldShowInitials = computed(() => {
  return props.fallbackToInitials && (photoError.value || !photoUrl.value || isRedirected.value)
})

// Development mode check
const isDevelopment = computed(() => {
  // Check if we're in development mode using typical Vue/Nuxt patterns
  return typeof window !== 'undefined' && 
         (window.location.hostname === 'localhost' || 
          window.location.hostname === '127.0.0.1' ||
          window.location.hostname.includes('dev'))
})
</script>

<template>
  <div class="relative inline-block">
    <!-- Photo Avatar (if available, loaded, and not redirected) -->
    <div 
      v-if="shouldShowPhoto" 
      :class="[sizeClasses, 'rounded-full overflow-hidden bg-gray-700 flex-shrink-0']"
    >
      <img
        :src="photoUrl || ''"
        :alt="`${displayName || userPrincipalName} avatar`"
        class="w-full h-full object-cover"
        @load="handlePhotoLoad"
        @error="handlePhotoError"
      />
    </div>

    <!-- Initials Avatar (fallback when photo fails, redirected, or not available) -->
    <div 
      v-else-if="shouldShowInitials"
      :class="[
        sizeClasses, 
        'rounded-full bg-gradient-to-br from-blue-500/20 to-purple-600/20 flex items-center justify-center flex-shrink-0 border border-gray-600'
      ]"
      :title="isRedirected ? 'Photo redirected to default image - showing initials' : 'Photo not available - showing initials'"
    >
      <span class="font-medium text-blue-300 select-none">
        {{ initials }}
      </span>
    </div>

    <!-- Icon Avatar (ultimate fallback) -->
    <div 
      v-else
      :class="[
        sizeClasses, 
        'rounded-full bg-gradient-to-br from-gray-600/20 to-gray-700/20 flex items-center justify-center flex-shrink-0 border border-gray-600'
      ]"
    >
      <UIcon name="i-heroicons-user" :class="[iconSize, 'text-gray-400']" />
    </div>

    <!-- Hidden img for preloading photo -->
    <img
      v-if="photoUrl && !photoLoaded && !photoError && !isRedirected && isLoading"
      :src="photoUrl"
      class="hidden"
      @load="handlePhotoLoad"
      @error="handlePhotoError"
      :alt="`${displayName || userPrincipalName} avatar`"
    />

    <!-- Online Status Indicator (optional) -->
    <div 
      v-if="showOnlineStatus"
      class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 border-2 border-gray-900 rounded-full"
      title="Online"
    ></div>

    <!-- Loading State (subtle) -->
    <div 
      v-if="isLoading && photoUrl && !isRedirected"
      class="absolute inset-0 bg-gray-800/20 rounded-full animate-pulse"
    ></div>

    <!-- Debug indicator (only in development) -->
    <div 
      v-if="isRedirected && isDevelopment"
      class="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full"
      title="Image was redirected to default"
    ></div>
  </div>
</template> 