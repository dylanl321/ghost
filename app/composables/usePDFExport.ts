import type { PDFExportOptions } from '~/utils/pdfExport.client'

const logger = createLogger('PDFExport')

export interface UsePDFExportReturn {
  exportData: (data: any, options?: PDFExportOptions) => Promise<Blob | void>
  exportJSON: (jsonData: any, options?: PDFExportOptions) => Promise<Blob | void>
  exportHTML: (htmlContent: string | HTMLElement, options?: PDFExportOptions) => Promise<Blob | void>
  exportTable: (headers: string[], rows: any[][], options?: PDFExportOptions) => Promise<Blob | void>
  exportMultiple: (dataItems: Array<{
    data: any
    type?: 'data' | 'html' | 'text'
    title?: string
    pageBreak?: boolean
  }>, options?: PDFExportOptions) => Promise<Blob | void>
  exportChartData: (chartData: any, options?: PDFExportOptions) => Promise<Blob | void>
  exportCostData: (costData: any, options?: PDFExportOptions) => Promise<Blob | void>
}

export function usePDFExport(): UsePDFExportReturn {
  const exportData = async (data: any, options?: PDFExportOptions): Promise<Blob | void> => {
    if (!process.client) {
      logger.warn('PDF export is only available on client side')
      return
    }
    
    const { exportToPDF } = await import('~/utils/pdfExport.client')
    return await exportToPDF(data, options)
  }

  const exportJSON = async (jsonData: any, options?: PDFExportOptions): Promise<Blob | void> => {
    if (!process.client) {
      logger.warn('PDF export is only available on client side')
      return
    }
    
    const { createPDFFromJSON } = await import('~/utils/pdfExport.client')
    return createPDFFromJSON(jsonData, options)
  }

  const exportHTML = async (
    htmlContent: string | HTMLElement,
    options?: PDFExportOptions
  ): Promise<Blob | void> => {
    if (!process.client) {
      logger.warn('PDF export is only available on client side')
      return
    }
    
    const { createPDFFromHTML } = await import('~/utils/pdfExport.client')
    return await createPDFFromHTML(htmlContent, options)
  }

  const exportTable = async (
    headers: string[],
    rows: any[][],
    options?: PDFExportOptions
  ): Promise<Blob | void> => {
    if (!process.client) {
      logger.warn('PDF export is only available on client side')
      return
    }
    
    const { createPDFFromTable } = await import('~/utils/pdfExport.client')
    return createPDFFromTable(headers, rows, options)
  }

  const exportMultiple = async (
    dataItems: Array<{
      data: any
      type?: 'data' | 'html' | 'text'
      title?: string
      pageBreak?: boolean
    }>,
    options?: PDFExportOptions
  ): Promise<Blob | void> => {
    if (!process.client) {
      logger.warn('PDF export is only available on client side')
      return
    }
    
    const { exportMultipleDataToPDF } = await import('~/utils/pdfExport.client')
    return await exportMultipleDataToPDF(dataItems, options)
  }

  const exportChartData = async (chartData: any, options?: PDFExportOptions): Promise<Blob | void> => {
    if (!process.client) {
      logger.warn('PDF export is only available on client side')
      return
    }

    const defaultOptions: PDFExportOptions = {
      title: 'Chart Data Export',
      subtitle: `Generated on ${new Date().toLocaleDateString()}`,
      orientation: 'landscape',
      ...options,
    }

    if (chartData.chartElement && chartData.chartElement instanceof HTMLElement) {
      const { PDFExporter } = await import('~/utils/pdfExport.client')
      const exporter = new PDFExporter(defaultOptions)
      
      if (chartData.title) {
        exporter.addText(chartData.title, { fontSize: 16, bold: true })
      }
      
      await exporter.addHTML(chartData.chartElement)
      
      if (chartData.data) {
        exporter.addPageBreak()
        exporter.addText('Raw Data', { fontSize: 14, bold: true })
        exporter.addData(chartData.data)
      }
      
      return exporter.save()
    } else {
      return await exportData(chartData, defaultOptions)
    }
  }

  const exportCostData = async (costData: any, options?: PDFExportOptions): Promise<Blob | void> => {
    if (!process.client) {
      logger.warn('PDF export is only available on client side')
      return
    }

    const defaultOptions: PDFExportOptions = {
      title: 'AWS Cost Report',
      subtitle: `Generated on ${new Date().toLocaleDateString()}`,
      orientation: 'portrait',
      colors: {
        primary: '#ea580c',
        secondary: '#64748b',
        text: '#000000',
      },
      ...options,
    }

    const { PDFExporter } = await import('~/utils/pdfExport.client')
    const exporter = new PDFExporter(defaultOptions)

    if (costData.summary) {
      exporter.addText('Cost Summary', { fontSize: 14, bold: true, color: defaultOptions.colors?.primary })
      exporter.addData(costData.summary)
    }

    if (costData.breakdown) {
      if (costData.summary) exporter.addPageBreak()
      exporter.addText('Cost Breakdown', { fontSize: 14, bold: true, color: defaultOptions.colors?.primary })
      exporter.addData(costData.breakdown)
    }

    if (costData.trends) {
      if (costData.summary || costData.breakdown) exporter.addPageBreak()
      exporter.addText('Cost Trends', { fontSize: 14, bold: true, color: defaultOptions.colors?.primary })
      exporter.addData(costData.trends)
    }

    if (costData.recommendations) {
      if (costData.summary || costData.breakdown || costData.trends) exporter.addPageBreak()
      exporter.addText('Cost Optimization Recommendations', { fontSize: 14, bold: true, color: defaultOptions.colors?.primary })
      
      if (Array.isArray(costData.recommendations)) {
        costData.recommendations.forEach((rec: any, index: number) => {
          exporter.addText(`${index + 1}. ${rec.title || rec.name || 'Recommendation'}`, { fontSize: 12, bold: true })
          if (rec.description) {
            exporter.addText(rec.description)
          }
          if (rec.savings) {
            exporter.addText(`Potential Savings: ${rec.savings}`, { color: '#16a34a' })
          }
        })
      } else {
        exporter.addData(costData.recommendations)
      }
    }

    return exporter.save()
  }

  return {
    exportData,
    exportJSON,
    exportHTML,
    exportTable,
    exportMultiple,
    exportChartData,
    exportCostData,
  }
}