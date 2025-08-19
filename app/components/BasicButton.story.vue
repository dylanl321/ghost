<template>
  <Story title="Basic Button" group="components">
    <Variant title="Primary">
      <BasicButton>Primary Button</BasicButton>
    </Variant>

    <Variant title="Secondary">
      <BasicButton variant="secondary">Secondary Button</BasicButton>
    </Variant>

    <Variant title="Outline">
      <BasicButton variant="outline">Outline Button</BasicButton>
    </Variant>

    <Variant title="Ghost">
      <BasicButton variant="ghost">Ghost Button</BasicButton>
    </Variant>

    <Variant title="Sizes">
      <div class="button-group">
        <BasicButton size="sm">Small</BasicButton>
        <BasicButton size="md">Medium</BasicButton>
        <BasicButton size="lg">Large</BasicButton>
      </div>
    </Variant>

    <Variant title="States">
      <div class="button-group">
        <BasicButton>Normal</BasicButton>
        <BasicButton :loading="true">Loading</BasicButton>
        <BasicButton :disabled="true">Disabled</BasicButton>
      </div>
    </Variant>

    <Variant title="Interactive">
      <BasicButton
        :variant="variant"
        :size="size"
        :loading="loading"
        :disabled="disabled"
        @click="handleClick"
      >
        {{ buttonText }}
      </BasicButton>
      <div v-if="clickCount > 0" class="click-counter">
        Clicked {{ clickCount }} times
      </div>
    </Variant>

    <template #controls>
      <HstText v-model="buttonText" title="Button Text" />
      <HstSelect
        v-model="variant"
        title="Variant"
        :options="[
          { value: 'primary', label: 'Primary' },
          { value: 'secondary', label: 'Secondary' },
          { value: 'outline', label: 'Outline' },
          { value: 'ghost', label: 'Ghost' },
        ]"
      />
      <HstSelect
        v-model="size"
        title="Size"
        :options="[
          { value: 'sm', label: 'Small' },
          { value: 'md', label: 'Medium' },
          { value: 'lg', label: 'Large' },
        ]"
      />
      <HstCheckbox v-model="loading" title="Loading" />
      <HstCheckbox v-model="disabled" title="Disabled" />
    </template>
  </Story>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import BasicButton from './BasicButton.vue'

// Controls
const buttonText = ref('Click Me!')
const variant = ref('primary')
const size = ref('md')
const loading = ref(false)
const disabled = ref(false)

// Interactive demo
const clickCount = ref(0)

function handleClick() {
  clickCount.value++
}
</script>

<style scoped>
.button-group {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.click-counter {
  margin-top: 1rem;
  padding: 0.5rem 1rem;
  background: #f0f9ff;
  border: 1px solid #0ea5e9;
  border-radius: 4px;
  color: #0c4a6e;
  font-size: 0.875rem;
}
</style>