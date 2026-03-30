import { ref, computed, watch, onUnmounted, type Ref } from 'vue'

interface CountUpOptions {
  duration?: number
  formatter?: (n: number) => string
}

export function useCountUp(targetValue: Ref<number>, options?: CountUpOptions) {
  const duration = options?.duration ?? 800
  const displayValue = ref(0)
  let animationFrameId: number | null = null

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }

  function animate(from: number, to: number) {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }

    if (prefersReducedMotion || duration <= 0) {
      displayValue.value = to
      return
    }

    const startTime = performance.now()

    function step(currentTime: number) {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeOutCubic(progress)

      displayValue.value = from + (to - from) * easedProgress

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step)
      } else {
        displayValue.value = to
        animationFrameId = null
      }
    }

    animationFrameId = requestAnimationFrame(step)
  }

  watch(
    targetValue,
    (newVal, oldVal) => {
      const to = isNaN(newVal) ? 0 : newVal
      const from = oldVal != null && !isNaN(oldVal) ? oldVal : 0
      animate(displayValue.value, to)
    },
    { immediate: true }
  )

  onUnmounted(() => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId)
    }
  })

  const formattedValue = computed(() => {
    if (options?.formatter) {
      return options.formatter(displayValue.value)
    }
    return String(Math.round(displayValue.value))
  })

  return { displayValue, formattedValue }
}
