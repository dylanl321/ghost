<template>
  <div class="p-6 space-y-8">
    <!-- Basic Components -->
    <section class="space-y-4">
      <h2 class="text-xl font-bold text-gray-900 dark:text-white">Basic Components</h2>
      
      <!-- Buttons -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Buttons</h3>
        <div class="flex gap-2 flex-wrap">
          <UButton>Default Button</UButton>
          <UButton color="primary">Primary</UButton>
          <UButton color="secondary">Secondary</UButton>
          <UButton color="success">Success</UButton>
          <UButton color="warning">Warning</UButton>
          <UButton color="error">Error</UButton>
          <UButton variant="outline">Outline</UButton>
          <UButton variant="ghost">Ghost</UButton>
          <UButton variant="soft">Soft</UButton>
          <UButton size="sm">Small</UButton>
          <UButton size="lg">Large</UButton>
          <UButton icon="i-heroicons-star">With Icon</UButton>
          <UButton disabled>Disabled</UButton>
          <UButton loading>Loading</UButton>
        </div>
      </div>

      <!-- Badges -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Badges</h3>
        <div class="flex gap-2 flex-wrap">
          <UBadge>Default</UBadge>
          <UBadge color="primary">Primary</UBadge>
          <UBadge color="success">Success</UBadge>
          <UBadge color="warning">Warning</UBadge>
          <UBadge color="error">Error</UBadge>
          <UBadge variant="outline">Outline</UBadge>
          <UBadge variant="soft">Soft</UBadge>
          <UBadge size="sm">Small</UBadge>
          <UBadge size="lg">Large</UBadge>
        </div>
      </div>

      <!-- Cards -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Cards</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UCard>
            <template #header>
              <h4 class="font-semibold">Basic Card</h4>
            </template>
            <p>This is a basic card with header and body content.</p>
            <template #footer>
              <div class="flex justify-end">
                <UButton size="sm">Action</UButton>
              </div>
            </template>
          </UCard>
          
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h4 class="font-semibold">Card with Actions</h4>
                <UBadge color="success">Active</UBadge>
              </div>
            </template>
            <p>Card with badge in header and multiple actions in footer.</p>
            <template #footer>
              <div class="flex justify-between">
                <UButton variant="ghost" size="sm">Cancel</UButton>
                <UButton size="sm">Save</UButton>
              </div>
            </template>
          </UCard>
        </div>
      </div>
    </section>

    <!-- Form Components -->
    <section class="space-y-4">
      <h2 class="text-xl font-bold text-gray-900 dark:text-white">Form Components</h2>
      
      <!-- Inputs -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Inputs</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <UInput v-model="testData.input" placeholder="Basic input" />
          <UInput v-model="testData.inputWithIcon" icon="i-heroicons-envelope" placeholder="With icon" />
          <UInput v-model="testData.inputDisabled" placeholder="Disabled input" disabled />
          <UInput v-model="testData.inputError" placeholder="With error" error="This field is required" />
        </div>
      </div>

      <!-- Textarea -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Textarea</h3>
        <UTextarea v-model="testData.textarea" placeholder="Enter your message..." rows="3" />
      </div>

      <!-- Select -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Select</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <USelect 
            v-model="testData.select" 
            :items="selectOptions" 
            placeholder="Choose option"
          />
          <USelect 
            v-model="testData.multiSelect" 
            :items="selectOptions" 
            multiple
            placeholder="Multiple select"
          />
        </div>
      </div>

      <!-- Checkbox & Radio -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Checkbox & Radio</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <UCheckbox v-model="testData.checkbox" label="Checkbox option" />
            <UCheckbox v-model="testData.checkboxDisabled" label="Disabled checkbox" disabled />
          </div>
          <div class="space-y-2">
            <URadioGroup v-model="testData.radio" :items="radioOptions" />
          </div>
        </div>
      </div>

      <!-- Toggle/Switch -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Switch</h3>
        <div class="flex gap-4">
          <USwitch v-model="testData.switch" />
          <USwitch v-model="testData.switchWithLabel" label="Enable notifications" />
        </div>
      </div>
    </section>

    <!-- Navigation Components -->
    <section class="space-y-4">
      <h2 class="text-xl font-bold text-gray-900 dark:text-white">Navigation Components</h2>
      
      <!-- Tabs -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Tabs</h3>
        <UTabs v-model="testData.activeTab" :items="tabItems">
          <template #tab1>
            <p>Content for Tab 1 goes here.</p>
          </template>
          <template #tab2>
            <p>Content for Tab 2 goes here.</p>
          </template>
          <template #tab3>
            <p>Content for Tab 3 goes here.</p>
          </template>
        </UTabs>
      </div>

      <!-- Breadcrumb (Disabled - causes Link errors in Histoire) -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Breadcrumb</h3>
        <div class="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
          <p class="text-sm text-yellow-700 dark:text-yellow-300">
            UBreadcrumb disabled in Histoire due to Link component issues
          </p>
        </div>
      </div>
    </section>

    <!-- Data Display Components -->
    <section class="space-y-4">
      <h2 class="text-xl font-bold text-gray-900 dark:text-white">Data Display</h2>
      
      <!-- Avatar -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Avatar</h3>
        <div class="flex gap-2">
          <UAvatar src="https://github.com/nuxt.png" alt="Nuxt" />
          <UAvatar>JD</UAvatar>
          <UAvatar icon="i-heroicons-user" />
          <UAvatar size="sm">S</UAvatar>
          <UAvatar size="lg">L</UAvatar>
        </div>
      </div>

      <!-- Progress -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Progress</h3>
        <div class="space-y-2">
          <UProgress :value="25" />
          <UProgress :value="50" color="primary" />
          <UProgress :value="75" color="success" />
        </div>
      </div>

      <!-- Alert -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Alert</h3>
        <div class="space-y-2">
          <UAlert title="Info Alert" description="This is an informational alert." />
          <UAlert title="Success Alert" description="Operation completed successfully." color="success" />
          <UAlert title="Warning Alert" description="Please check your input." color="warning" />
          <UAlert title="Error Alert" description="Something went wrong." color="error" />
        </div>
      </div>
    </section>

    <!-- Interactive Components -->
    <section class="space-y-4">
      <h2 class="text-xl font-bold text-gray-900 dark:text-white">Interactive Components</h2>
      
      <!-- Accordion -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Accordion</h3>
        <UAccordion :items="accordionItems" />
      </div>

      <!-- Tooltip -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Tooltip</h3>
        <div class="flex gap-4">
          <UTooltip text="This is a tooltip">
            <UButton>Hover me</UButton>
          </UTooltip>
          <UTooltip text="Bottom tooltip" :popper="{ placement: 'bottom' }">
            <UButton>Bottom tooltip</UButton>
          </UTooltip>
        </div>
      </div>

      <!-- Popover -->
      <div class="space-y-2">
        <h3 class="text-lg font-semibold">Popover</h3>
        <UPopover>
          <UButton>Open Popover</UButton>
          <template #content>
            <div class="p-4">
              <h4 class="font-semibold mb-2">Popover Content</h4>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                This is popover content with custom HTML.
              </p>
              <UButton size="sm" class="mt-2">Action</UButton>
            </div>
          </template>
        </UPopover>
      </div>
    </section>

    <!-- Test Data Display -->
    <section class="space-y-4">
      <h2 class="text-xl font-bold text-gray-900 dark:text-white">Current Form Values</h2>
      <UCard>
        <pre class="text-sm text-gray-600 dark:text-gray-400">{{ JSON.stringify(testData, null, 2) }}</pre>
      </UCard>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'

// Test data for form components
const testData = reactive({
  input: '',
  inputWithIcon: '',
  inputDisabled: 'Disabled value',
  inputError: '',
  textarea: '',
  select: '',
  multiSelect: [],
  checkbox: false,
  checkboxDisabled: true,
  radio: 'option1',
  switch: false,
  switchWithLabel: true,
  activeTab: 'tab1'
})

// Options for select components
const selectOptions = [
  { label: 'Option 1', value: 'option1' },
  { label: 'Option 2', value: 'option2' },
  { label: 'Option 3', value: 'option3' },
  { label: 'Option 4', value: 'option4' }
]

// Radio options
const radioOptions = [
  { label: 'Radio 1', value: 'option1' },
  { label: 'Radio 2', value: 'option2' },
  { label: 'Radio 3', value: 'option3' }
]

// Tab items
const tabItems = [
  { key: 'tab1', label: 'Tab 1' },
  { key: 'tab2', label: 'Tab 2' },
  { key: 'tab3', label: 'Tab 3' }
]

// Breadcrumb items (disabled due to Link issues)
// const breadcrumbItems = [
//   { label: 'Home', to: '#' },
//   { label: 'Components', to: '#' },
//   { label: 'Nuxt UI Test' }
// ]

// Accordion items
const accordionItems = [
  {
    label: 'Accordion Item 1',
    content: 'This is the content for the first accordion item.'
  },
  {
    label: 'Accordion Item 2',
    content: 'This is the content for the second accordion item.'
  },
  {
    label: 'Accordion Item 3',
    content: 'This is the content for the third accordion item.'
  }
]
</script>