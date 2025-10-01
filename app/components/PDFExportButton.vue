<template>
  <UButton
    :icon="icon"
    :color="color"
    :variant="variant"
    :size="size"
    :loading="isExporting"
    :disabled="disabled || isExporting"
    @click="handleExport"
  >
    <slot>{{ label }}</slot>
  </UButton>
</template>

<script setup lang="ts">
import type { PDFExportOptions } from '~/utils/pdfExport'

interface Props {
  data?: any
  html?: string | HTMLElement
  type?: 'data' | 'html' | 'json' | 'table' | 'chart' | 'cost'
  headers?: string[]
  rows?: any[][]
  options?: PDFExportOptions
  icon?: string
  color?: string
  variant?: string
  size?: string
  label?: string
  disabled?: boolean
  onExport?: () => Promise<any> | any
}

const props = withDefaults(defineProps<Props>(), {
  type: 'data',
  icon: 'i-heroicons-arrow-down-tray',
  color: 'primary',
  variant: 'solid',
  size: 'md',
  label: 'Export PDF',
  disabled: false,
})

const emit = defineEmits<{
  exported: [blob: Blob | void]
  error: [error: Error]
}>()

const isExporting = ref(false)
const { exportData, exportHTML, exportJSON, exportTable, exportChartData, exportCostData } = usePDFExport()

const handleExport = async () => {
  isExporting.value = true
  
  try {
    let dataToExport = props.data
    
    if (props.onExport) {
      dataToExport = await props.onExport()
    }
    
    let result: Blob | void
    
    switch (props.type) {
      case 'html':
        result = await exportHTML(props.html || dataToExport, props.options)
        break
      case 'json':
        result = exportJSON(dataToExport, props.options)
        break
      case 'table':
        if (props.headers && props.rows) {
          result = exportTable(props.headers, props.rows, props.options)
        } else if (dataToExport?.headers && dataToExport?.rows) {
          result = exportTable(dataToExport.headers, dataToExport.rows, props.options)
        } else {
          throw new Error('Table export requires headers and rows')
        }
        break
      case 'chart':
        result = await exportChartData(dataToExport, props.options)
        break
      case 'cost':
        result = await exportCostData(dataToExport, props.options)
        break
      default:
        result = await exportData(dataToExport, props.options)
        break
    }
    
    emit('exported', result)
  } catch (error) {
    console.error('PDF export error:', error)
    emit('error', error as Error)
  } finally {
    isExporting.value = false
  }
}
</script>