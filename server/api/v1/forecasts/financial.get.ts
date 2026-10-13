import legacyHandler from '../../forecast/data.get'
import { defineV1Alias } from '../../../utils/v1-route'

export default defineV1Alias('/api/v1/forecasts/financial', 'forecast:read', 'Get GHOST financial forecasts', legacyHandler, [], true)
