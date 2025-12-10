<template>
  <article
    class="group relative bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-xl p-6 sm:p-8 border border-slate-700/50 hover:border-primary/50 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-primary/20 animate-fade-in-up"
    :style="delayStyle"
  >
    <div class="flex w-full gap-4" :class="containerClass">
      <div class="relative" :class="iconWrapperClass">
        <div class="absolute inset-0 bg-primary/20 blur-lg rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        <UIcon :name="card.icon" class="relative text-primary" :class="iconClass" />
      </div>
      <div :class="textClass">
        <h3 class="text-white mb-2 transition-colors duration-300 group-hover:text-primary" :class="titleClass">
          {{ card.title }}
        </h3>
        <p class="text-sm text-slate-400 leading-relaxed">
          {{ card.description }}
        </p>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface AboutCard {
  title: string
  description: string
  icon: string
  delay?: number
}

const props = withDefaults(
  defineProps<{
    card: AboutCard
    variant?: 'centered' | 'leading'
  }>(),
  {
    variant: 'leading'
  }
)

const delayStyle = computed(() => {
  return props.card.delay ? { animationDelay: `${props.card.delay}s` } : undefined
})

const containerClass = computed(() =>
  props.variant === 'centered'
    ? 'flex-col items-center text-center space-y-4'
    : 'items-start text-left'
)

const textClass = computed(() => (props.variant === 'centered' ? 'text-center' : 'text-left'))

const titleClass = computed(() =>
  props.variant === 'centered' ? 'text-xl font-bold' : 'text-lg font-semibold'
)

const iconClass = computed(() => (props.variant === 'centered' ? 'h-12 w-12' : 'h-10 w-10'))

const iconWrapperClass = computed(() => (props.variant === 'centered' ? '' : 'flex-shrink-0'))
</script>

