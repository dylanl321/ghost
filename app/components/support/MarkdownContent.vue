<template>
  <article class="markdown-content">
    <div v-html="renderedContent"></div>
  </article>
</template>

<script setup lang="ts">
import { marked } from 'marked'
import mermaid from 'mermaid'

// Props
const props = defineProps<{
  content: string
}>()

const colorMode = useColorMode()

// Mermaid chart counter for unique IDs
let mermaidCounter = 0

function getMermaidTheme(): 'default' | 'dark' {
  return colorMode.value === 'dark' ? 'dark' : 'default'
}

// Initialize mermaid on client side only
onMounted(() => {
  mermaid.initialize({
    startOnLoad: false,
    theme: getMermaidTheme(),
    securityLevel: 'loose',
  })
})

// Configure marked options
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert \n to <br>
})

// Custom renderer to handle mermaid code blocks
const renderer = new marked.Renderer()

// Override code block rendering to detect mermaid
const originalCodeRenderer = renderer.code.bind(renderer)
renderer.code = function(code: string, language: string | undefined) {
  if (language === 'mermaid') {
    const mermaidId = `mermaid-${mermaidCounter++}`
    // Return a placeholder that will be rendered by mermaid
    return `<div class="mermaid-chart" id="${mermaidId}">${code}</div>`
  }
  // Use default code rendering for other languages
  return originalCodeRenderer(code, language)
}

// Computed property to render markdown
const renderedContent = computed(() => {
  try {
    // Reset counter for each render
    mermaidCounter = 0
    // Parse markdown with marked
    const html = marked.parse(props.content, { renderer }) as string
    return html
  } catch (error) {
    console.error('Error parsing markdown:', error)
    return '<p class="text-red-500">Error rendering markdown content</p>'
  }
})

async function renderMermaidCharts() {
  await nextTick()
  // Find all mermaid chart elements and render them
  const mermaidElements = document.querySelectorAll('.mermaid-chart')
  for (const element of mermaidElements) {
    try {
      const code = element.textContent || ''
      const id = element.id
      const { svg } = await mermaid.render(id + '-svg', code)
      element.innerHTML = svg
    } catch (error) {
      console.error('Error rendering mermaid chart:', error)
      element.innerHTML = '<p class="text-red-500">Error rendering chart</p>'
    }
  }
}

// Render mermaid charts after content updates
watch(renderedContent, async () => {
  await renderMermaidCharts()
})

// Re-render mermaid when theme changes
watch(
  () => colorMode.value,
  async () => {
    if (!import.meta.client) return
    mermaid.initialize({
      startOnLoad: false,
      theme: getMermaidTheme(),
      securityLevel: 'loose',
    })
    await renderMermaidCharts()
  }
)
</script>

<style scoped>
.markdown-content {
  @apply text-gray-800 dark:text-gray-200;
}

/* Spacer for visual breathing room */
:deep(.spacer) {
  @apply h-1;
}

/* Headers with strong visual hierarchy */
:deep(h1) {
  @apply text-3xl font-bold text-gray-900 dark:text-white mb-4 mt-8 first:mt-0 pb-2 border-b-2 border-gray-200 dark:border-gray-700;
}

:deep(h2) {
  @apply text-2xl font-bold text-gray-900 dark:text-white mb-3 mt-6 pb-2 border-b border-gray-200 dark:border-gray-700;
}

:deep(h3) {
  @apply text-xl font-semibold text-blue-600 dark:text-blue-400 mb-3 mt-5;
}

:deep(h4) {
  @apply text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2 mt-4;
}

:deep(h5) {
  @apply text-base font-semibold text-gray-700 dark:text-gray-300 mb-2 mt-3;
}

:deep(h6) {
  @apply text-sm font-semibold text-gray-600 dark:text-gray-400 mb-1 mt-2;
}

/* Paragraphs with proper spacing */
:deep(p) {
  @apply text-base leading-normal mb-3 text-gray-700 dark:text-gray-300;
}

/* Lists with excellent visual distinction */
:deep(ul) {
  @apply space-y-2 mb-4;
}

:deep(ol) {
  @apply space-y-2 mb-4;
}

:deep(ul.list-disc) {
  @apply pl-6;
  list-style-type: disc;
}

:deep(ol.list-decimal) {
  @apply pl-6;
  list-style-type: decimal;
}

:deep(li) {
  @apply text-gray-700 dark:text-gray-300 leading-relaxed pl-2;
}

:deep(ul li) {
  @apply relative;
}

:deep(ul li::marker) {
  @apply text-blue-500 dark:text-blue-400 text-lg;
}

:deep(ol li::marker) {
  @apply text-blue-600 dark:text-blue-400 font-semibold;
}

/* Nested lists */
:deep(li ul),
:deep(li ol) {
  @apply mt-2 mb-2;
}

/* Inline code */
:deep(code) {
  @apply bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-sm text-blue-600 dark:text-blue-400 border border-gray-200 dark:border-gray-700;
}

/* Code blocks */
:deep(pre.code-block) {
  @apply bg-gray-50 dark:bg-gray-950 p-4 rounded-lg overflow-x-auto my-4 border border-gray-200 dark:border-gray-700;
}

:deep(pre.code-block code) {
  @apply bg-transparent border-0 text-gray-800 dark:text-gray-100 text-sm leading-normal block;
}

/* Links */
:deep(a) {
  @apply text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 underline decoration-blue-400/50 hover:decoration-blue-600 underline-offset-2 transition-colors;
}

/* Blockquotes */
:deep(blockquote) {
  @apply border-l-4 border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 pl-4 pr-3 py-3 my-4 italic text-gray-700 dark:text-gray-300 rounded-r;
}

/* Horizontal rules */
:deep(hr) {
  @apply my-6 border-0 border-t-2 border-gray-300 dark:border-gray-700;
}

/* Strong/Bold */
:deep(strong) {
  @apply font-semibold text-gray-900 dark:text-white;
}

/* Emphasis/Italic */
:deep(em) {
  @apply italic text-gray-600 dark:text-gray-400;
}

/* Special emoji styling */
:deep(.emoji-check) {
  @apply inline-block mr-2 text-green-500;
}

:deep(.emoji-x) {
  @apply inline-block mr-2 text-red-500;
}

:deep(.emoji-bulb) {
  @apply inline-block mr-2 text-yellow-500;
}

:deep(.emoji-lock) {
  @apply inline-block mr-2 text-gray-500;
}

/* Tables */
:deep(table) {
  @apply w-full my-4 border-collapse bg-white dark:bg-gray-800 rounded-lg overflow-hidden shadow-sm;
}

:deep(th) {
  @apply bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 px-3 py-2 text-left font-semibold text-gray-900 dark:text-white;
}

:deep(td) {
  @apply border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-700 dark:text-gray-300;
}

/* Add hover effect to table rows */
:deep(tbody tr) {
  @apply hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors;
}

/* Mermaid charts */
:deep(.mermaid-chart) {
  @apply my-6 p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto;
}

:deep(.mermaid-chart svg) {
  @apply max-w-full h-auto mx-auto;
}
</style>
