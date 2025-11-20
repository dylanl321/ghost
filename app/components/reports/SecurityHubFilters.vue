<template>
  <div class="space-y-4">
    <div class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
      Filter Options
    </div>

    <!-- Severity Levels -->
    <UFormGroup label="Severity Levels" help="Select which severity findings to include">
      <div class="flex flex-wrap gap-2">
        <UBadge
          v-for="severity in severities"
          :key="severity.value"
          :color="isSeveritySelected(severity.value) ? severity.color : 'gray'"
          :variant="isSeveritySelected(severity.value) ? 'solid' : 'soft'"
          class="cursor-pointer"
          @click="toggleSeverity(severity.value)"
        >
          {{ severity.label }}
        </UBadge>
      </div>
    </UFormGroup>

    <!-- Workflow Status -->
    <UFormGroup label="Workflow Status" help="Filter by finding status">
      <div class="flex flex-wrap gap-2">
        <UBadge
          v-for="status in workflowStatuses"
          :key="status.value"
          :color="isStatusSelected(status.value) ? status.color : 'gray'"
          :variant="isStatusSelected(status.value) ? 'solid' : 'soft'"
          class="cursor-pointer"
          @click="toggleStatus(status.value)"
        >
          {{ status.label }}
        </UBadge>
      </div>
    </UFormGroup>

    <!-- Products -->
    <UFormGroup label="Products" help="Filter by security product">
      <USelectMenu
        v-model="selectedProducts"
        :options="productOptions"
        multiple
        searchable
        placeholder="Select products..."
        value-attribute="value"
      >
        <template #label>
          <span v-if="!selectedProducts || selectedProducts.length === 0">
            All products
          </span>
          <span v-else>
            {{ selectedProducts.length }} selected
          </span>
        </template>
      </USelectMenu>
    </UFormGroup>

    <!-- Compliance Standards -->
    <UFormGroup label="Compliance Standards" help="Filter by compliance framework">
      <USelectMenu
        v-model="selectedComplianceStandards"
        :options="complianceOptions"
        multiple
        searchable
        placeholder="Select standards..."
        value-attribute="value"
      >
        <template #label>
          <span v-if="!selectedComplianceStandards || selectedComplianceStandards.length === 0">
            All standards
          </span>
          <span v-else>
            {{ selectedComplianceStandards.length }} selected
          </span>
        </template>
      </USelectMenu>
    </UFormGroup>

    <!-- Lookback Period -->
    <UFormGroup label="Lookback Period" help="How far back to search for findings">
      <USelectMenu
        v-model="filters.lookbackDays"
        :options="lookbackOptions"
        placeholder="Select period..."
      />
    </UFormGroup>

    <!-- Active Only -->
    <UFormGroup>
      <div class="flex items-center gap-2">
        <UCheckbox
          :model-value="filters.activeOnly !== false"
          @update:model-value="filters.activeOnly = $event"
          label="Only show active findings (exclude archived)"
        />
      </div>
    </UFormGroup>

    <!-- Quick Filters -->
    <div class="pt-3 border-t border-gray-200 dark:border-gray-700">
      <div class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Quick Filters</div>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="xs"
          color="red"
          variant="soft"
          @click="setCriticalOnly"
        >
          Critical Only
        </UButton>
        <UButton
          size="xs"
          color="orange"
          variant="soft"
          @click="setHighAndCritical"
        >
          High & Critical
        </UButton>
        <UButton
          size="xs"
          color="blue"
          variant="soft"
          @click="setNewFindings"
        >
          New Findings
        </UButton>
        <UButton
          size="xs"
          color="gray"
          variant="soft"
          @click="clearFilters"
        >
          Clear All
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SecurityHubDatasetFilters } from '~/shared/types/dataset-reports'

const filters = defineModel<SecurityHubDatasetFilters>({
  default: () => ({
    activeOnly: true,
    lookbackDays: 30,
    severities: [],
    statuses: [],
    products: [],
    complianceStandards: []
  })
})

// Computed wrappers to extract just the values from select menus
const selectedProducts = computed({
  get: () => filters.value.products || [],
  set: (val: any[]) => {
    if (!filters.value.products) {
      filters.value.products = []
    }
    filters.value.products = val.map(v => typeof v === 'object' ? v.value : v)
  }
})

const selectedComplianceStandards = computed({
  get: () => filters.value.complianceStandards || [],
  set: (val: any[]) => {
    if (!filters.value.complianceStandards) {
      filters.value.complianceStandards = []
    }
    filters.value.complianceStandards = val.map(v => typeof v === 'object' ? v.value : v)
  }
})

// Constants
const severities = [
  { value: 'CRITICAL', label: 'Critical', color: 'red' },
  { value: 'HIGH', label: 'High', color: 'orange' },
  { value: 'MEDIUM', label: 'Medium', color: 'yellow' },
  { value: 'LOW', label: 'Low', color: 'blue' },
  { value: 'INFORMATIONAL', label: 'Info', color: 'gray' }
]

const workflowStatuses = [
  { value: 'NEW', label: 'New', color: 'red' },
  { value: 'NOTIFIED', label: 'Notified', color: 'yellow' },
  { value: 'RESOLVED', label: 'Resolved', color: 'green' },
  { value: 'SUPPRESSED', label: 'Suppressed', color: 'gray' }
]

const productOptions = [
  { value: 'GuardDuty', label: 'Amazon GuardDuty' },
  { value: 'Inspector', label: 'Amazon Inspector' },
  { value: 'Macie', label: 'Amazon Macie' },
  { value: 'IAM Access Analyzer', label: 'IAM Access Analyzer' },
  { value: 'Security Hub', label: 'Security Hub' },
  { value: 'Firewall Manager', label: 'Firewall Manager' },
  { value: 'Systems Manager', label: 'Systems Manager' },
  { value: 'Detective', label: 'Amazon Detective' }
]

const complianceOptions = [
  { value: 'aws-foundational-security-best-practices', label: 'AWS Foundational Security Best Practices' },
  { value: 'cis-aws-foundations-benchmark/v/1.4.0', label: 'CIS AWS Foundations Benchmark v1.4.0' },
  { value: 'cis-aws-foundations-benchmark/v/1.2.0', label: 'CIS AWS Foundations Benchmark v1.2.0' },
  { value: 'pci-dss', label: 'PCI DSS' },
  { value: 'nist-800-53/v/5.0.0', label: 'NIST 800-53 Rev 5' },
  { value: 'nist-csf', label: 'NIST Cybersecurity Framework' }
]

const lookbackOptions = [
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 60, label: 'Last 60 days' },
  { value: 90, label: 'Last 90 days' }
]

// Methods
function isSeveritySelected(severity: string): boolean {
  return filters.value.severities?.includes(severity as any) || false
}

function toggleSeverity(severity: string) {
  if (!filters.value.severities) {
    filters.value.severities = []
  }

  const index = filters.value.severities.indexOf(severity as any)
  if (index > -1) {
    filters.value.severities.splice(index, 1)
  } else {
    filters.value.severities.push(severity as any)
  }
}

function isStatusSelected(status: string): boolean {
  return filters.value.statuses?.includes(status as any) || false
}

function toggleStatus(status: string) {
  if (!filters.value.statuses) {
    filters.value.statuses = []
  }

  const index = filters.value.statuses.indexOf(status as any)
  if (index > -1) {
    filters.value.statuses.splice(index, 1)
  } else {
    filters.value.statuses.push(status as any)
  }
}

function setCriticalOnly() {
  filters.value.severities = ['CRITICAL']
  filters.value.statuses = ['NEW', 'NOTIFIED']
}

function setHighAndCritical() {
  filters.value.severities = ['CRITICAL', 'HIGH']
  filters.value.statuses = ['NEW', 'NOTIFIED']
}

function setNewFindings() {
  filters.value.severities = undefined
  filters.value.statuses = ['NEW']
  filters.value.lookbackDays = 7
}

function clearFilters() {
  filters.value = {
    activeOnly: true,
    lookbackDays: 30,
    severities: [],
    statuses: [],
    products: [],
    complianceStandards: []
  }
}
</script>
