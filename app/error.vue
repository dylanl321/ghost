<script setup lang="ts">
import type { NuxtError } from "#app";

const props = defineProps({
  error: Object as () => NuxtError,
});

const statusCode = computed(() => props.error?.statusCode || 500);

const errorConfig = computed(() => {
  if (statusCode.value === 404) {
    return {
      title: "Page Not Found",
      message:
        "The page you're looking for doesn't exist or has been moved.",
      glowColor: "bg-blue-500",
      iconColor: "text-blue-400",
    };
  }
  if (statusCode.value === 500) {
    return {
      title: "Something Went Wrong",
      message:
        "An unexpected error occurred. Please try again or contact the team if the issue persists.",
      glowColor: "bg-red-500",
      iconColor: "text-red-400",
    };
  }
  return {
    title: "Error",
    message: props.error?.message || "An unexpected error occurred.",
    glowColor: "bg-amber-500",
    iconColor: "text-amber-400",
  };
});

const handleGoHome = () => {
  clearError({ redirect: "/" });
};
</script>

<style scoped>
.grid-background {
  background-image:
    linear-gradient(to right, rgba(148, 163, 184, 0.1) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(148, 163, 184, 0.1) 1px, transparent 1px);
  background-size: 60px 60px;
  animation: grid-flow 20s linear infinite;
}

@keyframes grid-flow {
  0% {
    transform: translate(0, 0);
  }
  100% {
    transform: translate(60px, 60px);
  }
}

@keyframes pulse-slow {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.05);
  }
}

.animate-pulse-slow {
  animation: pulse-slow 3s ease-in-out infinite;
}
</style>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
  >
    <!-- Animated Background Pattern -->
    <div class="absolute inset-0 overflow-hidden opacity-10">
      <div class="absolute inset-0 grid-background"></div>
    </div>

    <!-- Main Content Container -->
    <div class="relative w-full max-w-md mx-4">
      <!-- Base glow effect -->
      <div class="absolute inset-0 flex items-center justify-center -z-10">
        <div
          class="blur-3xl rounded-full opacity-30 animate-pulse-slow w-96 h-96"
          :class="errorConfig.glowColor"
        ></div>
      </div>

      <!-- Card with backdrop blur -->
      <div
        class="relative text-center p-12 rounded-xl shadow-xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50"
      >
        <!-- Icon glow -->
        <div class="absolute top-12 left-1/2 -translate-x-1/2 -z-10">
          <div
            class="blur-2xl rounded-full opacity-40 w-24 h-24"
            :class="errorConfig.glowColor"
          ></div>
        </div>

        <div class="mb-6 relative">
          <UIcon
            name="i-fa6-solid-ghost"
            class="w-12 h-12 mx-auto mb-4 drop-shadow-2xl"
            :class="errorConfig.iconColor"
          />
        </div>

        <!-- Error code -->
        <p class="text-sm font-mono text-slate-500 mb-2">
          {{ statusCode }}
        </p>

        <h1 class="text-2xl font-bold mb-4 text-white">
          {{ errorConfig.title }}
        </h1>

        <p class="text-slate-300 mb-8">
          {{ errorConfig.message }}
        </p>

        <UButton
          color="white"
          variant="solid"
          size="lg"
          icon="i-heroicons-home"
          @click="handleGoHome"
        >
          Go to Dashboard
        </UButton>

        <p class="text-xs text-slate-500 mt-6">
          Press
          <kbd
            class="px-1.5 py-0.5 rounded bg-slate-700/50 border border-slate-600/50 text-slate-400 font-mono text-xs"
            >Cmd+K</kbd
          >
          to search
        </p>
      </div>
    </div>
  </div>
</template>
