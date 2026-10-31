/**
 * Send a test copy of a scheduled report
 * POST /api/scheduled-reports/:id/test
 * The report pages called this route, but it did not exist, so "Send test"
 * always failed with 404
 */

import { handleReportTestSend } from '../../../utils/report-test-send'

export default defineEventHandler(event => handleReportTestSend(event))
