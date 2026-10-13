import legacyHandler from '../../costs/forecast.get'
import { defineV1Alias } from '../../../utils/v1-route'

export default defineV1Alias('/api/v1/forecasts/aws', 'forecast:read', 'Get AWS Cost Explorer forecast', legacyHandler, [], true)
