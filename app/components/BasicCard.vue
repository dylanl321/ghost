<template>
  <div class="card" :class="cardClasses">
    <header v-if="title || $slots.header" class="card-header">
      <h3 v-if="title" class="card-title">{{ title }}</h3>
      <slot name="header" />
    </header>
    
    <main class="card-body">
      <slot />
    </main>
    
    <footer v-if="$slots.footer" class="card-footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  title?: string
  variant?: 'default' | 'elevated' | 'bordered'
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  loading: false
})

const cardClasses = computed(() => ({
  'card--elevated': props.variant === 'elevated',
  'card--bordered': props.variant === 'bordered',
  'card--loading': props.loading
}))
</script>

<style scoped>
.card {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s ease;
}

.card--elevated {
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
}

.card--bordered {
  border: 1px solid #e5e7eb;
}

.card--loading {
  opacity: 0.7;
  pointer-events: none;
}

.card-header {
  padding: 1.5rem;
  border-bottom: 1px solid #f3f4f6;
  background: #f9fafb;
}

.card-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
}

.card-body {
  padding: 1.5rem;
}

.card-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #f3f4f6;
  background: #f9fafb;
}
</style>