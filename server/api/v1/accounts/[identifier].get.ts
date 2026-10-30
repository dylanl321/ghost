import legacyHandler from '../../accounts/[identifier].get'
import { defineV1Alias } from '../../../utils/v1-route'

export default defineV1Alias(
  '/api/v1/accounts/{identifier}',
  'accounts:read',
  'Get an AWS account',
  legacyHandler,
  [],
  false,
  {
    sourcePath: '/api/accounts/[identifier]',
    description: 'Look up one account by commercial or GovCloud account ID, root email, or numeric request ID. Returns 404 when nothing matches.'
  }
)
