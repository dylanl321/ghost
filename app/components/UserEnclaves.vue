<template>
  <div
    ref="cardRef"
    class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 h-full overflow-hidden"
    :style="{ minHeight: '420px', height: lockedHeight ? lockedHeight + 'px' : undefined }"
  >
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-x-4"
      enter-to-class="opacity-100 translate-x-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-x-0"
      leave-to-class="opacity-0 -translate-x-4"
      mode="out-in"
    >
      <!-- ACCOUNT DETAIL SUB-VIEW -->
      <div v-if="selectedAccount" key="detail" class="h-full overflow-y-auto">
        <!-- Back button + account name -->
        <div class="flex items-center gap-2 mb-5">
          <button
            @click="deselectAccount"
            class="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-150"
          >
            <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
          </button>
          <div class="min-w-0 flex-1">
            <h2 class="text-sm font-semibold text-gray-900 dark:text-white truncate">{{ selectedAccount.projectName }}</h2>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-[11px] font-mono text-gray-400 dark:text-gray-500">{{ selectedAccount.standardId }}</span>
              <UBadge
                :color="selectedAccount.environment === 'GovCloud' ? 'orange' : 'blue'"
                variant="subtle"
                size="xs"
              >
                {{ selectedAccount.environment === 'GovCloud' ? 'GovCloud' : 'Commercial' }}
              </UBadge>
            </div>
          </div>
        </div>

        <!-- Quick-nav links grid -->
        <div class="grid grid-cols-2 gap-2.5">
          <NuxtLink
            v-for="link in accountLinks"
            :key="link.to"
            :to="link.to"
            class="group relative rounded-xl border border-gray-200 dark:border-gray-700 p-3.5 transition-all duration-200 hover:border-transparent hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-0.5 overflow-hidden"
            :class="link.bgHover"
          >
            <!-- Gradient background on hover -->
            <div
              class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              :class="link.gradient"
            />
            <div class="relative">
              <div
                class="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 transition-colors duration-200"
                :class="link.iconBg"
              >
                <UIcon :name="link.icon" class="w-4 h-4" :class="link.iconColor" />
              </div>
              <p class="text-xs font-semibold text-gray-900 dark:text-white mb-0.5 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                {{ link.label }}
              </p>
              <p class="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
                {{ link.description }}
              </p>
            </div>
          </NuxtLink>
        </div>

        <!-- Roles summary -->
        <div v-if="selectedAccount.roles.length > 0" class="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800">
          <p class="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Your Roles</p>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="role in selectedAccount.roles"
              :key="role"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
            >
              <span
                class="w-1.5 h-1.5 rounded-full"
                :class="role.includes(GOV_IDENTIFIER) ? 'bg-orange-400' : 'bg-blue-400'"
              />
              {{ role.split(' |')[0] }}
            </span>
          </div>
        </div>
      </div>

      <!-- ACCOUNT LIST VIEW -->
      <div v-else key="list">
        <!-- Section Header -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-building-office-2" class="w-5 h-5 text-blue-500" />
            <h2 class="text-sm font-semibold text-gray-900 dark:text-white">My Accounts</h2>
            <UBadge v-if="tableData.length > 0" color="blue" variant="soft" size="xs">{{ tableData.length }}</UBadge>
          </div>
          <NuxtLink v-if="tableData.length > 0" to="/account/explorer" class="text-xs text-blue-500 hover:text-blue-400 transition-colors">
            View All →
          </NuxtLink>
        </div>

        <!-- Loading skeleton -->
        <div v-if="props.loading" :class="[
          'grid gap-3',
          props.displayStyle === 'third' ? 'grid-cols-1' :
          props.displayStyle === 'half' ? 'grid-cols-1 sm:grid-cols-2' :
          'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
        ]">
          <div v-for="i in (props.displayStyle === 'third' ? 2 : 4)" :key="i" class="rounded-xl border border-gray-200 dark:border-gray-800 p-4 animate-pulse">
            <div class="flex items-center justify-between mb-3">
              <div class="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
              <div class="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
            </div>
            <div class="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
            <div class="flex gap-1.5">
              <div class="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div class="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded-full" />
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="tableData.length === 0" class="py-6 text-center">
          <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <UIcon name="i-heroicons-building-office-2" class="w-6 h-6 text-blue-400" />
          </div>
          <h3 class="text-sm font-medium text-gray-900 dark:text-gray-300 mb-1">No Accounts Yet</h3>
          <p class="text-gray-500 dark:text-gray-400 text-xs max-w-xs mx-auto mb-3">
            When you're granted access to an AWS account, it will show up here with quick links to details, costs, and more.
          </p>
          <NuxtLink to="/account/explorer">
            <UButton icon="i-heroicons-magnifying-glass" size="xs" variant="soft" color="blue">
              Browse Accounts
            </UButton>
          </NuxtLink>
        </div>

        <!-- Compact mini-tiles: 2-col grid of small squares when >2 accounts -->
        <div v-else-if="props.displayStyle === 'third' && displayedAccounts.length > 2" class="grid grid-cols-2 gap-2">
          <button
            v-for="enclave in displayedAccounts"
            :key="enclave.standardId"
            @click="selectAccount(enclave)"
            class="group rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 transition-all duration-150 hover:border-blue-500/50 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-left"
          >
            <div class="flex items-center gap-1.5 mb-1">
              <span
                class="w-1.5 h-1.5 rounded-full shrink-0"
                :class="enclave.environment === 'GovCloud' ? 'bg-orange-400' : 'bg-blue-400'"
              />
              <span class="text-xs font-semibold text-gray-900 dark:text-white truncate group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
                {{ enclave.projectName }}
              </span>
            </div>
            <span class="text-[10px] font-mono text-gray-400 dark:text-gray-500">{{ enclave.standardId }}</span>
          </button>
          <NuxtLink
            v-if="hiddenCount > 0"
            to="/account/explorer"
            class="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-2.5 flex items-center justify-center text-xs text-gray-400 hover:text-blue-500 hover:border-blue-500/50 transition-colors"
          >
            +{{ hiddenCount }} more
          </NuxtLink>
        </div>

        <!-- Full account cards for non-compact or compact with ≤2 accounts -->
        <div v-else :class="[
          'grid gap-3 overflow-y-auto',
          props.displayStyle === 'third' ? 'grid-cols-1 max-h-[280px]' :
          props.displayStyle === 'half' ? 'max-h-[400px]' :
          'max-h-[500px]',
          props.displayStyle === 'half' ? (displayedAccounts.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2') :
          displayedAccounts.length === 1 ? 'grid-cols-1 max-w-lg' :
          displayedAccounts.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
          'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
        ]">
          <button
            v-for="enclave in displayedAccounts"
            :key="enclave.standardId"
            @click="selectAccount(enclave)"
            class="group relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 transition-all duration-200 hover:border-blue-500/50 hover:shadow-md hover:shadow-blue-500/5 hover:-translate-y-0.5 text-left"
          >
            <!-- Top row: name + environment badge -->
            <div class="flex items-start justify-between gap-2 mb-2">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors leading-tight">
                {{ enclave.projectName }}
              </h3>
              <UBadge
                :color="enclave.environment === 'GovCloud' ? 'orange' : 'blue'"
                variant="subtle"
                size="xs"
                class="shrink-0"
              >
                {{ enclave.environment === 'GovCloud' ? 'GovCloud' : 'Commercial' }}
              </UBadge>
            </div>

            <!-- Account IDs -->
            <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-3">
              <span class="font-mono text-blue-400/80">{{ enclave.standardId }}</span>
              <span v-if="enclave.govcloudId" class="font-mono text-orange-400/80">{{ enclave.govcloudId }}</span>
            </div>

            <!-- Roles -->
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="role in visibleRoles(enclave)"
                :key="role"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
              >
                <span
                  class="w-1.5 h-1.5 rounded-full"
                  :class="role.includes(GOV_IDENTIFIER) ? 'bg-orange-400' : 'bg-blue-400'"
                />
                {{ role.split(' |')[0] }}
              </span>
              <span
                v-if="!isExpanded(enclave) && enclave.roles.length > 3"
                @click.stop="setExpanded(enclave)"
                class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                +{{ enclave.roles.length - 3 }}
              </span>
            </div>

            <!-- Hover arrow indicator -->
            <UIcon
              name="i-heroicons-arrow-right"
              class="absolute top-4 right-4 w-4 h-4 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </button>
        </div>

        <!-- Show count of hidden accounts when truncated -->
        <div v-if="!props.loading && hiddenCount > 0 && !(props.displayStyle === 'third' && displayedAccounts.length > 2)" class="mt-3 text-center">
          <NuxtLink to="/account/explorer" class="text-xs text-gray-400 hover:text-blue-500 transition-colors">
            +{{ hiddenCount }} more account{{ hiddenCount !== 1 ? 's' : '' }}
          </NuxtLink>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
const userGroupStore = useUserGroupStore()

const props = defineProps<{
  loading: boolean
  displayStyle?: 'full' | 'two-thirds' | 'half' | 'third'
}>()

const GOV_IDENTIFIER = ' | gov'

const cardRef = ref<HTMLElement | null>(null)
const lockedHeight = ref<number | null>(null)
const selectedAccount = ref<any>(null)

function selectAccount(enclave: any) {
  // Lock the card to its current rendered height so the grid row doesn't shift
  if (cardRef.value) {
    lockedHeight.value = cardRef.value.offsetHeight
  }
  selectedAccount.value = enclave
}

function deselectAccount() {
  selectedAccount.value = null
  // Release the lock after the transition so the list can size naturally
  nextTick(() => {
    setTimeout(() => { lockedHeight.value = null }, 350)
  })
}

// Keep track of which rows have expanded roles
const expanded = ref<Set<string>>(new Set())

function isExpanded(row: any) {
  return expanded.value.has(row.standardId)
}

function setExpanded(row: any) {
  expanded.value.add(row.standardId)
}

function visibleRoles(row: any) {
  return isExpanded(row) ? row.roles : row.roles.slice(0, 3)
}

const tableData = computed(() => {
  if (!userGroupStore.myEnclaves) return []
  return Object.values(userGroupStore.myEnclaves)
})

// Cap visible accounts per display style to prevent unbounded growth
const displayedAccounts = computed(() => {
  const all = tableData.value
  if (props.displayStyle === 'third') return all.slice(0, 6)
  if (props.displayStyle === 'half') return all.slice(0, 6)
  return all.slice(0, 9)
})

const hiddenCount = computed(() => tableData.value.length - displayedAccounts.value.length)

// Quick-nav links for the selected account detail sub-view
const accountLinks = computed(() => {
  if (!selectedAccount.value) return []
  const id = selectedAccount.value.standardId
  return [
    {
      to: `/account/${id}`,
      icon: 'i-heroicons-home',
      label: 'Overview',
      description: 'Account details & metadata',
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-500',
      bgHover: 'hover:bg-blue-50 dark:hover:bg-blue-950/30',
      gradient: 'bg-gradient-to-br from-blue-50/80 to-transparent dark:from-blue-900/20 dark:to-transparent',
    },
    {
      to: `/account/${id}?tab=resources`,
      icon: 'i-heroicons-server-stack',
      label: 'Resources',
      description: 'EC2, S3, EBS & more',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      iconColor: 'text-emerald-500',
      bgHover: 'hover:bg-emerald-50 dark:hover:bg-emerald-950/30',
      gradient: 'bg-gradient-to-br from-emerald-50/80 to-transparent dark:from-emerald-900/20 dark:to-transparent',
    },
    {
      to: `/account/${id}?tab=security`,
      icon: 'i-heroicons-shield-exclamation',
      label: 'Security',
      description: 'Findings & compliance',
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-500',
      bgHover: 'hover:bg-amber-50 dark:hover:bg-amber-950/30',
      gradient: 'bg-gradient-to-br from-amber-50/80 to-transparent dark:from-amber-900/20 dark:to-transparent',
    },
    {
      to: `/account/costs?account=${id}`,
      icon: 'i-heroicons-chart-bar',
      label: 'Cost Reports',
      description: 'Spend trends & breakdown',
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      iconColor: 'text-purple-500',
      bgHover: 'hover:bg-purple-50 dark:hover:bg-purple-950/30',
      gradient: 'bg-gradient-to-br from-purple-50/80 to-transparent dark:from-purple-900/20 dark:to-transparent',
    },
    {
      to: `/account/${id}/users`,
      icon: 'i-heroicons-users',
      label: 'Users',
      description: 'Who has access',
      iconBg: 'bg-cyan-100 dark:bg-cyan-900/30',
      iconColor: 'text-cyan-500',
      bgHover: 'hover:bg-cyan-50 dark:hover:bg-cyan-950/30',
      gradient: 'bg-gradient-to-br from-cyan-50/80 to-transparent dark:from-cyan-900/20 dark:to-transparent',
    },
    {
      to: `/account/${id}?tab=policies`,
      icon: 'i-heroicons-shield-check',
      label: 'Policies',
      description: 'SCPs & governance',
      iconBg: 'bg-rose-100 dark:bg-rose-900/30',
      iconColor: 'text-rose-500',
      bgHover: 'hover:bg-rose-50 dark:hover:bg-rose-950/30',
      gradient: 'bg-gradient-to-br from-rose-50/80 to-transparent dark:from-rose-900/20 dark:to-transparent',
    },
  ]
})
</script>
