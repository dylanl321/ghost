<template>
  <div>
    <UButton
      icon="i-heroicons-arrow-down-tray"
      color="blue"
      variant="soft"
      size="sm"
      @click="isOpen = true"
    >
      Export
    </UButton>

    <UModal v-model="isOpen" :ui="{ width: 'w-full max-w-lg' }">
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <UIcon name="i-heroicons-arrow-down-tray" class="w-6 h-6 text-blue-400" />
            <h3 class="text-lg font-semibold text-white">Export Policy Analysis</h3>
          </div>
        </template>

        <div class="space-y-4">
          <!-- Export options -->
          <div class="space-y-3">
            <button
              @click="exportAsText"
              class="w-full flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg transition-colors"
            >
              <div class="flex items-center gap-3">
                <UIcon name="i-heroicons-clipboard-document" class="w-5 h-5 text-blue-400" />
                <div class="text-left">
                  <div class="font-medium text-white">Copy to Clipboard</div>
                  <div class="text-xs text-gray-400">Copy formatted text summary</div>
                </div>
              </div>
              <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-gray-400" />
            </button>

            <button
              @click="exportAsMarkdown"
              class="w-full flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg transition-colors"
            >
              <div class="flex items-center gap-3">
                <UIcon name="i-heroicons-document-text" class="w-5 h-5 text-green-400" />
                <div class="text-left">
                  <div class="font-medium text-white">Download as Markdown</div>
                  <div class="text-xs text-gray-400">Save as .md file for documentation</div>
                </div>
              </div>
              <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-gray-400" />
            </button>

            <button
              @click="exportAsJSON"
              class="w-full flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg transition-colors"
            >
              <div class="flex items-center gap-3">
                <UIcon name="i-heroicons-code-bracket" class="w-5 h-5 text-purple-400" />
                <div class="text-left">
                  <div class="font-medium text-white">Download as JSON</div>
                  <div class="text-xs text-gray-400">Export raw data for processing</div>
                </div>
              </div>
              <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-gray-400" />
            </button>

            <button
              @click="exportAsCSV"
              class="w-full flex items-center justify-between p-4 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg transition-colors"
            >
              <div class="flex items-center gap-3">
                <UIcon name="i-heroicons-table-cells" class="w-5 h-5 text-orange-400" />
                <div class="text-left">
                  <div class="font-medium text-white">Download as CSV</div>
                  <div class="text-xs text-gray-400">Export for spreadsheet analysis</div>
                </div>
              </div>
              <UIcon name="i-heroicons-chevron-right" class="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <!-- Success message -->
          <div
            v-if="exportSuccess"
            class="bg-green-900/20 border border-green-700/30 rounded-lg p-3 flex items-center gap-2"
          >
            <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-400" />
            <span class="text-sm text-green-300">{{ exportSuccess }}</span>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end">
            <UButton color="gray" variant="ghost" @click="isOpen = false">
              Close
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  analysisData: any
  accountName: string
  environment: string
}>()

const isOpen = ref(false)
const exportSuccess = ref<string | null>(null)

const { formatAsText, formatAsMarkdown, formatAsCSV, copyToClipboard, downloadFile } = usePolicyExport()

const exportAsText = async () => {
  const text = formatAsText(props.analysisData, props.accountName, props.environment)
  await copyToClipboard(text)
  showSuccess('Copied to clipboard!')
}

const exportAsMarkdown = () => {
  const markdown = formatAsMarkdown(props.analysisData, props.accountName, props.environment)
  const filename = `policy-analysis-${props.accountName}-${new Date().toISOString().split('T')[0]}.md`
  downloadFile(markdown, filename, 'text/markdown')
  showSuccess('Downloaded as Markdown!')
}

const exportAsJSON = () => {
  const json = JSON.stringify(props.analysisData, null, 2)
  const filename = `policy-analysis-${props.accountName}-${new Date().toISOString().split('T')[0]}.json`
  downloadFile(json, filename, 'application/json')
  showSuccess('Downloaded as JSON!')
}

const exportAsCSV = () => {
  const csv = formatAsCSV(props.analysisData, props.accountName, props.environment)
  const filename = `policy-analysis-${props.accountName}-${new Date().toISOString().split('T')[0]}.csv`
  downloadFile(csv, filename, 'text/csv')
  showSuccess('Downloaded as CSV!')
}

const showSuccess = (message: string) => {
  exportSuccess.value = message
  setTimeout(() => {
    exportSuccess.value = null
  }, 3000)
}
</script>
