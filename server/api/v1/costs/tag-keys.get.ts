import legacyHandler from '../../costs/tags.get'
import { defineV1Alias } from '../../../utils/v1-route'

export default defineV1Alias('/api/v1/costs/tag-keys', 'costs:read', 'Discover cost allocation tags', legacyHandler, [], true, {
  sourcePath: '/api/costs/tags',
  description: 'Discovers cost allocation tag keys for the selected accounts and period. Supply tagKey to list its raw values. Use /api/v1/costs/tags with tagKey to retrieve costs. Cost dates use an inclusive start and exclusive end; defaults to last90days.'
})
