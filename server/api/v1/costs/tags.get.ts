import legacyHandler from '../../costs/tag-coverage.get'
import { defineV1Alias } from '../../../utils/v1-route'

export default defineV1Alias('/api/v1/costs/tags', 'costs:read', 'Get costs by tag value', legacyHandler, [], true, {
  sourcePath: '/api/costs/tag-coverage',
  description: 'Returns the Tag Analysis page data for a required tagKey: UnblendedCost totals by normalized tag value, tagged and untagged coverage, and account contributions. Tag values are included by default. Supports canonical account selectors and optional account-and-month weighted proforma estimates for commercial billing. Cost dates use an inclusive start and exclusive end; defaults to last90days.',
  queryDefaults: { includeValues: true }
})
