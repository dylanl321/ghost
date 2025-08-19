# Using External UI Libraries in Histoire

## Vue-Native Libraries That Work ✅

### 1. Headless UI Vue
```bash
npm install @headlessui/vue
```

```vue
<!-- Works perfectly in Histoire -->
<template>
  <Dialog v-model:open="isOpen">
    <DialogPanel>
      <DialogTitle>My Dialog</DialogTitle>
      <!-- Content -->
    </DialogPanel>
  </Dialog>
</template>

<script setup>
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/vue'
</script>
```

### 2. Radix Vue
```bash
npm install radix-vue
```

```vue
<template>
  <AlertDialog>
    <AlertDialogTrigger>Open</AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
      </AlertDialogHeader>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup>
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from 'radix-vue'
</script>
```

### 3. Ant Design Vue
```bash
npm install ant-design-vue
```

### 4. Element Plus
```bash
npm install element-plus
```

## Libraries That DON'T Work ❌

- `@nuxt/ui` (Nuxt-specific)
- `@nuxtjs/tailwindcss` (Nuxt module)
- Any package with "nuxt" in the name
- Packages that require Nuxt's SSR context

## The Pattern

**Works**: Libraries built for Vue.js
**Doesn't Work**: Libraries built specifically for Nuxt.js

## Recommendation

For your project, you have two good options:

1. **Keep using Nuxt UI** for your actual app, but document it in the Nuxt environment (components-demo page)

2. **Switch to Headless UI Vue** or **Radix Vue** for new components - these work in both Nuxt AND Histoire

Example with Headless UI Vue:

```vue
<!-- This component works in both Nuxt and Histoire -->
<template>
  <Listbox v-model="selected">
    <ListboxButton>{{ selected.name }}</ListboxButton>
    <ListboxOptions>
      <ListboxOption 
        v-for="option in options" 
        :key="option.id" 
        :value="option"
      >
        {{ option.name }}
      </ListboxOption>
    </ListboxOptions>
  </Listbox>
</template>

<script setup>
import { Listbox, ListboxButton, ListboxOptions, ListboxOption } from '@headlessui/vue'
// This works everywhere!
</script>
```