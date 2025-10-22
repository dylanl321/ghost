import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'

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
        title: options.fontSize?.title ?? 20,
        subtitle: options.fontSize?.subtitle ?? 14,
        body: options.fontSize?.body ?? 11,
        footer: options.fontSize?.footer ?? 9,
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
          data.headers.map(h => this.formatCellValue(row[h]))
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

  public addText(text: string, options?: { fontSize?: number; color?: string; bold?: boolean }): void {
    if (options?.fontSize) {
      this.pdf.setFontSize(options.fontSize)
    } else {
      this.pdf.setFontSize(this.options.fontSize.body)
    }

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

    const lines = this.pdf.splitTextToSize(
      text,
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

    this.currentY += 4
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
      if (typeof element === 'string' && targetElement.parentNode) {
        targetElement.parentNode.removeChild(targetElement)
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
    console.log(`Bookmark: ${title} at page ${pageNumber}, level ${level}`)
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