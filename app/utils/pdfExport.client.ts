import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'
import { marked } from 'marked'
import type { Token, Tokens } from 'marked'
import type { ChatMessage } from '#shared/types/chat-threads'

const logger = createLogger('PdfExport')

export interface PDFExportOptions {
  filename?: string
  orientation?: 'portrait' | 'landscape'
  format?: 'a4' | 'a3' | 'letter' | 'legal'
  title?: string
  subtitle?: string
  footer?: string
  margins?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
  fontSize?: {
    title?: number
    subtitle?: number
    body?: number
    footer?: number
  }
  colors?: {
    primary?: string
    secondary?: string
    text?: string
  }
  autoDownload?: boolean
  returnBlob?: boolean
}

interface DataTableConfig {
  headers: string[]
  rows: any[][]
}

export class PDFExporter {
  private pdf: jsPDF
  private options: Required<PDFExportOptions>
  private currentY: number = 20

  constructor(options: PDFExportOptions = {}) {
    this.options = {
      filename: options.filename || `export-${new Date().toISOString().slice(0, 10)}.pdf`,
      orientation: options.orientation || 'portrait',
      format: options.format || 'a4',
      title: options.title || '',
      subtitle: options.subtitle || '',
      footer: options.footer || '',
      margins: {
        top: options.margins?.top ?? 20,
        right: options.margins?.right ?? 20,
        bottom: options.margins?.bottom ?? 20,
        left: options.margins?.left ?? 20,
      },
      fontSize: {
        title: options.fontSize?.title ?? 16,
        subtitle: options.fontSize?.subtitle ?? 11,
        body: options.fontSize?.body ?? 10,
        footer: options.fontSize?.footer ?? 8,
      },
      colors: {
        primary: options.colors?.primary ?? '#1e40af',
        secondary: options.colors?.secondary ?? '#64748b',
        text: options.colors?.text ?? '#000000',
      },
      autoDownload: options.autoDownload ?? true,
      returnBlob: options.returnBlob ?? false,
    }

    this.pdf = new jsPDF({
      orientation: this.options.orientation,
      unit: 'mm',
      format: this.options.format,
      compress: true, // Enable compression for smaller file sizes
    })

    // Set PDF metadata
    this.pdf.setProperties({
      title: this.options.title || 'GHOST Export',
      subject: this.options.subtitle || '',
      author: 'GHOST Cost Dashboard',
      keywords: 'AWS, Cost Report, GHOST, Analytics',
      creator: 'GHOST Cost Dashboard'
    })

    this.currentY = this.options.margins.top
    this.addHeader()
  }

  private addHeader(): void {
    if (this.options.title) {
      this.pdf.setFontSize(this.options.fontSize.title)
      this.pdf.setTextColor(this.options.colors.primary)
      this.pdf.text(this.options.title, this.options.margins.left, this.currentY)
      this.currentY += 10
    }

    if (this.options.subtitle) {
      this.pdf.setFontSize(this.options.fontSize.subtitle)
      this.pdf.setTextColor(this.options.colors.secondary)
      this.pdf.text(this.options.subtitle, this.options.margins.left, this.currentY)
      this.currentY += 10
    }

    if (this.options.title || this.options.subtitle) {
      this.currentY += 5
    }
  }

  private addFooter(): void {
    if (this.options.footer) {
      const totalPages = this.pdf.getNumberOfPages()
      
      for (let i = 1; i <= totalPages; i++) {
        this.pdf.setPage(i)
        const pageHeight = this.pdf.internal.pageSize.height
        this.pdf.setFontSize(this.options.fontSize.footer)
        this.pdf.setTextColor(this.options.colors.secondary)
        
        // Replace {page} placeholder with actual page number
        const footerText = this.options.footer.replace('{page}', `${i} of ${totalPages}`)
        
        this.pdf.text(
          footerText,
          this.options.margins.left,
          pageHeight - this.options.margins.bottom / 2
        )
      }
    }
  }

  private formatData(data: any): DataTableConfig | string {
    if (data === null || data === undefined) {
      return 'No data provided'
    }

    if (typeof data === 'string') {
      return data
    }

    if (typeof data === 'number' || typeof data === 'boolean') {
      return String(data)
    }

    if (data instanceof Date) {
      return data.toISOString()
    }

    // Check if this is already a table structure with headers and rows
    if (typeof data === 'object' && !Array.isArray(data) &&
        data.headers && Array.isArray(data.headers) &&
        data.rows && Array.isArray(data.rows)) {
      // Already in the correct format for a table
      return {
        headers: data.headers,
        rows: data.rows.map(row =>
          Array.isArray(row) ? row.map(cell => this.formatCellValue(cell)) :
          data.headers.map((h: string) => this.formatCellValue(row?.[h]))
        )
      }
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        return 'Empty array'
      }

      if (typeof data[0] === 'object' && data[0] !== null) {
        const headers = Object.keys(data[0])
        const rows = data.map(item => 
          headers.map(header => this.formatCellValue(item[header]))
        )
        return { headers, rows }
      }

      return data.map(item => {
        if (typeof item === 'object') return JSON.stringify(item)
        return String(item)
      }).join('\n')
    }

    if (typeof data === 'object') {
      const entries = Object.entries(data)
      if (entries.length === 0) {
        return 'Empty object'
      }

      // Flatten nested objects for better display
      const flattenedRows: [string, string][] = []
      
      for (const [key, value] of entries) {
        if (value === null || value === undefined) {
          flattenedRows.push([key, ''])
        } else if (Array.isArray(value)) {
          // For arrays, check if they're simple or complex
          if (value.length > 0 && typeof value[0] === 'object') {
            // Complex array - show count and type
            flattenedRows.push([key, `Array (${value.length} items)`])
            // Optionally add a summary of first few items
            value.slice(0, 3).forEach((item, idx) => {
              const itemStr = this.formatCellValue(item)
              flattenedRows.push([`  ${key}[${idx}]`, itemStr.substring(0, 100)])
            })
            if (value.length > 3) {
              flattenedRows.push([`  ...`, `${value.length - 3} more items`])
            }
          } else {
            // Simple array - join values
            flattenedRows.push([key, value.map(v => this.formatCellValue(v)).join(', ')])
          }
        } else if (typeof value === 'object') {
          // For nested objects, flatten one level deep
          const nestedEntries = Object.entries(value)
          if (nestedEntries.length <= 3) {
            // Small object - show inline
            nestedEntries.forEach(([nestedKey, nestedValue]) => {
              flattenedRows.push([`${key}.${nestedKey}`, this.formatCellValue(nestedValue)])
            })
          } else {
            // Large object - show summary
            flattenedRows.push([key, `Object (${nestedEntries.length} properties)`])
          }
        } else {
          flattenedRows.push([key, this.formatCellValue(value)])
        }
      }

      return { 
        headers: ['Property', 'Value'], 
        rows: flattenedRows 
      }
    }

    return JSON.stringify(data, null, 2)
  }

  private formatCellValue(value: any): string {
    if (value === null || value === undefined) {
      return ''
    }
    
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }
    
    if (typeof value === 'number') {
      // Format large numbers with commas if they're integers
      if (Number.isInteger(value) && Math.abs(value) >= 1000) {
        return value.toLocaleString()
      }
      // Format decimals to reasonable precision
      if (!Number.isInteger(value)) {
        return value.toFixed(2)
      }
      return String(value)
    }
    
    if (value instanceof Date) {
      return value.toLocaleDateString()
    }
    
    if (Array.isArray(value)) {
      // For arrays in cells, show a summary
      if (value.length === 0) return '[]'
      if (value.length <= 3) {
        return value.map(v => this.formatCellValue(v)).join(', ')
      }
      return `[${value.length} items]`
    }
    
    if (typeof value === 'object') {
      // For objects in cells, show a summary
      const keys = Object.keys(value)
      if (keys.length === 0) return '{}'
      if (keys.length <= 2) {
        return keys.map(k => `${k}: ${this.formatCellValue(value[k])}`).join(', ')
      }
      return `{${keys.length} properties}`
    }
    
    // For strings, trim if too long
    const str = String(value)
    if (str.length > 100) {
      return str.substring(0, 97) + '...'
    }
    return str
  }

  public addData(data: any, startOnNewPage: boolean = false): void {
    const formatted = this.formatData(data)

    // Start on new page if requested or if we're too close to bottom for a table
    if (startOnNewPage) {
      if (this.currentY > this.options.margins.top) { // Only add page if we've already added content
        this.pdf.addPage()
        this.currentY = this.options.margins.top
      }
    }

    this.pdf.setFontSize(this.options.fontSize.body)
    this.pdf.setTextColor(this.options.colors.text)

    if (typeof formatted === 'string') {
      const lines = this.pdf.splitTextToSize(
        formatted,
        this.pdf.internal.pageSize.width - this.options.margins.left - this.options.margins.right
      )
      
      lines.forEach((line: string) => {
        if (this.currentY > this.pdf.internal.pageSize.height - this.options.margins.bottom - 20) {
          this.pdf.addPage()
          this.currentY = this.options.margins.top
        }
        this.pdf.text(line, this.options.margins.left, this.currentY)
        this.currentY += 6
      })
    } else {
      // Convert hex color to RGB for jsPDF autoTable - use the provided color or default
      let headerColor: [number, number, number];
      
      // Check if color is already in RGB array format
      if (Array.isArray(this.options.colors.primary)) {
        headerColor = this.options.colors.primary as [number, number, number]
      } else {
        headerColor = this.hexToRGB(this.options.colors.primary)
      }
      
      autoTable(this.pdf, {
        head: [formatted.headers],
        body: formatted.rows,
        startY: this.currentY,
        margin: {
          left: this.options.margins.left,
          right: this.options.margins.right,
        },
        styles: {
          fontSize: this.options.fontSize.body,
          textColor: [0, 0, 0], // Black text
          cellPadding: 3,
        },
        headStyles: {
          fillColor: headerColor,
          textColor: [255, 255, 255], // White text
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [243, 244, 246], // Light gray
        },
        didDrawPage: (data) => {
          this.currentY = data.cursor?.y ?? this.currentY
        },
      })
    }
  }

  private hexToRGB(hex: string): [number, number, number] {
    // Remove # if present
    hex = hex.replace('#', '')
    
    // Handle 3-digit hex codes
    if (hex.length === 3) {
      hex = hex.split('').map(char => char + char).join('')
    }
    
    // Parse hex values
    const r = parseInt(hex.substring(0, 2), 16) || 0
    const g = parseInt(hex.substring(2, 4), 16) || 0
    const b = parseInt(hex.substring(4, 6), 16) || 0
    
    return [r, g, b]
  }

  public addPageBreak(): void {
    this.pdf.addPage()
    this.currentY = this.options.margins.top
  }

  public addText(text: string, options?: {
    fontSize?: number
    color?: string
    bold?: boolean
    spacingBefore?: number
    spacingAfter?: number
    lineHeight?: number
  }): void {
    const fontSize = options?.fontSize ?? this.options.fontSize.body
    // Calculate line height based on font size (default 1.4x font size in mm)
    const lineHeight = options?.lineHeight ?? (fontSize * 0.4)
    const spacingBefore = options?.spacingBefore ?? 0
    const spacingAfter = options?.spacingAfter ?? 2

    this.pdf.setFontSize(fontSize)

    if (options?.color) {
      this.pdf.setTextColor(options.color)
    } else {
      this.pdf.setTextColor(this.options.colors.text)
    }

    if (options?.bold) {
      this.pdf.setFont(undefined, 'bold')
    } else {
      this.pdf.setFont(undefined, 'normal')
    }

    // Add spacing before
    this.currentY += spacingBefore

    const lines = this.pdf.splitTextToSize(
      text,
      this.pdf.internal.pageSize.width - this.options.margins.left - this.options.margins.right
    )

    lines.forEach((line: string) => {
      if (this.currentY > this.pdf.internal.pageSize.height - this.options.margins.bottom - 15) {
        this.pdf.addPage()
        this.currentY = this.options.margins.top
      }
      this.pdf.text(line, this.options.margins.left, this.currentY)
      this.currentY += lineHeight
    })

    // Add spacing after
    this.currentY += spacingAfter
  }

  public async addHTML(element: HTMLElement | string): Promise<void> {
    let targetElement: HTMLElement

    if (typeof element === 'string') {
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = element
      tempDiv.style.position = 'absolute'
      tempDiv.style.left = '-9999px'
      tempDiv.style.background = 'white'
      tempDiv.style.padding = '20px'
      document.body.appendChild(tempDiv)
      targetElement = tempDiv
    } else {
      targetElement = element
    }

    try {
      const canvas = await html2canvas(targetElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      })

      const imgWidth = this.pdf.internal.pageSize.width - this.options.margins.left - this.options.margins.right
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      if (this.currentY + imgHeight > this.pdf.internal.pageSize.height - this.options.margins.bottom) {
        this.pdf.addPage()
        this.currentY = this.options.margins.top
      }

      this.pdf.addImage(
        canvas.toDataURL('image/png'),
        'PNG',
        this.options.margins.left,
        this.currentY,
        imgWidth,
        imgHeight
      )

      this.currentY += imgHeight + 10
    } finally {
      if (typeof element === 'string') {
        const parent = targetElement.parentNode
        if (parent) {
          parent.removeChild(targetElement)
        }
      }
    }
  }

  public save(): Blob | void {
    this.addFooter()

    if (this.options.returnBlob || !this.options.autoDownload) {
      return this.pdf.output('blob')
    }

    if (this.options.autoDownload) {
      this.pdf.save(this.options.filename)
    }
  }

  public getBase64(): string {
    this.addFooter()
    return this.pdf.output('datauristring')
  }

  public getPDF(): jsPDF {
    return this.pdf
  }

  /**
   * Add visual status indicator
   */
  public addStatusIndicator(
    x: number,
    y: number,
    status: 'success' | 'warning' | 'error' | 'info',
    size: number = 3
  ): void {
    const colors = {
      success: [34, 197, 94],    // Green
      warning: [234, 179, 8],     // Yellow
      error: [239, 68, 68],       // Red
      info: [59, 130, 246]        // Blue
    }

    this.pdf.setFillColor(...(colors[status] as [number, number, number]))
    this.pdf.circle(x, y, size, 'F')
  }

  /**
   * Add trend arrow
   */
  public addTrendArrow(
    x: number,
    y: number,
    trend: 'up' | 'down' | 'flat',
    size: number = 5
  ): void {
    const colors = {
      up: [239, 68, 68],      // Red for increase
      down: [34, 197, 94],    // Green for decrease
      flat: [156, 163, 175]   // Gray for flat
    }

    this.pdf.setFillColor(...(colors[trend] as [number, number, number]))
    this.pdf.setDrawColor(...(colors[trend] as [number, number, number]))

    if (trend === 'up') {
      // Draw up arrow (triangle)
      this.pdf.triangle(x, y - size, x - size, y + size, x + size, y + size, 'F')
    } else if (trend === 'down') {
      // Draw down arrow (triangle)
      this.pdf.triangle(x, y + size, x - size, y - size, x + size, y - size, 'F')
    } else {
      // Draw horizontal line for flat
      this.pdf.setLineWidth(2)
      this.pdf.line(x - size, y, x + size, y)
    }
  }

  /**
   * Add bookmark/outline entry
   */
  public addBookmark(title: string, level: number = 0): void {
    // Note: jsPDF doesn't have full bookmark support, but we can track sections
    // This is a placeholder for future enhancement when switching to a library with better support
    const pageNumber = this.pdf.getCurrentPageInfo().pageNumber
    logger.info(`Bookmark: ${title} at page ${pageNumber}, level ${level}`)
  }
}

/**
 * Helper to format large numbers with K/M/B suffixes
 */
export function formatCompactNumber(value: number): string {
  if (Math.abs(value) >= 1e9) {
    return `$${(value / 1e9).toFixed(1)}B`
  } else if (Math.abs(value) >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`
  } else if (Math.abs(value) >= 1e3) {
    return `$${(value / 1e3).toFixed(1)}K`
  }
  return `$${value.toFixed(0)}`
}

export async function exportToPDF(
  data: any,
  options: PDFExportOptions = {}
): Promise<Blob | void> {
  const exporter = new PDFExporter(options)
  
  if (typeof data === 'string' && data.includes('<') && data.includes('>')) {
    await exporter.addHTML(data)
  } else {
    exporter.addData(data)
  }

  return exporter.save()
}

export async function exportMultipleDataToPDF(
  dataItems: Array<{
    data: any
    type?: 'data' | 'html' | 'text'  
    title?: string
    pageBreak?: boolean
  }>,
  options: PDFExportOptions = {}
): Promise<Blob | void> {
  const exporter = new PDFExporter(options)

  for (let i = 0; i < dataItems.length; i++) {
    const item = dataItems[i]
    
    // Add page break BEFORE the entire section (title + data) if requested
    if (item.pageBreak && i > 0) {
      exporter.addPageBreak()
    }

    if (item.title) {
      exporter.addText(item.title, { fontSize: 14, bold: true, color: options.colors?.primary })
    }

    switch (item.type) {
      case 'html':
        await exporter.addHTML(item.data)
        break
      case 'text':
        exporter.addText(item.data)
        break
      case 'data':
      default:
        // Don't add another page break, it was already added above
        exporter.addData(item.data, false)
        break
    }
  }

  return exporter.save()
}

export function createPDFFromJSON(
  jsonData: any,
  options: PDFExportOptions = {}
): Blob | void {
  const defaultOptions: PDFExportOptions = {
    title: 'JSON Data Export',
    subtitle: `Generated on ${new Date().toLocaleDateString()}`,
    ...options,
  }

  return exportToPDF(jsonData, defaultOptions)
}

export async function createPDFFromHTML(
  htmlContent: string | HTMLElement,
  options: PDFExportOptions = {}
): Promise<Blob | void> {
  const defaultOptions: PDFExportOptions = {
    title: 'HTML Export',
    subtitle: `Generated on ${new Date().toLocaleDateString()}`,
    ...options,
  }

  const exporter = new PDFExporter(defaultOptions)
  await exporter.addHTML(htmlContent)
  return exporter.save()
}

export function createPDFFromTable(
  headers: string[],
  rows: any[][],
  options: PDFExportOptions = {}
): Blob | void {
  const defaultOptions: PDFExportOptions = {
    title: 'Table Export',
    subtitle: `Generated on ${new Date().toLocaleDateString()}`,
    ...options,
  }

  const exporter = new PDFExporter(defaultOptions)
  exporter.addData({ headers, rows })
  return exporter.save()
}

// =============================================================================
// Chat PDF Export
// =============================================================================

export interface ChatPDFExportOptions extends PDFExportOptions {
  includeMetadata?: boolean
  includeTimestamps?: boolean
  isSummary?: boolean
  /** Format as a clean deliverable document without conversation markers */
  isDeliverable?: boolean
}

/**
 * Sanitize text for PDF output
 * - Removes emojis (jsPDF doesn't support them)
 * - Strips markdown formatting
 * - Cleans up HTML tags
 */
function sanitizeTextForPDF(text: string): string {
  return text
    // Remove emojis and other Unicode symbols that jsPDF can't render
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Emojis
    .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Variation selectors
    .replace(/[\u{1F000}-\u{1F02F}]/gu, '') // Mahjong/domino tiles
    .replace(/[\u{1F0A0}-\u{1F0FF}]/gu, '') // Playing cards
    // Remove bold/italic markdown
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove inline code backticks
    .replace(/`([^`]+)`/g, '$1')
    // Remove HTML tags
    .replace(/<details[^>]*>/gi, '')
    .replace(/<\/details>/gi, '')
    .replace(/<summary[^>]*>/gi, '')
    .replace(/<\/summary>/gi, '')
    .replace(/<[^>]+>/g, '')
    // Clean up multiple spaces/newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Clean message content for export
 * - Removes GHOST-specific footer content
 * - Strips suggested links references
 * - Removes tool/account metadata mentions
 */
function cleanMessageContentForExport(content: string): string {
  return content
    // Remove "View detailed ... in GHOST" footer lines
    .replace(/View detailed[^\n]*in GHOST[^\n]*/gi, '')
    .replace(/View[^\n]*in GHOST[^\n]*/gi, '')
    // Remove link icons and GHOST references
    .replace(/🔗[^\n]*/g, '')
    .replace(/👉[^\n]*/g, '')
    // Remove "Related Pages" sections at the end
    .replace(/Related Pages:[\s\S]*$/i, '')
    // Remove standalone GHOST mentions at end
    .replace(/\n*GHOST\s*[!']*\s*$/gi, '')
    // Clean up trailing whitespace and newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Check if a code block is a diagram (mermaid, plantuml, etc.)
 */
function isDiagramCodeBlock(lang: string | undefined): boolean {
  const diagramLanguages = ['mermaid', 'plantuml', 'dot', 'graphviz', 'flowchart', 'sequence', 'gantt']
  return lang ? diagramLanguages.includes(lang.toLowerCase()) : false
}

/**
 * Render markdown tokens to PDF using the exporter
 */
function renderMarkdownTokens(exporter: PDFExporter, tokens: Token[], options: ChatPDFExportOptions): void {
  const isDeliverable = options.isDeliverable ?? false

  // Color scheme - professional blue for deliverable, purple for conversation
  const colors = {
    h1: isDeliverable ? '#1e3a5f' : '#7c3aed',      // Deep blue / Purple
    h2: isDeliverable ? '#2563eb' : '#7c3aed',      // Bright blue / Purple
    h3: isDeliverable ? '#3b82f6' : '#6d28d9',      // Medium blue / Dark purple
    h4: isDeliverable ? '#64748b' : '#8b5cf6',      // Slate / Light purple
    text: '#374151',                                 // Gray-700
    muted: '#6b7280',                                // Gray-500
    accent: isDeliverable ? '#059669' : '#7c3aed',  // Emerald / Purple
  }

  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const headingToken = token as Tokens.Heading
        // Compact font sizes for headers
        const fontSizes: Record<number, number> = { 1: 14, 2: 12, 3: 11, 4: 10, 5: 10, 6: 9 }
        const spacingBefore: Record<number, number> = { 1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 6: 2 }
        const headerColors: Record<number, string> = {
          1: colors.h1,
          2: colors.h2,
          3: colors.h3,
          4: colors.h4,
          5: colors.h4,
          6: colors.h4
        }

        exporter.addText(sanitizeTextForPDF(headingToken.text), {
          fontSize: fontSizes[headingToken.depth] || 10,
          bold: true,
          color: headerColors[headingToken.depth] || colors.h3,
          spacingBefore: spacingBefore[headingToken.depth] || 3,
          spacingAfter: 2
        })
        break
      }

      case 'paragraph': {
        const paraToken = token as Tokens.Paragraph
        const cleanText = sanitizeTextForPDF(paraToken.text)
        if (cleanText) {
          exporter.addText(cleanText, {
            fontSize: 9,
            color: colors.text,
            spacingAfter: 2
          })
        }
        break
      }

      case 'list': {
        const listToken = token as Tokens.List
        for (let i = 0; i < listToken.items.length; i++) {
          const item = listToken.items[i]
          const prefix = listToken.ordered ? `${i + 1}. ` : '• '
          const itemText = sanitizeTextForPDF(item.text)
          if (itemText) {
            exporter.addText(`${prefix}${itemText}`, {
              fontSize: 9,
              color: colors.text,
              spacingAfter: 1
            })
          }
        }
        break
      }

      case 'table': {
        const tableToken = token as Tokens.Table
        const headers = tableToken.header.map(h => sanitizeTextForPDF(h.text))
        const rows = tableToken.rows.map(row => row.map(cell => sanitizeTextForPDF(cell.text)))
        exporter.addData({ headers, rows })
        break
      }

      case 'code': {
        const codeToken = token as Tokens.Code

        // Skip diagram code blocks (mermaid, plantuml, etc.) - they can't be rendered as text
        if (isDiagramCodeBlock(codeToken.lang)) {
          // Don't show placeholder in deliverable mode
          if (!isDeliverable) {
            exporter.addText('[Diagram - see interactive version]', {
              fontSize: 8,
              color: '#9ca3af',
              spacingAfter: 2
            })
          }
          break
        }

        // Regular code blocks - more compact
        if (codeToken.lang) {
          exporter.addText(`Code (${codeToken.lang}):`, {
            fontSize: 8,
            bold: true,
            color: '#64748b',
            spacingBefore: 2,
            spacingAfter: 1
          })
        }
        exporter.addText(codeToken.text, {
          fontSize: 8,
          color: '#374151',
          spacingAfter: 2
        })
        break
      }

      case 'blockquote': {
        const quoteToken = token as Tokens.Blockquote
        const quoteText = sanitizeTextForPDF(quoteToken.text)
        if (quoteText) {
          exporter.addText(`"${quoteText}"`, {
            fontSize: 9,
            color: '#64748b',
            spacingBefore: 2,
            spacingAfter: 2
          })
        }
        break
      }

      case 'html': {
        // Handle HTML blocks - extract text content or skip
        const htmlToken = token as Tokens.HTML
        // Skip common HTML tags that don't have meaningful text
        if (htmlToken.raw.match(/^<(details|summary|\/details|\/summary|br|hr)/i)) {
          break
        }
        // Try to extract text from other HTML
        const textContent = htmlToken.raw.replace(/<[^>]+>/g, '').trim()
        if (textContent) {
          exporter.addText(sanitizeTextForPDF(textContent), { fontSize: 9 })
        }
        break
      }

      case 'hr':
        // Add a subtle visual separator
        exporter.addText('', { spacingBefore: 2, spacingAfter: 2 })
        break

      case 'space':
        // Skip empty space tokens
        break

      default:
        // For any unhandled token types, try to render raw text
        if ('text' in token && typeof (token as any).text === 'string') {
          const text = sanitizeTextForPDF((token as any).text)
          if (text) {
            exporter.addText(text, { fontSize: 9 })
          }
        }
        break
    }
  }
}

/**
 * Format a timestamp for display in PDF
 */
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Export chat messages to PDF format
 * Handles markdown parsing and renders messages with proper styling
 */
export function exportChatToPDF(
  messages: ChatMessage[],
  options: ChatPDFExportOptions = {}
): Blob | void {
  const {
    title = 'GHOST Chat Export',
    subtitle,
    includeMetadata = true,
    includeTimestamps = true,
    isSummary = false,
    isDeliverable = false,
    ...pdfOptions
  } = options

  // Build subtitle with message count and date
  const messageCount = messages.length
  const exportDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })

  // Deliverable mode: clean professional subtitle
  let defaultSubtitle: string
  if (isDeliverable) {
    defaultSubtitle = subtitle || exportDate
  } else if (isSummary) {
    defaultSubtitle = `Summary generated on ${exportDate}`
  } else {
    defaultSubtitle = subtitle || `${messageCount} message${messageCount !== 1 ? 's' : ''} | Exported ${exportDate}`
  }

  const exporter = new PDFExporter({
    title,
    subtitle: defaultSubtitle,
    footer: isDeliverable ? `Page {page}` : 'GHOST Chat | Page {page}',
    colors: {
      primary: isDeliverable ? '#1e3a5f' : '#7c3aed', // Deep blue for deliverable, purple for conversation
      secondary: isDeliverable ? '#2563eb' : '#64748b', // Bright blue for deliverable
      text: '#374151'
    },
    ...pdfOptions
  })

  // Deliverable mode: format as a clean document
  if (isDeliverable) {
    renderDeliverableFormat(exporter, messages, options)
  } else {
    // Conversation mode: show Q&A format
    renderConversationFormat(exporter, messages, { ...options, includeMetadata, includeTimestamps })
  }

  return exporter.save()
}

/**
 * Render messages in deliverable format (clean document without conversation markers)
 */
function renderDeliverableFormat(
  exporter: PDFExporter,
  messages: ChatMessage[],
  options: ChatPDFExportOptions
): void {
  // Group user questions with their responses for better context
  let sectionNumber = 0

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    const isUser = message.role === 'user'

    if (isUser) {
      // Check if there's a following assistant response
      const hasResponse = i + 1 < messages.length && messages[i + 1].role === 'assistant'

      if (hasResponse) {
        // Use user message as a section context/header if it's a question
        sectionNumber++
        if (sectionNumber > 1) {
          // Add visual separator between sections
          exporter.addText('', { fontSize: 6 })
          exporter.addText('─'.repeat(50), { fontSize: 8, color: '#e5e7eb' })
          exporter.addText('', { fontSize: 6 })
        }
      }
      // Skip user messages in output (they're just context)
      continue
    }

    // Assistant message - render as document content
    const cleanedContent = cleanMessageContentForExport(message.content)
    try {
      const tokens = marked.lexer(cleanedContent)
      renderMarkdownTokens(exporter, tokens, options)
    } catch {
      exporter.addText(cleanedContent)
    }

    // Add spacing after each response section
    exporter.addText('', { fontSize: 4 })
  }
}

/**
 * Render messages in conversation format (Q&A with role labels)
 */
function renderConversationFormat(
  exporter: PDFExporter,
  messages: ChatMessage[],
  options: ChatPDFExportOptions & { includeMetadata: boolean; includeTimestamps: boolean }
): void {
  const { includeMetadata, includeTimestamps } = options

  // User message styling colors
  const userColor = '#1e40af' // Blue for user
  const assistantColor = '#7c3aed' // Purple for assistant

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]
    const isUser = message.role === 'user'

    // Add separator between messages (except first)
    if (i > 0) {
      exporter.addText('', { fontSize: 4 }) // Small spacer
    }

    // Message header: Role and timestamp
    const roleLabel = isUser ? 'YOU' : 'GHOST ASSISTANT'
    const headerColor = isUser ? userColor : assistantColor

    if (includeTimestamps && message.timestamp) {
      exporter.addText(`${roleLabel}  •  ${formatTimestamp(message.timestamp)}`, {
        fontSize: 10,
        bold: true,
        color: headerColor
      })
    } else {
      exporter.addText(roleLabel, {
        fontSize: 10,
        bold: true,
        color: headerColor
      })
    }

    // Message content - clean GHOST-specific footer content
    const cleanedContent = cleanMessageContentForExport(message.content)

    if (isUser) {
      // User messages are typically plain text
      exporter.addText(cleanedContent, { color: '#374151' })
    } else {
      // Assistant messages may contain markdown - parse and render
      try {
        const tokens = marked.lexer(cleanedContent)
        renderMarkdownTokens(exporter, tokens, options)
      } catch {
        // Fallback to plain text if markdown parsing fails
        exporter.addText(cleanedContent)
      }
    }

    // Note: Metadata and suggested links are intentionally excluded from exports
    // to keep the document clean and focused on content
  }
}