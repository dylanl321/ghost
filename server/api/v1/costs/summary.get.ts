import legacyHandler from '../../costs/summary.get'
import { defineV1Alias } from '../../../utils/v1-route'

export default defineV1Alias('/api/v1/costs/summary', 'costs:read', 'Get AWS cost summary', legacyHandler, [], true)
