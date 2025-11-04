<template>
  <div class="space-y-4">
    <!-- Upload Section -->
    <div class="border border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-white">Import Forecast Data</h3>
        <UButton
          v-if="uploadedData.length > 0"
          size="xs"
          variant="ghost"
          color="red"
          icon="i-heroicons-trash"
          @click="clearData"
        >
          Clear Data
        </UButton>
      </div>
      
      <div class="space-y-4">
        <!-- File Upload -->
        <div class="space-y-2">
          <label class="block text-sm font-medium text-gray-300">
            Select Excel File (.xlsx)
          </label>
          <input
            ref="fileInput"
            type="file"
            accept=".xlsx,.xls"
            @change="handleFileSelect"
            :disabled="isProcessing"
            class="block w-full text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-800 file:text-white hover:file:bg-gray-700 cursor-pointer"
          />
          <p class="text-xs text-gray-400">
            Upload an Excel file with forecast data. The system will extract calculated values and store them in the database.
          </p>
        </div>

        <!-- Processing Status -->
        <div v-if="isProcessing" class="flex items-center gap-2 text-blue-400">
          <Icon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
          <span class="text-sm">Processing file...</span>
        </div>

        <!-- Error Display -->
        <div v-if="error" class="bg-red-900/20 border border-red-700 rounded-lg p-3">
          <div class="flex items-start gap-2">
            <Icon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 class="text-sm font-medium text-red-300">Upload Error</h4>
              <p class="text-xs text-red-400 mt-1">{{ error }}</p>
            </div>
          </div>
        </div>

        <!-- Success Display -->
        <div v-if="successMessage" class="bg-green-900/20 border border-green-700 rounded-lg p-3">
          <div class="flex items-start gap-2">
            <Icon name="i-heroicons-check-circle" class="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 class="text-sm font-medium text-green-300">Upload Successful</h4>
              <p class="text-xs text-green-400 mt-1">{{ successMessage }}</p>
            </div>
          </div>
        </div>

        <!-- Upload Button -->
        <UButton
          v-if="selectedFile"
          color="blue"
          @click="processFile"
          :disabled="isProcessing"
          :loading="isProcessing"
          class="w-full"
        >
          <Icon name="i-heroicons-cloud-arrow-up" class="w-4 h-4 mr-2" />
          {{ isProcessing ? 'Processing...' : 'Process File' }}
        </UButton>
        
        <!-- Debug info -->
        <div v-if="selectedFile" class="mt-2 text-xs text-gray-400">
          Selected file: {{ selectedFile.name }} ({{ (selectedFile.size / 1024).toFixed(1) }} KB)
        </div>
      </div>
    </div>

    <!-- Data Preview -->
    <div v-if="uploadedData.length > 0" class="border border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-white">Preview Data</h3>
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-400">{{ uploadedData.length }} records</span>
          <UButton
            size="xs"
            variant="ghost"
            color="blue"
            icon="i-heroicons-eye"
            @click="showPreview = !showPreview"
          >
            {{ showPreview ? 'Hide' : 'Show' }} Preview
          </UButton>
        </div>
      </div>

      <!-- Data Table Preview -->
      <div v-if="showPreview" class="overflow-x-auto">
        <div class="mb-4 text-sm text-gray-400">
          Found {{ uploadedData.length }} forecast records
        </div>
        
        <!-- Summary Stats -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div class="bg-gray-800 p-3 rounded">
            <div class="text-xs text-gray-400">Total Records</div>
            <div class="text-lg font-semibold text-white">{{ uploadedData.length }}</div>
          </div>
          <div class="bg-gray-800 p-3 rounded">
            <div class="text-xs text-gray-400">Accounts</div>
            <div class="text-lg font-semibold text-white">{{ new Set(uploadedData.map(r => r['Account Name'] || r['Enclave ID'])).size }}</div>
          </div>
          <div class="bg-gray-800 p-3 rounded">
            <div class="text-xs text-gray-400">Total Forecast</div>
            <div class="text-lg font-semibold text-green-400">
              {{ formatCurrency(uploadedData.reduce((sum, r) => sum + (r.monthlyForecasts ? Object.values(r.monthlyForecasts).reduce((a: any, b: any) => (a || 0) + (b || 0), 0) : 0), 0)) }}
            </div>
          </div>
          <div class="bg-gray-800 p-3 rounded">
            <div class="text-xs text-gray-400">Months</div>
            <div class="text-lg font-semibold text-white">{{ uploadedData[0]?.monthlyForecasts ? Object.keys(uploadedData[0].monthlyForecasts).length : 0 }}</div>
          </div>
        </div>

        <!-- Data Table -->
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-700">
                <th class="text-left py-2 px-3 text-gray-300">Enclave ID</th>
                <th class="text-left py-2 px-3 text-gray-300">Account Name</th>
                <th class="text-left py-2 px-3 text-gray-300">Project Type</th>
                <th class="text-left py-2 px-3 text-gray-300">LOB</th>
                <th class="text-right py-2 px-3 text-gray-300">Total Forecast</th>
                <th class="text-center py-2 px-3 text-gray-300">Months</th>
                <th class="text-center py-2 px-3 text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(item, index) in previewData"
                :key="index"
                class="border-b border-gray-800 hover:bg-gray-800/50"
              >
                <td class="py-2 px-3 text-gray-200 font-mono text-xs">
                  {{ item['Enclave ID'] || 'N/A' }}
                </td>
                <td class="py-2 px-3 text-gray-200 max-w-xs truncate" :title="item['Account Name']">
                  {{ item['Account Name'] || 'N/A' }}
                </td>
                <td class="py-2 px-3 text-gray-200 max-w-xs truncate" :title="item['Project Type']">
                  {{ item['Project Type'] || 'N/A' }}
                </td>
                <td class="py-2 px-3 text-gray-200 max-w-xs truncate" :title="item['LOB']">
                  {{ item['LOB'] || 'N/A' }}
                </td>
                <td class="py-2 px-3 text-right text-green-400 font-semibold">
                  {{ formatCurrency(Number(item.monthlyForecasts ? Object.values(item.monthlyForecasts).reduce((a: any, b: any) => Number(a || 0) + Number(b || 0), 0) : 0)) }}
                </td>
                <td class="py-2 px-3 text-center text-gray-400">
                  <span class="bg-gray-700 px-2 py-1 rounded text-xs">
                    {{ item.monthlyForecasts ? Object.keys(item.monthlyForecasts).length : 0 }}
                  </span>
                </td>
                <td class="py-2 px-3 text-center">
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="blue"
                    @click="showMonthlyDetails(item)"
                  >
                    <Icon name="i-heroicons-eye" class="w-3 h-3" />
                  </UButton>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Monthly Details Modal -->
        <UModal v-model="showDetailsModal" :ui="{ width: 'sm:max-w-4xl' }">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="text-lg font-semibold">Monthly Forecast Details</h3>
                <UButton
                  color="gray"
                  variant="ghost"
                  icon="i-heroicons-x-mark"
                  @click="showDetailsModal = false"
                />
              </div>
            </template>
            
            <div v-if="selectedItem">
              <div class="mb-4 p-4 bg-gray-800 rounded-lg">
                <h4 class="font-semibold text-white mb-2">{{ selectedItem['Account Name'] }}</h4>
                <div class="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span class="text-gray-400">Enclave ID:</span>
                    <span class="text-white ml-2">{{ selectedItem['Enclave ID'] }}</span>
                  </div>
                  <div>
                    <span class="text-gray-400">Project Type:</span>
                    <span class="text-white ml-2">{{ selectedItem['Project Type'] }}</span>
                  </div>
                  <div>
                    <span class="text-gray-400">LOB:</span>
                    <span class="text-white ml-2">{{ selectedItem['LOB'] }}</span>
                  </div>
                  <div>
                    <span class="text-gray-400">Total Forecast:</span>
                    <span class="text-green-400 ml-2 font-semibold">
                      {{ formatCurrency(Number(selectedItem.monthlyForecasts ? Object.values(selectedItem.monthlyForecasts).reduce((a: any, b: any) => Number(a || 0) + Number(b || 0), 0) : 0)) }}
                    </span>
                  </div>
                </div>
              </div>
              
              <div v-if="selectedItem.monthlyForecasts" class="overflow-x-auto">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b border-gray-700">
                      <th class="text-left py-2 px-3 text-gray-300">Month</th>
                      <th class="text-right py-2 px-3 text-gray-300">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(amount, month) in selectedItem.monthlyForecasts"
                      :key="month"
                      class="border-b border-gray-800 hover:bg-gray-800/50"
                    >
                      <td class="py-2 px-3 text-gray-200">{{ month }}</td>
                      <td class="py-2 px-3 text-right text-green-400 font-semibold">
                        {{ formatCurrency(amount) }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </UCard>
        </UModal>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-2 mt-4">
        <UButton
          color="green"
          @click="saveToDatabase"
          :loading="isSaving"
          :disabled="isSaving"
        >
          <Icon name="i-heroicons-database" class="w-4 h-4 mr-2" />
          Save to Database
        </UButton>
        <UButton
          variant="outline"
          color="gray"
          @click="downloadSample"
        >
          <Icon name="i-heroicons-document-arrow-down" class="w-4 h-4 mr-2" />
          Download Sample
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import * as XLSX from 'xlsx'
import { useForecastData } from '~/composables/useForecastData'

// Composables
const { uploadForecastData, formatCurrency } = useForecastData()

// State
const selectedFile = ref<File | null>(null)
const uploadedData = ref<any[]>([])
const isProcessing = ref(false)
const isSaving = ref(false)
const error = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const showPreview = ref(false)
const fileInput = ref<HTMLInputElement>()
const showDetailsModal = ref(false)
const selectedItem = ref<any>(null)

// Computed
const previewData = computed(() => uploadedData.value.slice(0, 10))

// Methods
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  console.log('File selected:', target.files)
  
  if (target.files && target.files[0]) {
    selectedFile.value = target.files[0]
    error.value = null
    successMessage.value = null
    console.log('File set:', selectedFile.value.name)
  }
}

const showMonthlyDetails = (item: any) => {
  selectedItem.value = item
  showDetailsModal.value = true
}

const processFile = async () => {
  if (!selectedFile.value) return

  isProcessing.value = true
  error.value = null
  successMessage.value = null

  try {
    const workbook = await readExcelFile(selectedFile.value)
    const processedData = extractForecastData(workbook)
    
    uploadedData.value = processedData
    successMessage.value = `Successfully processed ${processedData.length} forecast records`
  } catch (err: any) {
    error.value = err.message || 'Failed to process file'
    console.error('File processing error:', err)
  } finally {
    isProcessing.value = false
  }
}

const readExcelFile = (file: File): Promise<XLSX.WorkBook> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        // cellDates: parse date cells as Date objects
        // cellFormula: false to get calculated values instead of formulas
        const workbook = XLSX.read(data, {
          type: 'array',
          cellDates: true,
          cellFormula: false
        })
        resolve(workbook)
      } catch (err) {
        reject(new Error('Invalid Excel file format'))
      }
    }

    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

const extractForecastData = (workbook: XLSX.WorkBook): any[] => {
  const data: any[] = []

  // Get the first worksheet
  const sheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheetName!]

  if (!worksheet) {
    throw new Error('No data found in Excel file')
  }

  // Convert to JSON with all rows, using defval to preserve empty cells
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: false })

  if (jsonData.length < 2) {
    throw new Error('Excel file must contain at least 2 rows (headers and data)')
  }

  console.log('Excel structure - first 5 rows:')
  for (let i = 0; i < Math.min(5, jsonData.length); i++) {
    console.log(`Row ${i + 1}:`, jsonData[i])
  }

  // Detect file format by looking for header row
  // Format 1: Row 1 has formulas/aggregates, Row 2 has headers (BOM format)
  // Format 2: Row 1-2 are metadata, Row 3 has headers (old format)

  let headerRowIndex = -1
  let dataStartIndex = -1

  // Check if row 2 contains "Enclave ID" (BOM format)
  if (jsonData.length > 1) {
    const row2 = jsonData[1] as any[]
    if (row2[0] === 'Enclave ID' || String(row2[0]).trim() === 'Enclave ID') {
      headerRowIndex = 1  // Row 2 (0-indexed)
      dataStartIndex = 2  // Row 3 (0-indexed)
      console.log('Detected BOM format: header at row 2, data starts at row 3')
    }
  }

  // Check if row 3 contains "Enclave ID" (old format)
  if (headerRowIndex === -1 && jsonData.length > 2) {
    const row3 = jsonData[2] as any[]
    if (row3[0] === 'Enclave ID' || String(row3[0]).trim() === 'Enclave ID') {
      headerRowIndex = 2  // Row 3 (0-indexed)
      dataStartIndex = 3  // Row 4 (0-indexed)
      console.log('Detected old format: header at row 3, data starts at row 4')
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('Could not find header row. Expected "Enclave ID" in column A of row 2 or 3')
  }

  const headerRow = jsonData[headerRowIndex] as any[]
  const dataRows = jsonData.slice(dataStartIndex) as any[][]

  console.log('Header row:', headerRow)
  console.log(`Processing ${dataRows.length} data rows`)

  // Find where the monthly data starts (after the last metadata column)
  // Look for the first date column or numeric column index 9
  let monthlyDataStartIndex = 9  // Default to column J

  // Verify by checking if column 9 looks like a date or month
  if (headerRow[9] instanceof Date || typeof headerRow[9] === 'string' && /\d{4}/.test(String(headerRow[9]))) {
    monthlyDataStartIndex = 9
  }

  // Extract metadata columns (A-I typically)
  const metadataColumns = headerRow.slice(0, monthlyDataStartIndex)
  console.log('Metadata columns:', metadataColumns)

  // Extract monthly columns (J onwards)
  const monthlyColumns = headerRow.slice(monthlyDataStartIndex)
  console.log(`Found ${monthlyColumns.length} monthly columns`)
  console.log('First 5 monthly columns:', monthlyColumns.slice(0, 5))
  
  // Create column mapping for metadata
  const metadataMapping: Record<string, number> = {}
  metadataColumns.forEach((header, index) => {
    if (header && String(header).trim()) {
      metadataMapping[String(header).trim()] = index
    }
  })
  
  // Create column mapping for monthly data
  const monthlyMapping: Record<string, number> = {}
  monthlyColumns.forEach((header, index) => {
    if (header !== null && header !== undefined) {
      // Handle datetime objects from Excel
      let monthKey: string
      try {
        if (header instanceof Date) {
          // Format as YYYY-MM
          monthKey = header.toISOString().slice(0, 7)
        } else if (typeof header === 'number') {
          // Excel date serial number
          const date = new Date((header - 25569) * 86400 * 1000)
          monthKey = date.toISOString().slice(0, 7)
        } else {
          // String value (like "2025 Total" or "2026 Total")
          monthKey = String(header).trim()
        }
        
        // Only add non-empty, non-total columns
        if (monthKey && !monthKey.toLowerCase().includes('total')) {
          monthlyMapping[monthKey] = index + monthlyDataStartIndex
        }
      } catch (err) {
        console.warn(`Failed to parse column header at index ${index}:`, header, err)
      }
    }
  })

  console.log('Metadata mapping:', metadataMapping)
  console.log('Monthly mapping:', monthlyMapping)
  console.log('Monthly columns found:', Object.keys(monthlyMapping))

  // Process data rows - handle complex forecast structure
  dataRows.forEach((row, index) => {
    if (row.length === 0) return // Skip empty rows

    // Extract metadata (columns A-I)
    const metadata: Record<string, any> = {}
    Object.entries(metadataMapping).forEach(([fieldName, columnIndex]) => {
      const value = row[columnIndex]
      if (value !== null && value !== undefined && value !== '') {
        if (typeof value === 'number' || !isNaN(Number(value))) {
          metadata[fieldName] = Number(value)
        } else {
          metadata[fieldName] = String(value).trim()
        }
      }
    })

    // Extract monthly forecast data (columns J onwards)
    const monthlyForecasts: Record<string, number> = {}
    Object.entries(monthlyMapping).forEach(([month, columnIndex]) => {
      const value = row[columnIndex]
      // Include all months, even with zero or empty values
      let numericValue = 0
      
      if (value !== null && value !== undefined && value !== '') {
        // Handle currency values (remove $ and commas)
        if (typeof value === 'number') {
          numericValue = value
        } else if (typeof value === 'string') {
          const cleanValue = value.replace(/[$,\s]/g, '')
          numericValue = parseFloat(cleanValue) || 0
        }
      }
      
      // Always add the month, even if it's zero
      // This ensures all periods from Excel are preserved
      monthlyForecasts[month] = numericValue
    })

    // Only create record if we have meaningful data
    const hasMetadata = Object.values(metadata).some(value => 
      value !== null && value !== undefined && value !== '' && value !== 0
    )
    const hasForecasts = Object.values(monthlyForecasts).some(value => value > 0)
    
    if (hasMetadata || hasForecasts) {
      const record: any = {
        id: `forecast-${Date.now()}-${index}`,
        rowIndex: index + 4, // Excel row number (accounting for 3 header rows)
        uploadedAt: new Date().toISOString(),
        source: 'excel_upload',
        ...metadata,
        monthlyForecasts
      }
      
      data.push(record)
    }
  })

  if (data.length === 0) {
    throw new Error('No valid forecast records found in the Excel file')
  }

  return data
}

const saveToDatabase = async () => {
  if (uploadedData.value.length === 0) return

  isSaving.value = true
  error.value = null

  try {
    // Clear existing data first
    console.log('🗑️  Clearing existing forecast data...')
    await $fetch('/api/forecast/clear', {
      method: 'POST',
      body: { confirm: true }
    })
    
    // Upload new data
    console.log('📤 Uploading new forecast data...')
    
    // Transform data to match Excel structure - one record per account
    const transformedData: any[] = []
    
    uploadedData.value.forEach((record: any) => {
      // Handle both "Com Act ID" and "Com Acct ID" column names
      // "Com Act ID" is the column name in the BOM file
      // "Com Acct ID" was the old column name
      let accountId = record['Com Act ID'] || record['Com Acct ID'] || record.awsCommercialAccountID || record['Gov Acct ID'] || record['Gov Act ID'] || record.awsGovCloudAccountID

      // AWS account IDs should be 12 digits - pad with leading zeros if needed
      if (accountId) {
        accountId = String(accountId).padStart(12, '0')
      }

      const accountName = record['Account Name'] || record.accountName || ''

      if (accountId) {
        // Keep all month data, including zeros
        const monthlyForecasts: Record<string, number> = {}
        if (record.monthlyForecasts) {
          Object.entries(record.monthlyForecasts).forEach(([period, amount]) => {
            // Skip only total columns, keep all actual months including zeros
            if (!period.toLowerCase().includes('total')) {
              monthlyForecasts[period] = Number(amount) || 0
            }
          })
        }

        transformedData.push({
          accountId: accountId, // Already padded with zeros
          accountName,
          enclaveId: record['Enclave ID'],
          projectType: record['Project Type'],
          lob: record['LOB'],
          deptNumber: record['Dept #'],
          projNumber: record['Proj #'],
          taskNumber: record['Task #'],
          // Handle both old and new column names
          govAccountId: (record['Gov Acct ID'] || record['Gov Act ID']) ? String(record['Gov Acct ID'] || record['Gov Act ID']).padStart(12, '0') : null,
          comAccountId: (record['Com Act ID'] || record['Com Acct ID']) ? String(record['Com Act ID'] || record['Com Acct ID']).padStart(12, '0') : null,
          forecasts: monthlyForecasts,
          status: 'active'
        })
      }
    })
    
    if (transformedData.length === 0) {
      throw new Error('No valid forecast data to upload')
    }
    
    console.log(`📊 Uploading ${transformedData.length} forecast records...`)
    
    // Log the months being uploaded
    const allMonths = new Set<string>()
    transformedData.forEach(record => {
      if (record.forecasts) {
        Object.keys(record.forecasts).forEach(month => allMonths.add(month))
      }
    })
    console.log('Months being uploaded:', Array.from(allMonths).sort())
    
    const uploadResult = await uploadForecastData(transformedData)
    successMessage.value = `Successfully uploaded ${transformedData.length} forecast records to database`
  } catch (err: any) {
    error.value = err.message || 'Failed to save data to database'
    console.error('Database save error:', err)
  } finally {
    isSaving.value = false
  }
}

const clearData = () => {
  uploadedData.value = []
  selectedFile.value = null
  error.value = null
  successMessage.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const downloadSample = () => {
  // Create sample Excel file
  const sampleData = [
    ['Account ID', 'Account Name', 'Forecast Amount', 'Period', 'Status'],
    ['123456789012', 'Sample Account 1', 5000, '2024-01', 'active'],
    ['123456789013', 'Sample Account 2', 7500, '2024-01', 'active'],
    ['123456789014', 'Sample Account 3', 3000, '2024-01', 'inactive']
  ]

  const worksheet = XLSX.utils.aoa_to_sheet(sampleData)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Forecast Data')
  
  XLSX.writeFile(workbook, 'forecast-sample.xlsx')
}

</script>
