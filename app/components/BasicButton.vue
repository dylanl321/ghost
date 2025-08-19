<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="buttonClasses"
    @click="$emit('click', $event)"
  >
    <span v-if="loading" class="spinner" aria-hidden="true"></span>
    <span :class="{ 'opacity-75': loading }">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  type: 'button',
  disabled: false,
  loading: false
})

defineEmits<{
  click: [event: MouseEvent]
}>()

const buttonClasses = computed(() => {
  const base = 'btn'
  const variant = `btn--${props.variant}`
  const size = `btn--${props.size}`
  const loading = props.loading ? 'btn--loading' : ''
  const disabled = props.disabled ? 'btn--disabled' : ''
  
  return [base, variant, size, loading, disabled].filter(Boolean).join(' ')
})
</script>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  position: relative;
}

.btn:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.5);
}

/* Sizes */
.btn--sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
}

.btn--md {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
}

.btn--lg {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
}

/* Variants */
.btn--primary {
  background: #059669;
  color: white;
  border-color: #059669;
}

.btn--primary:hover:not(:disabled) {
  background: #047857;
  border-color: #047857;
}

.btn--secondary {
  background: #6b7280;
  color: white;
  border-color: #6b7280;
}

.btn--secondary:hover:not(:disabled) {
  background: #4b5563;
  border-color: #4b5563;
}

.btn--outline {
  background: transparent;
  color: #059669;
  border-color: #059669;
}

.btn--outline:hover:not(:disabled) {
  background: #059669;
  color: white;
}

.btn--ghost {
  background: transparent;
  color: #374151;
  border-color: transparent;
}

.btn--ghost:hover:not(:disabled) {
  background: #f3f4f6;
}

/* States */
.btn--disabled,
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--loading {
  cursor: not-allowed;
}

.spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid transparent;
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>