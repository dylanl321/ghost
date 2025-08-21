<template>
  <Story
    title="Metric Display"
    group="dashboard"
    :layout="{ type: 'grid', width: '300px' }"
  >
    <Variant title="Default">
      <MetricDisplay
        label="Total Users"
        :value="1234"
      />
    </Variant>

    <Variant title="With Currency">
      <MetricDisplay
        label="Revenue"
        :value="125650"
        prefix="$"
        format="currency"
      />
    </Variant>

    <Variant title="With Trend Up">
      <MetricDisplay
        label="Monthly Active Users"
        :value="8765"
        :trend="12.5"
        description="Compared to last month"
      />
    </Variant>

    <Variant title="With Trend Down">
      <MetricDisplay
        label="Bounce Rate"
        :value="42.3"
        suffix="%"
        :trend="-8.2"
        description="Compared to last week"
      />
    </Variant>

    <Variant title="Small Size">
      <MetricDisplay
        label="Active Sessions"
        :value="342"
        size="sm"
      />
    </Variant>

    <Variant title="Large Size">
      <MetricDisplay
        label="Total Revenue"
        :value="1250000"
        prefix="$"
        format="currency"
        size="lg"
        :trend="15.8"
        description="Year-to-date performance"
      />
    </Variant>

    <Variant title="Percent Format">
      <MetricDisplay
        label="Conversion Rate"
        :value="3.7"
        format="percent"
        :trend="5.2"
      />
    </Variant>

    <Variant title="Interactive Controls">
      <MetricDisplay
        :label="label"
        :value="value"
        :prefix="prefix"
        :suffix="suffix"
        :trend="trend"
        :description="description"
        :size="size"
        :format="format"
      />
    </Variant>

    <template #controls>
      <HstText v-model="label" title="Label" />
      <HstNumber v-model="value" title="Value" />
      <HstText v-model="prefix" title="Prefix" />
      <HstText v-model="suffix" title="Suffix" />
      <HstNumber v-model="trend" title="Trend %" />
      <HstText v-model="description" title="Description" />
      <HstSelect
        v-model="size"
        title="Size"
        :options="[
          { value: 'sm', label: 'Small' },
          { value: 'md', label: 'Medium' },
          { value: 'lg', label: 'Large' },
        ]"
      />
      <HstSelect
        v-model="format"
        title="Format"
        :options="[
          { value: 'number', label: 'Number' },
          { value: 'currency', label: 'Currency' },
          { value: 'percent', label: 'Percent' },
        ]"
      />
    </template>
  </Story>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import MetricDisplay from './MetricDisplay.vue'

// Controls
const label = ref('Metric Label')
const value = ref(1234)
const prefix = ref('')
const suffix = ref('')
const trend = ref(0)
const description = ref('')
const size = ref<'md' | 'sm' | 'lg'>('md')
const format = ref<'number' | 'currency' | 'percent'>('number')
</script>