<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

definePageMeta({
  layout: "authentication",
});

const { login } = useOidcAuth();

const countdown = ref(3);
let intervalId: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  intervalId = setInterval(() => {
    countdown.value--;
    if (countdown.value <= 0) {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      // Redirect to Entra login
      login("entra");
    }
  }, 1000);
});

onUnmounted(() => {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
});
</script>

<style scoped>
/* Grid background pattern */
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

/* Slow pulse animation */
@keyframes pulse-slow {
  0%, 100% {
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
  <!-- Ensure full-screen display with fixed positioning -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
  >
    <!-- Animated Background Pattern -->
    <div class="absolute inset-0 overflow-hidden opacity-10">
      <div class="absolute inset-0 grid-background"></div>
    </div>

    <!-- Main Content Container -->
    <div class="relative w-full max-w-md mx-4">
      <!-- Base glow effect - amber/warning color -->
      <div class="absolute inset-0 flex items-center justify-center -z-10">
        <div
          class="blur-3xl rounded-full opacity-30 animate-pulse-slow w-96 h-96 bg-amber-500"
        ></div>
      </div>

      <!-- Card with backdrop blur -->
      <div
        class="relative text-center p-12 rounded-xl shadow-xl bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm border border-slate-700/50"
      >
        <!-- Icon glow - amber/warning color -->
        <div class="absolute top-12 left-1/2 -translate-x-1/2 -z-10">
          <div
            class="blur-2xl rounded-full opacity-40 w-24 h-24 bg-amber-500"
          ></div>
        </div>

        <div class="mb-6 relative">
          <!-- Clock icon for session expired -->
          <UIcon
            name="i-heroicons-clock"
            class="w-12 h-12 text-amber-500 mx-auto mb-4 drop-shadow-2xl"
          />
        </div>

        <h1 class="text-2xl font-bold mb-4 text-white">
          Session Expired
        </h1>

        <p class="text-slate-300 mb-6">
          Your session has timed out for security reasons.
        </p>

        <p class="text-slate-400 mb-6">
          Redirecting to sign in in {{ countdown }}s...
        </p>

        <!-- Progress indicator during countdown -->
        <UProgress :value="null" color="amber" class="mb-4" />

        <p class="text-xs text-slate-500">
          You'll return to your previous page after signing in.
        </p>
      </div>
    </div>
  </div>
</template>
