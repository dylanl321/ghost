<template>
  <div class="flex items-center gap-1">
    <!-- Email Icon -->
    <UTooltip text="Send email">
      <UButton
        :to="mailtoUrl"
        target="_blank"
        icon="i-heroicons-envelope"
        size="xs"
        color="gray"
        variant="ghost"
        :ui="{ rounded: 'rounded-full' }"
        @click.stop
      />
    </UTooltip>

    <!-- Teams Chat Icon -->
    <UTooltip text="Open Teams chat">
      <UButton
        :to="teamsUrl"
        icon="i-simple-icons-microsoftteams"
        size="xs"
        color="gray"
        variant="ghost"
        :ui="{ rounded: 'rounded-full' }"
        @click.stop="handleTeamsClick"
      />
    </UTooltip>

    <!-- Copy Email Icon -->
    <UTooltip text="Copy email">
      <UButton
        icon="i-heroicons-clipboard-document"
        size="xs"
        color="gray"
        variant="ghost"
        :ui="{ rounded: 'rounded-full' }"
        @click.stop="handleCopyEmail"
      />
    </UTooltip>
  </div>
</template>

<script setup lang="ts">
import { getMailtoUrl, getTeamsUrl, copyToClipboard } from '~/utils/author-helpers'

const props = defineProps<{
  email: string
  subject?: string
}>()

const mailtoUrl = computed(() => getMailtoUrl(props.email, props.subject))
const teamsUrl = computed(() => getTeamsUrl(props.email))

function handleTeamsClick(event: MouseEvent) {
  event.preventDefault()
  window.location.href = teamsUrl.value
}

async function handleCopyEmail() {
  await copyToClipboard(props.email, `Copied ${props.email}`)
}
</script>
