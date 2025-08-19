<template>
  <Story
    title="Nuxt UI v3 Components Test"
    group="test"
    :layout="{ type: 'single', iframe: true }"
  >
    <!-- Full Component Test -->
    <Variant title="All Components">
      <NuxtUITest />
    </Variant>

    <!-- Individual Component Categories -->
    <Variant title="Buttons Only">
      <div class="p-6 space-y-4">
        <h2 class="text-xl font-bold">Button Variants</h2>
        <div class="flex gap-2 flex-wrap">
          <UButton>Default</UButton>
          <UButton color="primary">Primary</UButton>
          <UButton color="secondary">Secondary</UButton>
          <UButton color="success">Success</UButton>
          <UButton color="warning">Warning</UButton>
          <UButton color="error">Error</UButton>
        </div>
        <div class="flex gap-2 flex-wrap">
          <UButton variant="outline">Outline</UButton>
          <UButton variant="ghost">Ghost</UButton>
          <UButton variant="soft">Soft</UButton>
        </div>
        <div class="flex gap-2 flex-wrap">
          <UButton size="sm">Small</UButton>
          <UButton>Default Size</UButton>
          <UButton size="lg">Large</UButton>
        </div>
        <div class="flex gap-2 flex-wrap">
          <UButton icon="i-heroicons-star">With Icon</UButton>
          <UButton disabled>Disabled</UButton>
          <UButton loading>Loading</UButton>
        </div>
      </div>
    </Variant>

    <!-- Form Components Test -->
    <Variant title="Form Components">
      <div class="p-6 space-y-6 max-w-2xl">
        <h2 class="text-xl font-bold">Form Components</h2>
        
        <!-- Inputs -->
        <div class="space-y-3">
          <h3 class="text-lg font-semibold">Inputs</h3>
          <UInput placeholder="Basic input" />
          <UInput icon="i-heroicons-envelope" placeholder="With icon" />
          <UInput placeholder="Disabled input" disabled />
          <UInput placeholder="With error" error="This field is required" />
        </div>

        <!-- Select -->
        <div class="space-y-3">
          <h3 class="text-lg font-semibold">Select</h3>
          <USelect 
            :items="formTestOptions" 
            placeholder="Choose option"
          />
        </div>

        <!-- Checkbox & Radio -->
        <div class="space-y-3">
          <h3 class="text-lg font-semibold">Checkbox & Radio</h3>
          <UCheckbox v-model="testCheckbox" label="Checkbox option" />
          <URadioGroup v-model="testRadio" :items="formTestOptions" />
        </div>

        <!-- Switch -->
        <div class="space-y-3">
          <h3 class="text-lg font-semibold">Switch</h3>
          <USwitch v-model="testSwitch" label="Enable notifications" />
        </div>
      </div>
    </Variant>

    <!-- Cards & Layout Test -->
    <Variant title="Cards & Layout">
      <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Test Card 1</h3>
              <UBadge color="success">Active</UBadge>
            </div>
          </template>
          <div class="space-y-3">
            <p>This card tests basic functionality.</p>
            <div class="flex gap-2">
              <UBadge>Tag 1</UBadge>
              <UBadge color="primary">Tag 2</UBadge>
            </div>
          </div>
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton variant="ghost" size="sm">Cancel</UButton>
              <UButton size="sm">Save</UButton>
            </div>
          </template>
        </UCard>

        <UCard>
          <template #header>
            <h3 class="font-semibold">Test Card 2</h3>
          </template>
          <div class="space-y-3">
            <p>Another test card with different content.</p>
            <UProgress :value="65" color="primary" />
          </div>
        </UCard>
      </div>
    </Variant>

    <!-- Interactive Components -->
    <Variant title="Interactive Components">
      <div class="p-6 space-y-6 max-w-2xl">
        <h2 class="text-xl font-bold">Interactive Components</h2>
        
        <!-- Tabs -->
        <div class="space-y-3">
          <h3 class="text-lg font-semibold">Tabs</h3>
          <UTabs v-model="activeTestTab" :items="testTabItems">
            <template #tab1>
              <div class="p-4">
                <p>Content for Tab 1</p>
                <UButton size="sm" class="mt-2">Tab 1 Action</UButton>
              </div>
            </template>
            <template #tab2>
              <div class="p-4">
                <p>Content for Tab 2</p>
                <UAlert title="Tab 2 Alert" description="This is in tab 2" color="info" />
              </div>
            </template>
            <template #tab3>
              <div class="p-4">
                <p>Content for Tab 3</p>
                <div class="flex gap-2">
                  <UBadge>Badge 1</UBadge>
                  <UBadge color="success">Badge 2</UBadge>
                </div>
              </div>
            </template>
          </UTabs>
        </div>

        <!-- Accordion -->
        <div class="space-y-3">
          <h3 class="text-lg font-semibold">Accordion</h3>
          <UAccordion :items="testAccordionItems" />
        </div>

        <!-- Tooltip & Popover -->
        <div class="space-y-3">
          <h3 class="text-lg font-semibold">Tooltip & Popover</h3>
          <div class="flex gap-4">
            <UTooltip text="This is a tooltip">
              <UButton>Hover for tooltip</UButton>
            </UTooltip>
            <UPopover>
              <UButton>Click for popover</UButton>
              <template #content>
                <div class="p-4 max-w-sm">
                  <h4 class="font-semibold mb-2">Popover Content</h4>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    This is a test popover with some content.
                  </p>
                  <UButton size="sm">Popover Action</UButton>
                </div>
              </template>
            </UPopover>
          </div>
        </div>
      </div>
    </Variant>

    <!-- Alerts & Feedback -->
    <Variant title="Alerts & Feedback">
      <div class="p-6 space-y-4 max-w-2xl">
        <h2 class="text-xl font-bold">Alerts & Feedback</h2>
        
        <UAlert title="Info Alert" description="This is an informational message." />
        <UAlert title="Success Alert" description="Operation completed successfully." color="success" />
        <UAlert title="Warning Alert" description="Please review your input." color="warning" />
        <UAlert title="Error Alert" description="Something went wrong." color="error" />
        
        <div class="space-y-2">
          <h3 class="text-lg font-semibold">Progress Indicators</h3>
          <UProgress :value="25" />
          <UProgress :value="50" color="primary" />
          <UProgress :value="75" color="success" />
          <UProgress :value="100" color="error" />
        </div>
      </div>
    </Variant>

    <template #controls>
      <div class="p-4 bg-gray-50 dark:bg-gray-800 rounded">
        <h4 class="font-medium mb-3">Nuxt UI v3 Component Testing</h4>
        <div class="text-sm text-gray-600 dark:text-gray-400 space-y-2">
          <div>• Tests all major Nuxt UI v3 components</div>
          <div>• Check browser console for any errors</div>
          <div>• Interactive components should respond to user input</div>
          <div>• Form values are reactive and update in real-time</div>
          <div class="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
            <strong class="text-blue-700 dark:text-blue-300">Note:</strong> 
            <span class="text-blue-600 dark:text-blue-400">
              This story tests component compatibility with Histoire. Any errors indicate components that may need special handling.
            </span>
          </div>
        </div>
      </div>
    </template>
  </Story>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import NuxtUITest from './NuxtUITest.vue'

// Test reactive data
const testCheckbox = ref(false)
const testRadio = ref('option1')
const testSwitch = ref(true)
const activeTestTab = ref('tab1')

// Test options
const formTestOptions = [
  { label: 'Option 1', value: 'option1' },
  { label: 'Option 2', value: 'option2' },
  { label: 'Option 3', value: 'option3' }
]

const testTabItems = [
  { key: 'tab1', label: 'First Tab' },
  { key: 'tab2', label: 'Second Tab' },
  { key: 'tab3', label: 'Third Tab' }
]

const testAccordionItems = [
  {
    label: 'First Item',
    content: 'This is the first accordion item content with some test text.'
  },
  {
    label: 'Second Item', 
    content: 'This is the second accordion item with different content.'
  },
  {
    label: 'Third Item',
    content: 'This is the third and final accordion item for testing.'
  }
]
</script>