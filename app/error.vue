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

// Ghost Catcher Easter Egg
const ghostClickCount = ref(0);
const gameActive = ref(false);
const gameScore = ref(0);
const gameMessage = ref("");
const ghostPosition = ref({ x: 50, y: 50 });
const showResult = ref(false);
const timerStarted = ref(false);
let gameTimer: ReturnType<typeof setTimeout> | null = null;
let moveTimer: ReturnType<typeof setInterval> | null = null;

function onGhostIconClick() {
  if (gameActive.value) return;
  ghostClickCount.value++;
  if (ghostClickCount.value >= 5) {
    startGame();
  }
}

function startGame() {
  gameActive.value = true;
  gameScore.value = 0;
  showResult.value = false;
  gameMessage.value = "";
  timerStarted.value = false;
  console.log(
    "%c🎮 Ghost Catcher activated!",
    "color: #f59e0b; font-size: 14px;"
  );
  moveGhost();
  startMoveTimer();
  gameTimer = setTimeout(endGame, 15000);
  nextTick(() => {
    timerStarted.value = true;
  });
}

function moveGhost() {
  ghostPosition.value = {
    x: Math.random() * 70 + 10,
    y: Math.random() * 60 + 15,
  };
}

function startMoveTimer() {
  if (moveTimer) clearInterval(moveTimer);
  const interval = Math.max(500, 1200 - gameScore.value * 50);
  moveTimer = setInterval(moveGhost, interval);
}

function catchGhost() {
  if (!gameActive.value) return;
  gameScore.value++;
  moveGhost();
  startMoveTimer();
}

function endGame() {
  gameActive.value = false;
  timerStarted.value = false;
  if (moveTimer) {
    clearInterval(moveTimer);
    moveTimer = null;
  }
  if (gameTimer) {
    clearTimeout(gameTimer);
    gameTimer = null;
  }

  const score = gameScore.value;
  let highScore = 0;
  try {
    highScore = parseInt(
      localStorage.getItem("ghost-catcher-high-score") || "0",
      10
    );
  } catch {}

  if (score > highScore) {
    highScore = score;
    try {
      localStorage.setItem("ghost-catcher-high-score", String(score));
    } catch {}
  }

  if (score <= 3)
    gameMessage.value = "The ghost escaped! Better luck next time. 👻";
  else if (score <= 7) gameMessage.value = "Not bad, ghost hunter! 🎯";
  else
    gameMessage.value =
      "Master Ghost Catcher! You should work in incident response. 🏆";

  showResult.value = true;
  console.log(
    `%c🏆 Score: ${score} (High score: ${highScore})`,
    "color: #f59e0b; font-size: 14px;"
  );

  setTimeout(() => {
    showResult.value = false;
    gameMessage.value = "";
    ghostClickCount.value = 0;
  }, 3000);
}

onUnmounted(() => {
  if (moveTimer) clearInterval(moveTimer);
  if (gameTimer) clearTimeout(gameTimer);
});
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
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

        <div
          class="mb-6 relative cursor-pointer select-none"
          @click="onGhostIconClick"
        >
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

        <!-- Ghost Catcher Game Overlay -->
        <div v-if="gameActive" class="absolute inset-0 rounded-xl overflow-hidden">
          <!-- Score -->
          <div class="absolute top-3 right-3 text-sm font-mono text-emerald-400 z-10">
            Score: {{ gameScore }}
          </div>
          <!-- Timer bar -->
          <div class="absolute top-0 left-0 right-0 h-1 bg-slate-700">
            <div
              class="h-full bg-emerald-400 transition-all duration-[15000ms] ease-linear"
              :style="{ width: timerStarted ? '0%' : '100%' }"
            />
          </div>
          <!-- Catchable ghost -->
          <button
            class="absolute text-3xl cursor-pointer transition-all duration-150 hover:scale-125 z-10 select-none"
            :style="{
              left: ghostPosition.x + '%',
              top: ghostPosition.y + '%',
              transform: 'translate(-50%, -50%)',
            }"
            @click.stop="catchGhost"
          >
            👻
          </button>
        </div>

        <!-- Result Message -->
        <Transition name="fade">
          <div
            v-if="showResult"
            class="absolute inset-0 rounded-xl flex items-center justify-center bg-slate-900/80 backdrop-blur-sm z-20"
          >
            <p class="text-lg font-semibold text-white text-center px-6">
              {{ gameMessage }}
            </p>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>
