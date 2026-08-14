import assert from 'node:assert/strict'
import test from 'node:test'
import { exportDatasetToPDF } from '../../server/utils/pdf-export-dataset'

test('dataset PDF exporter returns a real PDF document', async () => {
  const buffer = await exportDatasetToPDF({
    metadata: {
      reportId: 'test-report',
      reportName: 'Test Dataset Report',
      generatedAt: '2026-07-28T12:00:00.000Z',
      accounts: []
    },
    config: {
      enabled: true,
      totalResources: 1,
      resourcesByType: { 'AWS::S3::Bucket': 1 },
      complianceSummary: { compliant: 1, nonCompliant: 0, notApplicable: 0, insufficientData: 0 },
      records: [{
        accountId: '123456789012',
        accountName: 'Test',
        region: 'us-east-1',
        resourceType: 'AWS::S3::Bucket',
        resourceId: 'example-bucket',
        configurationItemCaptureTime: '2026-07-28T12:00:00.000Z'
      }]
    }
  }, {
    accounts: [],
    datasets: { config: { enabled: true } },
    format: 'pdf'
  })

  assert.equal(buffer.subarray(0, 4).toString('ascii'), '%PDF')
  assert.ok(buffer.length > 1000)
})
