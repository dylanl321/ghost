import legacyHandler from '../../accounts/[identifier].get'
import { defineV1Alias } from '../../../utils/v1-route'

export default defineV1Alias(
  '/api/v1/accounts/{identifier}',
  'accounts:read',
  'Get an AWS account',
  legacyHandler,
  [{ name: 'identifier', in: 'path', required: true, schema: { type: 'string' } }]
)
