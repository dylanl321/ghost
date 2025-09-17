<template>
  <div class="container mx-auto p-6">
    <h1 class="text-2xl font-bold mb-6">PDF Export Demo</h1>
    
    <div class="space-y-6">
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Export JSON Data</h2>
        </template>
        <div class="space-y-4">
          <pre class="bg-gray-100 p-4 rounded">{{ sampleJSON }}</pre>
          <PDFExportButton
            :data="sampleJSON"
            type="json"
            :options="{
              title: 'JSON Data Export',
              subtitle: 'Sample JSON data with nested objects',
              filename: 'json-export.pdf'
            }"
          />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Export Table Data</h2>
        </template>
        <div class="space-y-4">
          <UTable :columns="tableColumns" :rows="tableRows" />
          <PDFExportButton
            :headers="tableColumns.map(c => c.label)"
            :rows="tableRows.map(r => tableColumns.map(c => r[c.key]))"
            type="table"
            :options="{
              title: 'Table Export',
              subtitle: 'Employee Data',
              filename: 'table-export.pdf',
              orientation: 'landscape'
            }"
          />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Export HTML Content</h2>
        </template>
        <div class="space-y-4">
          <div ref="htmlContent" class="p-4 border rounded">
            <h3 class="text-lg font-bold text-blue-600">HTML Content Example</h3>
            <p class="mt-2">This is a paragraph with <strong>bold text</strong> and <em>italic text</em>.</p>
            <ul class="list-disc list-inside mt-2">
              <li>First item</li>
              <li>Second item</li>
              <li>Third item</li>
            </ul>
            <div class="mt-4 p-3 bg-yellow-100 rounded">
              <p class="text-sm">This is a highlighted box with special styling.</p>
            </div>
          </div>
          <PDFExportButton
            :html="htmlContent"
            type="html"
            :options="{
              title: 'HTML Export',
              subtitle: 'Styled HTML content',
              filename: 'html-export.pdf'
            }"
          />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Export Cost Data</h2>
        </template>
        <div class="space-y-4">
          <pre class="bg-gray-100 p-4 rounded text-sm">{{ costData }}</pre>
          <PDFExportButton
            :data="costData"
            type="cost"
            :options="{
              filename: 'cost-report.pdf'
            }"
          />
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold">Custom Export with Multiple Data Types</h2>
        </template>
        <div class="space-y-4">
          <p>Export multiple data types in a single PDF</p>
          <UButton @click="handleCustomExport" color="primary" variant="solid">
            Export Combined PDF
          </UButton>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
const htmlContent = ref<HTMLElement>()
const { exportMultiple } = usePDFExport()

const sampleJSON = {
  id: 1,
  name: 'John Doe',
  email: 'john.doe@example.com',
  address: {
    street: '123 Main St',
    city: 'Anytown',
    state: 'CA',
    zip: '12345'
  },
  skills: ['JavaScript', 'TypeScript', 'Vue.js', 'Node.js'],
  active: true,
  createdAt: new Date().toISOString()
}

const tableColumns = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'position', label: 'Position' },
  { key: 'department', label: 'Department' },
  { key: 'salary', label: 'Salary' }
]

const tableRows = [
  { id: 1, name: 'Alice Johnson', position: 'Software Engineer', department: 'Engineering', salary: '$95,000' },
  { id: 2, name: 'Bob Smith', position: 'Product Manager', department: 'Product', salary: '$110,000' },
  { id: 3, name: 'Carol Williams', position: 'UX Designer', department: 'Design', salary: '$85,000' },
  { id: 4, name: 'David Brown', position: 'DevOps Engineer', department: 'Engineering', salary: '$100,000' },
  { id: 5, name: 'Eve Davis', position: 'Data Analyst', department: 'Analytics', salary: '$80,000' }
]

const costData = {
  summary: {
    totalCost: '$12,543.67',
    monthlyAverage: '$2,090.61',
    trend: '+5.3%',
    lastUpdated: new Date().toISOString()
  },
  breakdown: [
    { service: 'EC2', cost: '$4,532.10', percentage: '36.1%' },
    { service: 'S3', cost: '$2,145.89', percentage: '17.1%' },
    { service: 'RDS', cost: '$1,876.34', percentage: '15.0%' },
    { service: 'Lambda', cost: '$987.65', percentage: '7.9%' },
    { service: 'CloudFront', cost: '$654.32', percentage: '5.2%' }
  ],
  trends: {
    monthly: [
      { month: 'January', cost: 2015.43 },
      { month: 'February', cost: 2134.67 },
      { month: 'March', cost: 2089.23 },
      { month: 'April', cost: 2167.89 },
      { month: 'May', cost: 2234.56 },
      { month: 'June', cost: 2301.89 }
    ]
  },
  recommendations: [
    {
      title: 'Optimize EC2 Instance Types',
      description: 'Switch 5 instances from m5.large to t3.large for development workloads',
      savings: '$234/month'
    },
    {
      title: 'Enable S3 Intelligent Tiering',
      description: 'Move infrequently accessed data to cheaper storage tiers',
      savings: '$156/month'
    },
    {
      title: 'Remove Unused EBS Volumes',
      description: '12 unattached EBS volumes detected',
      savings: '$89/month'
    }
  ]
}

const handleCustomExport = async () => {
  await exportMultiple([
    {
      data: 'This is a combined PDF export demonstrating multiple data types in a single document.',
      type: 'text',
      title: 'Introduction'
    },
    {
      data: sampleJSON,
      type: 'data',
      title: 'JSON Data Section',
      pageBreak: true
    },
    {
      data: { headers: tableColumns.map(c => c.label), rows: tableRows.map(r => tableColumns.map(c => r[c.key])) },
      type: 'data',
      title: 'Table Data Section',
      pageBreak: true
    },
    {
      data: htmlContent.value!,
      type: 'html',
      title: 'HTML Content Section',
      pageBreak: true
    },
    {
      data: costData,
      type: 'data',
      title: 'Cost Analysis Section'
    }
  ], {
    title: 'Combined Data Export',
    subtitle: 'Multiple data types in one PDF',
    filename: 'combined-export.pdf',
    orientation: 'portrait'
  })
}
</script>