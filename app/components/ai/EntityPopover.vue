<template>
  <!-- Entity Popover Component -->
  <Teleport to="body">
    <div
      v-if="isVisible"
      ref="popoverRef"
      class="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 max-w-sm"
      :style="popoverStyle"
      @mouseenter="onMouseEnter"
      @mouseleave="onMouseLeave"
    >
      <!-- Loading State -->
      <div v-if="loading" class="flex items-center justify-center py-4">
        <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-primary-500" />
        <span class="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading...</span>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="text-center py-4">
        <UIcon name="i-heroicons-exclamation-circle" class="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p class="text-sm text-gray-600 dark:text-gray-400">Failed to load details</p>
      </div>

      <!-- Content -->
      <div v-else-if="entityData">
        <!-- Header -->
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center gap-2">
            <UIcon :name="entityIcon" class="w-5 h-5 text-primary-600 dark:text-primary-400" />
            <div>
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">{{ entityLabel }}</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ entityValue }}</p>
            </div>
          </div>
          <button
            @click="close"
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <UIcon name="i-heroicons-x-mark" class="w-4 h-4" />
          </button>
        </div>

        <!-- User Entity -->
        <div v-if="entityType === 'username'" class="space-y-2">
          <div class="text-sm">
            <p class="text-gray-600 dark:text-gray-400">Full Name</p>
            <p class="font-medium text-gray-900 dark:text-white">{{ entityData.fullName || 'N/A' }}</p>
          </div>
          <div class="text-sm">
            <p class="text-gray-600 dark:text-gray-400">Email</p>
            <p class="font-medium text-gray-900 dark:text-white">{{ entityData.email || 'N/A' }}</p>
          </div>

          <!-- Contact Options -->
          <div v-if="entityData.email || entityData.teamsLink" class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">Contact</p>
            <div class="flex gap-2">
              <a
                v-if="entityData.email"
                :href="`mailto:${entityData.email}`"
                target="_blank"
                class="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-lg transition-colors border border-blue-200 dark:border-blue-800"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                </svg>
                Email
              </a>
              <a
                v-if="entityData.teamsLink"
                :href="entityData.teamsLink"
                target="_blank"
                class="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-lg transition-colors border border-purple-200 dark:border-purple-800"
              >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.625 8.127c0-.689-.559-1.248-1.25-1.248h-3.125v10.229h3.125c.691 0 1.25-.559 1.25-1.248V8.127zm-5.625 9.981V5.879h-3.75v12.229h3.75zm-5 0V5.879H6.25c-.691 0-1.25.559-1.25 1.248v7.733c0 .689.559 1.248 1.25 1.248h3.75z"/>
                </svg>
                Teams
              </a>
            </div>
          </div>

          <div v-if="entityData.accountCount > 0" class="text-sm">
            <p class="text-gray-600 dark:text-gray-400">Accounts</p>
            <p class="font-medium text-gray-900 dark:text-white">{{ entityData.accountCount }} accounts</p>
          </div>
          <div v-if="entityData.accounts && entityData.accounts.length > 0" class="mt-2">
            <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Recent Accounts</p>
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="account in entityData.accounts.slice(0, 3)"
                :key="account.id"
                color="gray"
                size="xs"
              >
                {{ account.alias || account.id }}
              </UBadge>
            </div>
          </div>
        </div>

        <!-- Account Entity -->
        <div v-else-if="entityType === 'account-id' || entityType === 'account-alias'" class="space-y-2">
          <div class="text-sm">
            <p class="text-gray-600 dark:text-gray-400">Account Name</p>
            <p class="font-medium text-gray-900 dark:text-white">{{ entityData.name || 'N/A' }}</p>
          </div>
          <div class="text-sm">
            <p class="text-gray-600 dark:text-gray-400">Commercial Account ID</p>
            <p class="font-mono text-xs text-gray-900 dark:text-white">{{ entityData.commercialId || entityData.id }}</p>
          </div>
          <div v-if="entityData.govcloudId" class="text-sm">
            <p class="text-gray-600 dark:text-gray-400">GovCloud Account ID</p>
            <p class="font-mono text-xs text-gray-900 dark:text-white">{{ entityData.govcloudId }}</p>
          </div>
          <div v-if="entityData.email" class="text-sm">
            <p class="text-gray-600 dark:text-gray-400">Email</p>
            <p class="text-xs text-gray-900 dark:text-white">{{ entityData.email }}</p>
          </div>
          <div class="flex gap-2 text-xs">
            <div>
              <p class="text-gray-500 dark:text-gray-400">Status</p>
              <UBadge :color="entityData.status === 'Active' ? 'green' : 'gray'" size="xs">
                {{ entityData.status }}
              </UBadge>
            </div>
            <div v-if="entityData.environment">
              <p class="text-gray-500 dark:text-gray-400">Environment</p>
              <UBadge color="blue" size="xs">{{ entityData.environment }}</UBadge>
            </div>
          </div>
          <div v-if="entityData.monthlyCost" class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <p class="text-xs text-gray-500 dark:text-gray-400">Monthly Cost</p>
            <p class="text-lg font-semibold text-gray-900 dark:text-white">${{ formatCost(entityData.monthlyCost) }}</p>
          </div>
        </div>

        <!-- Instance Entity -->
        <div v-else-if="entityType === 'instance-id'" class="space-y-2">
          <div class="text-sm">
            <p class="text-gray-600 dark:text-gray-400">Name</p>
            <p class="font-medium text-gray-900 dark:text-white">{{ entityData.name || 'N/A' }}</p>
          </div>
          <div class="text-sm">
            <p class="text-gray-600 dark:text-gray-400">Type</p>
            <p class="font-mono text-xs text-gray-900 dark:text-white">{{ entityData.instanceType }}</p>
          </div>
          <div class="text-sm">
            <p class="text-gray-600 dark:text-gray-400">State</p>
            <UBadge
              :color="entityData.state === 'running' ? 'green' : entityData.state === 'stopped' ? 'red' : 'gray'"
              size="xs"
            >
              {{ entityData.state }}
            </UBadge>
          </div>
          <div v-if="entityData.monthlyCost" class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <p class="text-xs text-gray-500 dark:text-gray-400">Est. Monthly Cost</p>
            <p class="text-lg font-semibold text-gray-900 dark:text-white">${{ formatCost(entityData.monthlyCost) }}</p>
          </div>
        </div>

        <!-- Generic fallback -->
        <div v-else class="text-sm text-gray-600 dark:text-gray-400">
          <pre class="text-xs">{{ entityData }}</pre>
        </div>

        <!-- View Details Link -->
        <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <UButton
            :to="detailsLink"
            color="primary"
            variant="soft"
            size="xs"
            block
          >
            <UIcon name="i-heroicons-arrow-right" class="mr-1" />
            View Full Details
          </UButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { EntityType } from '../composables/useStrandsResponseEnricher'
import { convertToUsernameSlug } from '~/utils/userUtils'

const logger = createLogger('EntityPopover')

const isVisible = ref(false)
const loading = ref(false)
const error = ref(false)
const entityType = ref<EntityType | null>(null)
const entityValue = ref<string | null>(null)
const entityData = ref<any>(null)
const triggerElement = ref<HTMLElement | null>(null)
const popoverRef = ref<HTMLElement | null>(null)

let hideTimeout: NodeJS.Timeout | null = null

const popoverStyle = computed(() => {
  if (!triggerElement.value) return {}

  const rect = triggerElement.value.getBoundingClientRect()
  const top = rect.bottom + window.scrollY + 8 // 8px gap
  const left = rect.left + window.scrollX

  return {
    top: `${top}px`,
    left: `${left}px`
  }
})

const entityIcon = computed(() => {
  const icons: Record<EntityType, string> = {
    'username': 'i-heroicons-user',
    'account-id': 'i-heroicons-building-office',
    'account-alias': 'i-heroicons-building-office-2',
    'instance-id': 'i-heroicons-server',
    'bucket-name': 'i-heroicons-archive-box',
    'lambda-name': 'i-heroicons-bolt',
    'rds-id': 'i-heroicons-circle-stack',
    'security-group-id': 'i-heroicons-shield-check',
    'vpc-id': 'i-heroicons-globe-alt'
  }
  return entityType.value ? icons[entityType.value] : 'i-heroicons-information-circle'
})

const entityLabel = computed(() => {
  const labels: Record<EntityType, string> = {
    'username': 'User',
    'account-id': 'AWS Account',
    'account-alias': 'Account',
    'instance-id': 'EC2 Instance',
    'bucket-name': 'S3 Bucket',
    'lambda-name': 'Lambda Function',
    'rds-id': 'RDS Database',
    'security-group-id': 'Security Group',
    'vpc-id': 'VPC'
  }
  return entityType.value ? labels[entityType.value] : 'Entity'
})

const detailsLink = computed(() => {
  if (!entityType.value || !entityValue.value) return '/'

  // For account IDs, always use the commercial ID if available
  // GHOST UI uses commercial IDs for all pages (costs, details, etc.)
  let accountIdToUse = entityValue.value
  if (entityType.value === 'account-id' && entityData.value?.commercialId) {
    accountIdToUse = entityData.value.commercialId
  }

  const linkMap: Record<EntityType, (value: string) => string> = {
    'username': (v) => {
      // Convert username/email to slug format (john.doe@gd-ms.com -> john-doe)
      const slug = convertToUsernameSlug(v)
      return `/account/user/${slug}`
    },
    'account-id': (v) => `/account/${accountIdToUse}`, // Use commercial ID
    'account-alias': (v) => `/account?alias=${v}`,
    'instance-id': (v) => `/account/explorer?resourceId=${v}&type=ec2`,
    'bucket-name': (v) => `/account/explorer?resourceId=${v}&type=s3`,
    'lambda-name': (v) => `/account/explorer?resourceId=${v}&type=lambda`,
    'rds-id': (v) => `/account/explorer?resourceId=${v}&type=rds`,
    'security-group-id': (v) => `/account/explorer?resourceId=${v}&type=security-group`,
    'vpc-id': (v) => `/account/explorer?resourceId=${v}&type=vpc`
  }

  const builder = linkMap[entityType.value]
  return builder ? builder(entityValue.value) : '/'
})

const show = async (type: EntityType, value: string, trigger: HTMLElement) => {
  entityType.value = type
  entityValue.value = value
  triggerElement.value = trigger
  isVisible.value = true
  loading.value = true
  error.value = false

  // Clear any pending hide
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }

  // Fetch entity data
  try {
    const { fetchEntityData } = useStrandsResponseEnricher()
    entityData.value = await fetchEntityData(type, value)
    loading.value = false
  } catch (e) {
    logger.error('Error fetching entity data:', e)
    error.value = true
    loading.value = false
  }
}

const close = () => {
  isVisible.value = false
  entityType.value = null
  entityValue.value = null
  entityData.value = null
  triggerElement.value = null
}

const scheduleHide = () => {
  hideTimeout = setTimeout(() => {
    close()
  }, 300) // 300ms delay before hiding
}

const onMouseEnter = () => {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
}

const onMouseLeave = () => {
  scheduleHide()
}

const formatCost = (cost: number) => {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(cost)
}

// Listen for global popover events
onMounted(() => {
  window.addEventListener('show-entity-popover', (event: Event) => {
    const customEvent = event as CustomEvent
    const { entityType: type, entityValue: value, triggerElement: trigger } = customEvent.detail
    show(type, value, trigger)
  })

  // Close on outside click
  document.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement
    if (
      isVisible.value &&
      popoverRef.value &&
      !popoverRef.value.contains(target) &&
      triggerElement.value &&
      !triggerElement.value.contains(target)
    ) {
      close()
    }
  })
})

defineExpose({
  show,
  close
})
</script>

<style scoped>
/* Add any custom styles here */
</style>
