<template>
  <Story
    title="Dashboard Card"
    group="dashboard"
    :layout="{ type: 'grid', width: '400px' }"
  >
    <Variant title="Default">
      <DashboardCard title="Revenue Overview">
        <p>This is the card content. You can add any content here including charts, stats, or other components.</p>
      </DashboardCard>
    </Variant>

    <Variant title="Elevated">
      <DashboardCard title="Elevated Card" variant="elevated">
        <div class="space-y-2">
          <div class="text-3xl font-bold">$12,345</div>
          <div class="text-muted">Total Revenue</div>
        </div>
      </DashboardCard>
    </Variant>

    <Variant title="Bordered">
      <DashboardCard title="Important Metrics" variant="bordered">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-sm text-muted">Active Users</div>
            <div class="text-2xl font-semibold">1,234</div>
          </div>
          <div>
            <div class="text-sm text-muted">Growth Rate</div>
            <div class="text-2xl font-semibold text-success-500">+12%</div>
          </div>
        </div>
      </DashboardCard>
    </Variant>

    <Variant title="Loading State">
      <DashboardCard title="Loading State" :loading="true">
        <div class="animate-pulse">
          <div class="h-4 bg-neutral-200 rounded w-3/4 mb-2"></div>
          <div class="h-4 bg-neutral-200 rounded w-1/2"></div>
        </div>
      </DashboardCard>
    </Variant>

    <Variant title="With Header Action">
      <DashboardCard title="Card with Actions">
        <template #header-action>
          <button class="text-sm text-primary-500 hover:text-primary-600">
            View All →
          </button>
        </template>
        <p>Card content with header action button</p>
      </DashboardCard>
    </Variant>

    <Variant title="With Footer">
      <DashboardCard title="Card with Footer">
        <p>Main content area</p>
        <template #footer>
          <div class="flex justify-between items-center pt-4 border-t">
            <span class="text-sm text-muted">Last updated: 5 mins ago</span>
            <button class="text-sm text-primary-500">Refresh</button>
          </div>
        </template>
      </DashboardCard>
    </Variant>

    <Variant title="Compact">
      <DashboardCard title="Compact Card" :compact="true">
        <div class="text-sm">Compact padding for dense layouts</div>
      </DashboardCard>
    </Variant>

    <template #controls>
      <HstText v-model="title" title="Title" />
      <HstSelect
        v-model="variant"
        title="Variant"
        :options="[
          { value: 'default', label: 'Default' },
          { value: 'elevated', label: 'Elevated' },
          { value: 'bordered', label: 'Bordered' },
        ]"
      />
      <HstCheckbox v-model="loading" title="Loading" />
      <HstCheckbox v-model="compact" title="Compact" />
    </template>
  </Story>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import DashboardCard from './DashboardCard.vue'

// Controls
const title = ref('Dashboard Card')
const variant = ref('default')
const loading = ref(false)
const compact = ref(false)
</script>