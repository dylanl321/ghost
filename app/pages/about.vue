<template>
  <div 
    class="min-h-screen w-full relative bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
  >
    <!-- Simplified Background - Static for performance -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none">
      <!-- Subtle gradient overlay only -->
      <div class="absolute inset-0 bg-gradient-radial from-primary/5 via-transparent to-transparent opacity-50"></div>
    </div>

    <!-- Hero Section -->
    <section id="hero" class="snap-section snap-start relative min-h-screen flex flex-col items-center justify-center px-4 py-12 sm:py-16">
      <!-- Ghost Icon - Simplified -->
      <div class="relative mb-6 sm:mb-8">
        <div class="text-[60px] sm:text-[80px] md:text-[96px] lg:text-[112px]">
          <UIcon
            name="i-fa6-solid-ghost"
            class="relative text-primary drop-shadow-lg"
            :class="{ 'ghost-spin': ghostAwakened }"
          />
        </div>
      </div>

      <!-- GHOST Title - Interactive -->
      <div class="relative z-10 mb-4 sm:mb-6">
        <h1
          class="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-wide flex justify-center gap-1 sm:gap-2 md:gap-3 flex-wrap"
          :class="{ 'ghost-rainbow': ghostAwakened }"
        >
          <span
            v-for="(letter, index) in ghostLetters"
            :key="index"
            class="ghost-letter relative inline-flex cursor-pointer transition-all duration-200"
            :class="{
              'ghost-letter-active': hoveredLetter === index,
              'ghost-letter-muted': hoveredLetter !== null && hoveredLetter !== index
            }"
            @mouseenter="onLetterHover(index)"
            @mouseleave="hoveredLetter = null"
          >
            <span
              class="ghost-text-gradient inline-block transition-all duration-200"
              :style="hoveredLetter === index ? {
                color: letter.color
              } : {}"
            >{{ letter.char }}</span>
          </span>
        </h1>
      </div>

      <!-- Tagline -->
      <p 
        class="relative z-10 text-sm sm:text-base md:text-lg lg:text-xl text-slate-300 font-normal transition-all duration-300 mb-6 sm:mb-8"
        :class="hoveredLetter !== null ? 'opacity-20' : 'opacity-100'"
      >
        Unified AWS Cloud Management Platform
      </p>

      <!-- Interactive Description -->
      <div class="relative w-full max-w-2xl mx-auto mb-12 sm:mb-16 min-h-[260px] flex items-stretch">
        <Transition name="description-fade" mode="out-in">
          <div
            v-if="currentLetter"
            :key="hoveredLetter ?? -1"
            class="relative z-10 text-center px-4 w-full flex flex-col items-center justify-center gap-4"
          >
            <div class="relative">
              <!-- Icon -->
              <div class="flex justify-center mb-4">
                <UIcon
                  :name="currentLetter.icon"
                  class="relative h-10 w-10 sm:h-12 sm:w-12 transition-all duration-200"
                  :style="{ color: currentLetter.color }"
                />
              </div>

              <!-- Title -->
              <h2
                class="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight transition-all duration-200 mb-3"
                :style="{ color: currentLetter.color }"
              >
                {{ currentLetter.full }}
              </h2>

              <!-- Description -->
              <p class="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl mx-auto">
                {{ currentLetter.description }}
              </p>

              <!-- Simple line -->
              <div class="flex justify-center pt-4">
                <div
                  class="h-1 w-16 rounded-full transition-all duration-200"
                  :style="{ backgroundColor: currentLetter.color }"
                ></div>
              </div>
            </div>
          </div>
          <div v-else class="relative z-10 text-center px-4 w-full flex flex-col items-center justify-center gap-4">
            <div class="space-y-3">
              <p class="text-sm sm:text-base text-slate-400">
                Hover over a letter to explore
              </p>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Hero CTAs -->
      <div class="relative z-10 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 text-center">
        <button
          class="px-8 py-3 rounded-full bg-primary text-slate-900 font-semibold shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          @click="scrollToSection('why')"
        >
          Why GHOST
        </button>
        <button
          class="px-8 py-3 rounded-full border border-white/30 text-white/80 hover:text-white hover:border-white/60 transition-all duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          @click="scrollToSection(capabilityCards.length ? 'capabilities' : 'why')"
        >
          Explore Capabilities
        </button>
      </div>

      <!-- Scroll Indicator -->
      <div class="absolute bottom-8 left-1/2 -translate-x-1/2">
        <div class="flex flex-col items-center gap-2 text-slate-400">
          <span class="text-xs">Scroll to explore</span>
          <UIcon name="i-heroicons-chevron-down" class="w-5 h-5" />
        </div>
      </div>
    </section>

    <!-- Why Section -->
    <section id="why" class="snap-section snap-start relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 py-12 sm:py-16 md:py-20">
      <div class="max-w-4xl mx-auto text-center space-y-8 sm:space-y-12">
        <!-- Section Header -->
        <div class="space-y-4 animate-fade-in-up">
          <h2 class="text-4xl sm:text-5xl md:text-6xl font-bold text-white">
            Why GHOST?
          </h2>
          <div class="h-1 w-24 bg-primary mx-auto rounded-full"></div>
        </div>

        <!-- Main Content -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 mt-12">
          <AboutInfoCard
            v-for="pillar in whyPillars"
            :key="pillar.title"
            :card="pillar"
            variant="centered"
          />
        </div>

        <!-- Additional Benefits -->
        <div class="mt-12 sm:mt-16 space-y-6 animate-fade-in-up" style="animation-delay: 0.4s">
          <div class="bg-gradient-to-br from-slate-800/60 to-slate-900/60 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-slate-700/50">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 text-left">
              <div
                v-for="benefit in whyBenefits"
                :key="benefit.title"
                class="flex items-start gap-4"
              >
                <UIcon name="i-heroicons-check-circle" class="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h4 class="text-white font-semibold mb-1">{{ benefit.title }}</h4>
                  <p class="text-sm text-slate-400">{{ benefit.description }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Platform Capabilities Section -->
    <section id="capabilities" class="snap-section snap-start relative min-h-screen flex flex-col items-center justify-center py-20 sm:py-24 md:py-32 px-4 sm:px-6">
      <div class="max-w-7xl mx-auto w-full">
        <div class="text-center mb-12 sm:mb-16 md:mb-20">
          <h2 class="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-4 animate-fade-in-up">
            Platform Capabilities
          </h2>
          <div class="h-1 w-24 bg-primary mx-auto rounded-full animate-expand-line"></div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          <AboutInfoCard
            v-for="card in capabilityCards"
            :key="card.title"
            :card="card"
          />
        </div>
      </div>
    </section>

    <!-- Footer Section -->
    <section id="footer" class="snap-section snap-start relative min-h-screen flex flex-col items-center justify-center py-16 sm:py-20 px-4">
      <div class="max-w-4xl mx-auto text-center">
        <div class="relative inline-block">
          <div class="relative bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-sm rounded-2xl p-8 sm:p-12 border border-slate-700/50">
            <div class="flex items-center justify-center gap-3 sm:gap-4 mb-4">
              <UIcon name="i-fa6-solid-ghost" class="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              <p class="text-xl sm:text-2xl font-bold text-slate-300">
                A product of the GDMS AWS Landing Zone Team
              </p>
            </div>
            <p class="text-slate-400 text-base sm:text-lg">
              Empowering cloud excellence through unified visibility and control
            </p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import AboutInfoCard from '~/components/about/AboutInfoCard.vue'

definePageMeta({
  layout: 'default'
})

const hoveredLetter = ref<number | null>(null)

// Easter egg: GHOST Awakening
const ghostAwakened = ref(false)
const hoverSequence = ref<number[]>([])
const sequenceStartTime = ref(0)

function onLetterHover(index: number) {
  hoveredLetter.value = index

  // Easter egg tracking
  if (ghostAwakened.value) return

  const now = Date.now()
  if (hoverSequence.value.length === 0 || now - sequenceStartTime.value > 2000) {
    // Start fresh sequence
    hoverSequence.value = [index]
    sequenceStartTime.value = now
  } else {
    // Only add if it's the next letter in sequence (0,1,2,3,4)
    const expected = hoverSequence.value.length
    if (index === expected) {
      hoverSequence.value.push(index)
    } else if (index !== hoverSequence.value[hoverSequence.value.length - 1]) {
      // Wrong order, reset
      hoverSequence.value = [index]
      sequenceStartTime.value = now
    }
  }

  // Check if complete sequence G(0) H(1) O(2) S(3) T(4)
  if (hoverSequence.value.length === 5) {
    triggerGhostAwakening()
  }
}

function triggerGhostAwakening() {
  ghostAwakened.value = true
  console.log('%c✨ You\'ve awakened the GHOST! The spirits are pleased.', 'color: #10b981; font-size: 16px; font-weight: bold;')

  // Reset after animation completes (3 seconds)
  setTimeout(() => {
    ghostAwakened.value = false
    hoverSequence.value = []
  }, 3000)
}

interface InfoCard {
  title: string
  description: string
  icon: string
  delay?: number
}

interface BenefitItem {
  title: string
  description: string
}

const ghostLetters = [
  {
    char: 'G',
    full: 'Governance',
    description: 'Comprehensive policy management and compliance oversight across all AWS environments',
    color: '#6ee7b7', // emerald-300
    icon: 'i-heroicons-shield-check'
  },
  {
    char: 'H',
    full: 'Health',
    description: 'Real-time monitoring of resource health, security findings, and system status',
    color: '#93c5fd', // blue-300
    icon: 'i-heroicons-heart'
  },
  {
    char: 'O',
    full: 'Operations',
    description: 'Streamlined account management, automation, and operational workflows',
    color: '#d8b4fe', // purple-300
    icon: 'i-heroicons-cog-6-tooth'
  },
  {
    char: 'S',
    full: 'Spend',
    description: 'Advanced cost analytics, forecasting, and budget tracking with actionable insights',
    color: '#fcd34d', // amber-300
    icon: 'i-heroicons-currency-dollar'
  },
  {
    char: 'T',
    full: 'Tasks',
    description: 'Automated workflows, scheduled reports, and intelligent task management',
    color: '#fda4af', // rose-300
    icon: 'i-heroicons-clipboard-document-check'
  }
]

const currentLetter = computed(() => {
  return hoveredLetter.value !== null ? ghostLetters[hoveredLetter.value] : null
})

const whyPillars: InfoCard[] = [
  {
    title: 'Unified Platform',
    description: 'One platform to manage all your AWS environments, eliminating the need for multiple tools and dashboards',
    icon: 'i-heroicons-squares-2x2',
    delay: 0.1
  },
  {
    title: 'Real-Time Insights',
    description: 'Instant visibility into costs, security, and operations across your entire AWS infrastructure',
    icon: 'i-heroicons-bolt',
    delay: 0.2
  },
  {
    title: 'Enterprise Ready',
    description: 'Built for scale with enterprise-grade security, compliance, and governance capabilities',
    icon: 'i-heroicons-shield-check',
    delay: 0.3
  }
]

const whyBenefits: BenefitItem[] = [
  {
    title: 'Simplified Management',
    description: 'Reduce complexity with a single pane of glass for all AWS operations'
  },
  {
    title: 'Cost Optimization',
    description: 'Identify savings opportunities and optimize spending across accounts'
  },
  {
    title: 'Security First',
    description: 'Proactive security monitoring and compliance tracking'
  },
  {
    title: 'Automated Workflows',
    description: 'Streamline operations with intelligent automation and reporting'
  }
]

const capabilityCards: InfoCard[] = [
  {
    title: 'Multi-Environment Support',
    description: 'Seamless management across AWS Commercial and GovCloud environments with unified access controls',
    icon: 'i-heroicons-globe-alt'
  },
  {
    title: 'Cost Reporting',
    description: 'Real-time cost tracking, trend analysis, and forecasting with granular account-level insights',
    icon: 'i-heroicons-currency-dollar',
    delay: 0.1
  },
  {
    title: 'Resource Reporting',
    description: 'Generate customizable reports on AWS resources with rich filtering, scheduling, and export capabilities',
    icon: 'i-heroicons-server-stack',
    delay: 0.2
  },
  {
    title: 'Account Details',
    description: 'Comprehensive account information including metadata, tags, compliance status, and resource inventory',
    icon: 'i-heroicons-identification',
    delay: 0.3
  },
  {
    title: 'User Management',
    description: 'Identity and access management with Entra ID integration, role-based permissions, and user activity tracking',
    icon: 'i-heroicons-users',
    delay: 0.4
  },
  {
    title: 'Security Intelligence',
    description: 'Centralized Security Hub findings with intelligent filtering and prioritization',
    icon: 'i-heroicons-shield-exclamation',
    delay: 0.5
  },
  {
    title: 'Cost Optimization',
    description: 'Real-time cost tracking, trend analysis, and forecasting with granular account-level insights',
    icon: 'i-heroicons-chart-pie',
    delay: 0.6
  },
  {
    title: 'Organization Visualization',
    description: 'Interactive hierarchical charts showing account relationships and organizational structure',
    icon: 'i-heroicons-building-library',
    delay: 0.7
  },
  {
    title: 'Data Pipeline Analytics',
    description: 'Monitor and analyze AWS Glue pipelines with detailed execution tracking and visualization',
    icon: 'i-heroicons-arrow-path',
    delay: 0.8
  }
]

const scrollToSection = (id: string) => {
  if (typeof window === 'undefined') return
  const element = document.getElementById(id)
  if (!element) return
  element.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  })
}
</script>

<style scoped>
/* Simplified gradient text - no animation */
.ghost-text-gradient {
  color: #94a3b8; /* slate-400 */
}

/* Interactive letter hover effect - simplified */
.ghost-letter {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.1em;
  min-width: 1.1ch;
  transition: opacity 0.2s ease;
  user-select: none;
}

.ghost-letter-active {
  opacity: 1;
}

.ghost-letter-muted {
  opacity: 0.3;
}

/* Simple fade transition for description */
.description-fade-enter-active,
.description-fade-leave-active {
  transition: opacity 0.2s ease;
}

.description-fade-enter-from,
.description-fade-leave-to {
  opacity: 0;
}

.description-fade-enter-to,
.description-fade-leave-from {
  opacity: 1;
}

/* Radial gradient utility - static, no animation */
.bg-gradient-radial {
  background: radial-gradient(circle at center, var(--tw-gradient-stops));
}

/* Easter egg: Ghost Awakening */
@keyframes ghost-spin-animation {
  0% { transform: rotate(0deg) scale(1); }
  25% { transform: rotate(90deg) scale(1.2); }
  50% { transform: rotate(180deg) scale(1); }
  75% { transform: rotate(270deg) scale(1.2); }
  100% { transform: rotate(360deg) scale(1); }
}

.ghost-spin {
  animation: ghost-spin-animation 1s cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

@keyframes rainbow-sweep {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

.ghost-rainbow span {
  background: linear-gradient(90deg, #6ee7b7, #93c5fd, #d8b4fe, #fcd34d, #fda4af, #6ee7b7);
  background-size: 300% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: rainbow-sweep 2s ease-in-out;
}

.ghost-rainbow span::after {
  content: '';
  animation: none;
}
</style>