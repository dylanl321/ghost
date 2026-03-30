<template>
  <div v-if="visibleAnnouncements.length > 0" class="flex flex-col gap-1">
    <div
      v-for="announcement in visibleAnnouncements"
      :key="announcement.id"
      class="flex items-start gap-3 px-4 py-2.5"
      :class="severityBg(announcement.severity)"
    >
      <UIcon
        :name="severityIcon(announcement.severity)"
        class="h-5 w-5 mt-0.5 flex-shrink-0"
        :class="severityIconColor(announcement.severity)"
      />
      <p class="flex-1 text-sm text-gray-200 leading-snug">
        {{ announcement.message }}
      </p>
      <button
        class="flex-shrink-0 text-gray-400 hover:text-gray-200 transition-colors"
        aria-label="Dismiss announcement"
        @click="dismiss(announcement.id)"
      >
        <UIcon name="i-heroicons-x-mark" class="h-4 w-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Announcement } from '#shared/types/site-config';

const STORAGE_KEY = 'ghost-dismissed-announcements';

const announcements = ref<Announcement[]>([]);
const dismissed = ref<Set<string>>(new Set());

// Load dismissed IDs from localStorage
function loadDismissed() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    dismissed.value = new Set(stored ? JSON.parse(stored) : []);
  } catch {
    dismissed.value = new Set();
  }
}

function saveDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...dismissed.value]));
  } catch {
    // localStorage may be unavailable in some contexts
  }
}

function dismiss(id: string) {
  dismissed.value.add(id);
  saveDismissed();
}

// Refresh current time every minute so expiry is re-evaluated without a page reload
const now = ref(new Date());
let nowInterval: ReturnType<typeof setInterval> | null = null;

const visibleAnnouncements = computed(() => {
  return announcements.value.filter((a) => {
    if (!a.active) return false;
    if (dismissed.value.has(a.id)) return false;
    if (a.expiresAt && new Date(a.expiresAt) < now.value) return false;
    return true;
  });
});

function severityBg(severity: Announcement['severity']) {
  return {
    info: 'bg-blue-900/20 border-b border-blue-900/30',
    warning: 'bg-yellow-900/20 border-b border-yellow-900/30',
    critical: 'bg-red-900/20 border-b border-red-900/30',
  }[severity];
}

function severityIcon(severity: Announcement['severity']) {
  return {
    info: 'i-heroicons-information-circle',
    warning: 'i-heroicons-exclamation-triangle',
    critical: 'i-heroicons-exclamation-circle',
  }[severity];
}

function severityIconColor(severity: Announcement['severity']) {
  return {
    info: 'text-blue-400',
    warning: 'text-yellow-400',
    critical: 'text-red-400',
  }[severity];
}

onUnmounted(() => {
  if (nowInterval) clearInterval(nowInterval);
});

onMounted(async () => {
  loadDismissed();
  nowInterval = setInterval(() => { now.value = new Date(); }, 60_000);

  try {
    const response = await $fetch<{ success: boolean; announcements: Announcement[] }>(
      '/api/admin/announcements/list'
    );
    if (response.success) {
      announcements.value = response.announcements;
    }
  } catch {
    // Silently fail — announcements are non-critical
  }
});
</script>
