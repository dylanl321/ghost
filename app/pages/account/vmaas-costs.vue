<template>
  <div class="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div class="mb-1 flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <UIcon name="i-heroicons-server-stack" class="h-4 w-4" />
          VMaaS
        </div>
        <h1 class="text-2xl font-semibold text-gray-950 dark:text-white">Operations cost view</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">GovCloud account 650505514334</p>
      </div>
      <div class="flex flex-wrap items-end gap-2">
        <label class="text-xs font-medium text-gray-600 dark:text-gray-400">Allocated month
          <input v-model="allocationMonth" type="month" class="mt-1 block rounded border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900">
        </label>
        <UButton icon="i-heroicons-arrow-path" color="gray" variant="soft" :loading="pending" @click="refresh()">Refresh</UButton>
      </div>
    </header>

    <UAlert
      v-if="error"
      color="red"
      variant="soft"
      icon="i-heroicons-exclamation-triangle"
      title="VMaaS costs are unavailable"
      :description="error.message"
    />

    <template v-if="pending && !report">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <USkeleton v-for="index in 4" :key="index" class="h-28" />
      </div>
      <USkeleton class="h-96" />
    </template>

    <template v-else-if="report">
      <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="VMaaS cost summary">
        <UCard v-for="metric in summaryMetrics" :key="metric.label" :ui="{ body: { padding: 'p-4 sm:p-4' } }">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{{ metric.label }}</p>
              <p class="mt-2 text-xl font-semibold text-gray-950 dark:text-white">{{ money(metric.value) }}</p>
              <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ metric.note }}</p>
            </div>
            <UIcon :name="metric.icon" class="h-5 w-5 flex-none text-emerald-600 dark:text-emerald-400" />
          </div>
        </UCard>
      </section>

      <UAlert
        color="blue"
        variant="soft"
        icon="i-heroicons-information-circle"
        title="Actuals and projections use different clocks"
        :description="actualsNote"
      />

      <section class="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <header class="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="font-semibold text-gray-950 dark:text-white">Allocated usage</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">Closed-month direct usage allocated from the account pro forma total</p>
          </div>
          <div v-if="report.allocation.status === 'available'" class="flex gap-2">
            <UButton :to="exportUrl('csv')" icon="i-heroicons-arrow-down-tray" color="gray" variant="soft">CSV</UButton>
            <UButton :to="exportUrl('xlsx')" icon="i-heroicons-table-cells" color="gray" variant="soft">XLSX</UButton>
          </div>
        </header>
        <UAlert
          v-if="report.allocation.status !== 'available'"
          class="m-4"
          :color="report.allocation.status === 'pending' ? 'yellow' : 'red'"
          variant="soft"
          :title="report.allocation.status === 'pending' ? 'Allocation is not finalized' : 'Allocation is unavailable'"
          :description="report.allocation.issues.join(' ') || 'Cost data is incomplete.'"
        />
        <template v-else>
          <div class="grid gap-3 border-b border-gray-200 p-4 dark:border-gray-800 sm:grid-cols-3">
            <div><p class="text-xs uppercase text-gray-500">Tenant direct usage</p><p class="text-lg font-semibold">{{ money(report.allocation.allocated_direct_usd) }}</p></div>
            <div><p class="text-xs uppercase text-gray-500">GDMS IT residual</p><p class="text-lg font-semibold">{{ money(report.allocation.shared_residual_usd) }}</p></div>
            <div><p class="text-xs uppercase text-gray-500">Pro forma account total</p><p class="text-lg font-semibold">{{ money(report.allocation.proforma_total_usd) }}</p></div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[1080px] text-left text-sm">
              <thead class="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-800"><tr>
                <th class="px-4 py-2">Department / CostCenter</th><th class="px-3 py-2">Team / TenantID</th><th class="px-3 py-2">Project</th><th class="px-3 py-2">Cost managers</th><th class="px-3 py-2 text-right">Billable direct</th><th class="px-4 py-2 text-right">Allocated pro forma</th>
              </tr></thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                <tr v-for="row in report.allocation.rows" :key="`${row.tenant_id}:${row.cost_center}`">
                  <td class="px-4 py-3"><p>{{ row.department || 'Department not recorded' }}</p><p class="font-mono text-xs text-gray-500">{{ row.cost_center }}</p></td>
                  <td class="px-3 py-3"><p>{{ row.team_id || 'Team not mapped' }}</p><p class="font-mono text-xs text-gray-500">{{ row.tenant_id }}</p></td>
                  <td class="px-3 py-3">{{ row.project || 'Not recorded' }}</td>
                  <td class="px-3 py-3 text-xs">{{ row.cost_manager_emails.join(', ') || 'Not recorded' }}</td>
                  <td class="px-3 py-3 text-right tabular-nums">{{ money(row.billable_direct_usd) }}</td>
                  <td class="px-4 py-3 text-right font-medium tabular-nums">{{ money(row.allocated_proforma_usd) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-if="report.allocation.issues.length" class="border-t border-gray-200 px-4 py-3 text-xs text-amber-700 dark:border-gray-800 dark:text-amber-400">{{ report.allocation.issues.join(' ') }}</p>
        </template>
      </section>

      <section class="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <header class="flex flex-col gap-3 border-b border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="font-semibold text-gray-950 dark:text-white">Server projections</h2>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ filteredServers.length }} of {{ report.servers.length }} servers</p>
          </div>
          <div class="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_150px]">
            <UInput v-model="search" icon="i-heroicons-magnifying-glass" placeholder="Search server, team, or department" />
            <USelect v-model="osFilter" :options="osOptions" />
          </div>
        </header>

        <div v-if="!filteredServers.length" class="px-4 py-16 text-center text-sm text-gray-500 dark:text-gray-400">
          No servers match these filters.
        </div>

        <div v-for="group in groupedServers" v-else :key="group.key">
          <div class="border-b border-gray-200 bg-gray-50 px-4 py-2.5 dark:border-gray-800 dark:bg-gray-950">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <p class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ group.team }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">{{ group.department || 'Department not recorded' }} · {{ group.servers.length }} server{{ group.servers.length === 1 ? '' : 's' }}</p>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[980px] text-left text-sm">
              <thead class="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                <tr>
                  <th class="px-4 py-2 font-medium">Server</th>
                  <th class="px-3 py-2 font-medium">OS</th>
                  <th class="px-3 py-2 font-medium">Size</th>
                  <th class="px-3 py-2 font-medium">Schedule</th>
                  <th class="px-3 py-2 text-right font-medium">Hourly</th>
                  <th class="px-3 py-2 text-right font-medium">Scheduled month</th>
                  <th class="px-4 py-2 text-right font-medium">24/7 month</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-800">
                <tr v-for="server in group.servers" :key="server.instance_id">
                  <td class="px-4 py-3">
                    <p class="font-medium text-gray-950 dark:text-white">{{ server.name }}</p>
                    <p class="text-xs capitalize text-gray-500 dark:text-gray-400">{{ server.state }}</p>
                  </td>
                  <td class="px-3 py-3">{{ server.operating_system }}</td>
                  <td class="px-3 py-3 font-mono text-xs">{{ server.instance_type }}</td>
                  <td class="px-3 py-3">
                    <p>{{ server.schedule }}</p>
                    <p v-if="server.scheduled_hours !== null" class="text-xs text-gray-500 dark:text-gray-400">{{ number(server.scheduled_hours) }} hours</p>
                    <p v-else class="text-xs text-amber-700 dark:text-amber-400">Estimate unavailable</p>
                  </td>
                  <td class="px-3 py-3 text-right tabular-nums">{{ hourly(server.compute_hourly_usd) }}</td>
                  <td class="px-3 py-3 text-right tabular-nums">{{ money(server.scheduled_monthly_usd) }}</td>
                  <td class="px-4 py-3 text-right tabular-nums">{{ money(server.always_on_monthly_usd) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <p class="text-xs leading-5 text-gray-500 dark:text-gray-400">
        Per-server figures are on-demand projections, not invoice line items. Persistent EBS storage is charged for the full month. Savings Plans, manual power actions, data transfer, backup, support, tax, and other usage can change the final invoice.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ middleware: 'auth', title: 'VMaaS Costs' })

interface ServerCost {
  instance_id: string
  name: string
  team_id: string
  department: string
  operating_system: string
  instance_type: string
  state: string
  schedule: string
  compute_hourly_usd: number | null
  scheduled_hours: number | null
  scheduled_monthly_usd: number | null
  always_on_monthly_usd: number | null
}

interface CostReport {
  generated_at: string
  month: { data_through: string | null }
  actuals: { billable_mtd_usd: number | null; proforma_mtd_usd: number | null }
  projections: { scheduled_monthly_usd: number; always_on_monthly_usd: number; schedule_savings_usd: number; unavailable_server_count: number }
  servers: ServerCost[]
  allocation: {
    status: 'available' | 'pending' | 'unavailable'
    month: { start: string; end: string; data_through: string | null }
    billable_total_usd: number | null
    proforma_total_usd: number | null
    allocated_direct_usd: number | null
    shared_residual_usd: number | null
    reconciled: boolean
    issues: string[]
    rows: Array<{ tenant_id: string; team_id: string; department: string; cost_center: string; project: string; owner: string; cost_manager_emails: string[]; billable_direct_usd: number; allocation_share: number; allocated_proforma_usd: number }>
  }
}

const requestHeaders = useRequestHeaders(['cookie', 'authorization'])
const now = new Date()
const allocationMonth = ref(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7))
const { data, pending, error, refresh } = await useFetch<{ data: CostReport }>('/api/integrations/vmaas/costs', {
  headers: requestHeaders,
  query: computed(() => ({ month: allocationMonth.value }))
})
const report = computed(() => data.value?.data || null)
const search = ref('')
const osFilter = ref('all')
const osOptions = [
  { label: 'All operating systems', value: 'all' },
  { label: 'Linux', value: 'Linux' },
  { label: 'RHEL', value: 'RHEL' },
  { label: 'Windows', value: 'Windows' }
]

const filteredServers = computed(() => (report.value?.servers || []).filter(server => {
  const text = `${server.name} ${server.team_id} ${server.department} ${server.instance_type}`.toLowerCase()
  return (!search.value || text.includes(search.value.toLowerCase())) && (osFilter.value === 'all' || server.operating_system === osFilter.value)
}))

const groupedServers = computed(() => {
  const groups = new Map<string, { key: string; team: string; department: string; servers: ServerCost[] }>()
  for (const server of filteredServers.value) {
    const key = `${server.department}|${server.team_id}`
    if (!groups.has(key)) groups.set(key, { key, team: server.team_id, department: server.department, servers: [] })
    groups.get(key)!.servers.push(server)
  }
  return [...groups.values()].sort((a, b) => a.department.localeCompare(b.department) || a.team.localeCompare(b.team))
})

const summaryMetrics = computed(() => [
  { label: 'Billable MTD', value: report.value?.actuals.billable_mtd_usd ?? null, note: 'Delayed AWS actual', icon: 'i-heroicons-receipt-percent' },
  { label: 'Pro forma MTD', value: report.value?.actuals.proforma_mtd_usd ?? null, note: 'Delayed allocated actual', icon: 'i-heroicons-scale' },
  { label: 'Scheduled month', value: report.value?.projections.scheduled_monthly_usd ?? null, note: 'Current schedules', icon: 'i-heroicons-clock' },
  { label: 'Projected savings', value: report.value?.projections.schedule_savings_usd ?? null, note: `Compared with ${money(report.value?.projections.always_on_monthly_usd ?? null)} always on`, icon: 'i-heroicons-arrow-trending-down' }
])

const actualsNote = computed(() => {
  const through = report.value?.month.data_through ? ` through ${report.value.month.data_through}` : ''
  const unavailable = report.value?.projections.unavailable_server_count || 0
  return `AWS actuals are delayed${through}. Server projections are calculated now from instance, storage, OS, and scheduler configuration.${unavailable ? ` ${unavailable} server estimate${unavailable === 1 ? ' is' : 's are'} unavailable because a schedule or price could not be interpreted safely.` : ''}`
})

function money(value: number | null | undefined): string {
  return value === null || value === undefined
    ? 'Unavailable'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
}

function hourly(value: number | null): string {
  return value === null ? 'Unavailable' : `${money(value)}/hr`
}

function number(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)
}

function exportUrl(format: 'csv' | 'xlsx'): string {
  return `/api/integrations/vmaas/allocation-export?month=${encodeURIComponent(allocationMonth.value)}&format=${format}`
}
</script>
