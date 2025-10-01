<template>
  <article class="markdown-content">
    <div v-html="renderedContent"></div>
  </article>
</template>

<script setup lang="ts">
// Props
const props = defineProps<{
  content: string
}>()

// Enhanced markdown parser with better structure and spacing
const parseMarkdown = (markdown: string): string => {
  // Split into lines for better processing
  const lines = markdown.split('\n')
  const result: string[] = []
  let inCodeBlock = false
  let codeBlockContent: string[] = []
  let inList = false
  let listItems: string[] = []
  let listType: 'ul' | 'ol' | null = null

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const tag = listType === 'ul' ? 'ul' : 'ol'
      const listClass = listType === 'ul' ? 'list-disc' : 'list-decimal'
      result.push(`<${tag} class="${listClass} list-outside ml-6 my-6 space-y-3">`)
      listItems.forEach(item => result.push(item))
      result.push(`</${tag}>`)
      listItems = []
      listType = null
      inList = false
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Handle code blocks
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        const code = codeBlockContent.join('\n')
        result.push(`<pre class="code-block"><code>${escapeHtml(code)}</code></pre>`)
        codeBlockContent = []
        inCodeBlock = false
      } else {
        // Start code block
        flushList()
        inCodeBlock = true
      }
      continue
    }

    if (inCodeBlock) {
      codeBlockContent.push(line)
      continue
    }

    // Empty lines
    if (trimmed === '') {
      flushList()
      result.push('<div class="spacer"></div>')
      continue
    }

    // Headers
    if (trimmed.startsWith('#')) {
      flushList()
      const headerMatch = trimmed.match(/^(#{1,6})\s+(.+)$/)
      if (headerMatch) {
        const level = headerMatch[1].length
        const text = processInlineMarkdown(headerMatch[2])
        result.push(`<h${level}>${text}</h${level}>`)
        continue
      }
    }

    // Unordered lists (bullet points)
    if (trimmed.match(/^[-*]\s+/)) {
      if (listType !== 'ul') {
        flushList()
        listType = 'ul'
      }
      inList = true
      const content = processInlineMarkdown(trimmed.replace(/^[-*]\s+/, ''))
      listItems.push(`<li>${content}</li>`)
      continue
    }

    // Ordered lists (numbered)
    if (trimmed.match(/^\d+\.\s+/)) {
      if (listType !== 'ol') {
        flushList()
        listType = 'ol'
      }
      inList = true
      const content = processInlineMarkdown(trimmed.replace(/^\d+\.\s+/, ''))
      listItems.push(`<li>${content}</li>`)
      continue
    }

    // Blockquotes
    if (trimmed.startsWith('>')) {
      flushList()
      const content = processInlineMarkdown(trimmed.replace(/^>\s*/, ''))
      result.push(`<blockquote>${content}</blockquote>`)
      continue
    }

    // Horizontal rules
    if (trimmed.match(/^---+$/)) {
      flushList()
      result.push('<hr>')
      continue
    }

    // Regular paragraphs
    flushList()
    const content = processInlineMarkdown(trimmed)
    if (content) {
      result.push(`<p>${content}</p>`)
    }
  }

  // Flush any remaining list
  flushList()

  return result.join('\n')
}

// Process inline markdown (bold, italic, links, code, etc.)
const processInlineMarkdown = (text: string): string => {
  let result = text

  // Code blocks (inline)
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Bold
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>')

  // Italic (but not in URLs or already processed)
  result = result.replace(/(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, '<em>$1</em>')
  result = result.replace(/(?<!_)_(?!_)([^_]+)_(?!_)/g, '<em>$1</em>')

  // Links
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

  // Special emoji/icon handling for common patterns
  result = result.replace(/✅/g, '<span class="emoji-check">✅</span>')
  result = result.replace(/❌/g, '<span class="emoji-x">❌</span>')
  result = result.replace(/💡/g, '<span class="emoji-bulb">💡</span>')
  result = result.replace(/🔒/g, '<span class="emoji-lock">🔒</span>')

  return result
}

// Escape HTML to prevent XSS in code blocks
const escapeHtml = (text: string): string => {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Computed
const renderedContent = computed(() => {
  return parseMarkdown(props.content)
})
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
  @apply bg-gray-900 dark:bg-gray-950 p-4 rounded-lg overflow-x-auto my-4 border border-gray-700;
}

:deep(pre.code-block code) {
  @apply bg-transparent border-0 text-gray-100 text-sm leading-normal block;
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
</style>
