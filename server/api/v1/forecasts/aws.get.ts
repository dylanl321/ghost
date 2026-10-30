import legacyHandler from '../../costs/forecast.get'
import { defineV1Alias } from '../../../utils/v1-route'

export default defineV1Alias('/api/v1/forecasts/aws', 'forecast:read', 'Get AWS Cost Explorer forecast', legacyHandler, [], true, {
  sourcePath: '/api/costs/forecast',
  description: 'AWS Cost Explorer spend forecast starting next month (or the rest of this month) for the selected accounts, or the whole organization when no selector is given. Forecasts use commercial billing account IDs; selected accounts without one are listed in metadata.errors.'
})
