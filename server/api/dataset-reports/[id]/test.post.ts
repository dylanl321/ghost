/**
 * Send a test dataset report
 * POST /api/dataset-reports/:id/test
 */

import { handleReportTestSend } from '../../../utils/report-test-send'

export default defineEventHandler(event => handleReportTestSend(event, { datasetOnly: true }))
