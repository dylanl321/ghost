<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Header -->
    <div class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 py-4 flex-shrink-0">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Tag Analysis</h1>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Understand how well your AWS resources are tagged and find untagged spending
          </p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <USelectMenu
            v-model="selectedPeriod"
            :options="periodOptions"
            value-attribute="value"
            option-attribute="label"
            size="sm"
            class="w-40"
          />
          <USelectMenu
            :model-value="selectedTag ?? undefined"
          @update:model-value="onTagSelect($event ?? null)"
            :options="tagSelectOptions"
            value-attribute="value"
            option-attribute="label"
            placeholder="Select tag..."
            size="sm"
            class="w-48"
            :loading="isLoadingTags"
          />
          <UTooltip text="Refresh">
            <UButton
              color="gray"
              variant="ghost"
              icon="i-heroicons-arrow-path"
              size="sm"
              :loading="isLoadingTags || isLoadingCoverage"
              @click="refresh"
            />
          </UTooltip>
        </div>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">

      <!-- Summary Cards (shown when a tag is selected and coverage loaded) -->
      <div v-if="selectedTag && tagCoverage && !isLoadingCoverage" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <!-- Overall Coverage -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Overall Coverage</div>
          <div class="text-3xl font-bold" :class="coverageColorClass">
            {{ tagCoverage.overallCoverage.toFixed(1) }}%
          </div>
          <div class="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <div
              class="h-2 rounded-full transition-all duration-500"
              :class="coverageBarClass"
              :style="{ width: `${tagCoverage.overallCoverage}%` }"
            />
          </div>
        </div>

        <!-- Tagged Spend -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Tagged Spend</div>
          <div class="text-3xl font-bold text-green-600 dark:text-green-400">
            {{ formatCostValue(tagCoverage.totalTaggedCost) }}
          </div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Resources with "{{ selectedTag }}" tag
          </div>
        </div>

        <!-- Untagged Spend -->
        <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
          :class="untaggedIsHigh ? 'border-amber-300 dark:border-amber-600' : ''"
        >
          <div class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Untagged Spend</div>
          <div class="text-3xl font-bold" :class="untaggedIsHigh ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'">
            {{ formatCostValue(tagCoverage.totalUntaggedCost) }}
          </div>
          <div class="text-xs mt-1" :class="untaggedIsHigh ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'">
            {{ untaggedIsHigh ? 'High untagged spend detected' : 'Resources without this tag' }}
          </div>
        </div>
      </div>

      <!-- Loading state for coverage -->
      <div v-if="selectedTag && isLoadingCoverage" class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-blue-500 mx-auto mb-2" />
        <p class="text-sm text-gray-500 dark:text-gray-400">Calculating tag coverage...</p>
      </div>

      <!-- Coverage error -->
      <div v-if="selectedTag && coverageError" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4 text-sm text-red-600 dark:text-red-400">
        {{ coverageError }}
      </div>

      <!-- Account Coverage Table -->
      <div v-if="selectedTag && tagCoverage && !isLoadingCoverage && tagCoverage.accounts.length > 0"
        class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
      >
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <UIcon name="i-heroicons-building-office-2" class="w-4 h-4 text-blue-400" />
            Account Coverage
          </h2>
          <UButton
            size="xs"
            color="blue"
            variant="ghost"
            icon="i-heroicons-currency-dollar"
            :to="`/account/costs`"
          >
            View cost breakdown
          </UButton>
        </div>

        <div class="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table class="w-full text-sm">
            <thead class="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-400 tracking-wider">Account</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-400 tracking-wider">Coverage</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-400 tracking-wider w-28">Tagged</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-400 tracking-wider w-28">Untagged</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <tr
                v-for="account in sortedCoverageAccounts"
                :key="account.accountId"
                class="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td class="px-4 py-3">
                  <div class="text-xs font-medium text-gray-900 dark:text-gray-100">
                    {{ account.accountName || account.accountId }}
                  </div>
                  <div v-if="account.accountName" class="text-xs text-gray-500 dark:text-gray-400">
                    {{ account.accountId }}
                  </div>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-2">
                    <div class="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <div
                        class="h-1.5 rounded-full transition-all duration-500"
                        :class="account.coveragePercent >= 80 ? 'bg-green-500' : account.coveragePercent >= 50 ? 'bg-yellow-500' : 'bg-red-500'"
                        :style="{ width: `${account.coveragePercent}%` }"
                      />
                    </div>
                    <span class="text-xs text-gray-600 dark:text-gray-400 w-10 text-right">
                      {{ account.coveragePercent.toFixed(0) }}%
                    </span>
                  </div>
                </td>
                <td class="px-4 py-3 text-right text-xs text-gray-900 dark:text-gray-100 font-mono">
                  {{ formatCostValue(account.taggedCost) }}
                </td>
                <td class="px-4 py-3 text-right text-xs font-mono" :class="account.untaggedCost > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'">
                  {{ formatCostValue(account.untaggedCost) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Untagged Alerts -->
      <div v-if="selectedTag && untaggedAccounts.length > 0 && !isLoadingCoverage" class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h2 class="text-base font-semibold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-2">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4" />
          Untagged Cost Alerts
        </h2>
        <p class="text-sm text-amber-700 dark:text-amber-400 mb-3">
          {{ untaggedAccounts.length }} account{{ untaggedAccounts.length !== 1 ? 's have' : ' has' }} significant untagged costs for "{{ selectedTag }}".
          Adding this tag to resources improves cost tracking and allocation.
        </p>
        <div class="space-y-2">
          <div
            v-for="account in untaggedAccounts"
            :key="account.accountId"
            class="flex items-center justify-between text-sm"
          >
            <span class="text-amber-800 dark:text-amber-300 font-medium">
              {{ account.accountName || account.accountId }}
            </span>
            <span class="text-amber-700 dark:text-amber-400 font-mono text-xs">
              {{ formatCostValue(account.untaggedCost) }} untagged
              ({{ (100 - account.coveragePercent).toFixed(0) }}%)
            </span>
          </div>
        </div>
      </div>

      <!-- Available Tags Section -->
      <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
          <UIcon name="i-heroicons-tag" class="w-4 h-4 text-blue-400" />
          Available Tags
        </h2>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Click a tag to analyze its coverage. Tags prefixed with <code class="bg-gray-100 dark:bg-gray-800 px-1 rounded">aws:</code> are system-managed.
        </p>

        <div v-if="isLoadingTags" class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 py-4">
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
          Loading tags...
        </div>

        <div v-else-if="tagsError" class="text-sm text-red-500 py-4">
          {{ tagsError }}
        </div>

        <div v-else-if="!availableTags.length" class="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
          <UIcon name="i-heroicons-tag" class="w-6 h-6 mx-auto mb-2 text-gray-400" />
          <p>No cost allocation tags found.</p>
          <p class="text-xs mt-1">Tags must be activated in the <strong>AWS Billing Console</strong> before they appear here.</p>
        </div>

        <div v-else>
          <div v-if="customTags.length > 0" class="mb-2">
            <span class="text-xs text-gray-500 dark:text-gray-400 font-medium">Custom Tags</span>
            <div class="flex flex-wrap gap-2 mt-1">
              <UBadge
                v-for="tag in customTags"
                :key="tag"
                :color="selectedTag === tag ? 'blue' : 'gray'"
                variant="soft"
                size="sm"
                class="cursor-pointer hover:opacity-80 transition-opacity"
                @click="onTagSelect(tag)"
              >
                {{ tag }}
              </UBadge>
            </div>
          </div>
          <div v-if="systemTags.length > 0" class="mt-3">
            <span class="text-xs text-gray-500 dark:text-gray-400 font-medium">AWS System Tags</span>
            <div class="flex flex-wrap gap-2 mt-1">
              <UBadge
                v-for="tag in systemTags"
                :key="tag"
                :color="selectedTag === tag ? 'blue' : 'gray'"
                variant="subtle"
                size="sm"
                class="cursor-pointer hover:opacity-80 transition-opacity"
                @click="onTagSelect(tag)"
              >
                {{ tag }}
              </UBadge>
            </div>
          </div>
        </div>
      </div>

      <!-- Info Banner -->
      <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg px-4 py-3 flex items-start gap-3">
        <UIcon name="i-heroicons-information-circle" class="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
        <div class="text-sm text-blue-800 dark:text-blue-200">
          <p>
            <strong>Cost Allocation Tags</strong> are labels attached to AWS resources (like Project, Owner, or Environment).
            They must be activated in the AWS Billing Console before they appear in cost data.
            Higher tag coverage means better cost tracking and accountability.
          </p>
          <NuxtLink to="/support/docs?topic=cost-tags-guide" class="inline-flex items-center gap-1 mt-1 text-blue-600 dark:text-blue-300 hover:underline font-medium">
            Learn more about tag analysis
            <UIcon name="i-heroicons-arrow-right" class="w-3 h-3" />
          </NuxtLink>
        </div>
      </div>

      <!-- Placeholder when no tag is selected -->
      <div v-if="!selectedTag && !isLoadingTags && availableTags.length > 0" class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-8 text-center">
        <UIcon name="i-heroicons-chart-bar" class="w-10 h-10 text-gray-400 mx-auto mb-3" />
        <p class="text-gray-600 dark:text-gray-400 text-sm">
          Select a tag above to view coverage analysis across your accounts.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatCostValue } from '~/utils/cost-filters'

const route = useRoute()
const initialTag = (route.query.tag as string) || null

const selectedTag = ref<string | null>(initialTag)
const selectedPeriod = ref('thisMonth')

const periodOptions = [
  { label: 'This Month', value: 'thisMonth' },
  { label: 'Last Month', value: 'lastMonth' },
  { label: 'Last 90 Days', value: 'last90days' },
  { label: 'Year to Date', value: 'ytd' },
  { label: 'Last 12 Months', value: 'last12months' }
]

const {
  availableTags,
  tagCoverage,
  isLoadingTags,
  isLoadingCoverage,
  tagsError,
  coverageError,
  fetchAvailableTags,
  fetchTagCoverage,
  clearTagCache
} = useCostTags()

const customTags = computed(() =>
  availableTags.value.filter(t => !t.startsWith('aws:'))
)
const systemTags = computed(() =>
  availableTags.value.filter(t => t.startsWith('aws:'))
)

const tagSelectOptions = computed(() =>
  availableTags.value.map(t => ({ label: t, value: t }))
)

const sortedCoverageAccounts = computed(() =>
  [...(tagCoverage.value?.accounts ?? [])].sort((a, b) => b.untaggedCost - a.untaggedCost)
)

const untaggedAccounts = computed(() =>
  sortedCoverageAccounts.value.filter(a => a.coveragePercent < 95 && a.untaggedCost > 10)
)

const untaggedIsHigh = computed(() => {
  if (!tagCoverage.value) return false
  const total = tagCoverage.value.totalTaggedCost + tagCoverage.value.totalUntaggedCost
  return total > 0 && (tagCoverage.value.totalUntaggedCost / total) > 0.2
})

const coverageColorClass = computed(() => {
  const pct = tagCoverage.value?.overallCoverage ?? 0
  if (pct >= 80) return 'text-green-600 dark:text-green-400'
  if (pct >= 50) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
})

const coverageBarClass = computed(() => {
  const pct = tagCoverage.value?.overallCoverage ?? 0
  if (pct >= 80) return 'bg-green-500'
  if (pct >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
})

async function onTagSelect(tag: string | null) {
  selectedTag.value = tag
  if (tag) {
    await fetchTagCoverage(tag, undefined, selectedPeriod.value)
  }
}

async function refresh() {
  clearTagCache()
  await fetchAvailableTags()
  if (selectedTag.value) {
    await fetchTagCoverage(selectedTag.value, undefined, selectedPeriod.value)
  }
}

watch(selectedPeriod, () => {
  if (selectedTag.value) {
    void fetchTagCoverage(selectedTag.value, undefined, selectedPeriod.value)
  }
})

onMounted(async () => {
  await fetchAvailableTags()
  if (initialTag && availableTags.value.includes(initialTag)) {
    await fetchTagCoverage(initialTag, undefined, selectedPeriod.value)
  }
})
</script>
