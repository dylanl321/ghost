import { scanItems } from './dynamodb'

/** Uploaded Finance forecasts (Settings > Forecast upload) live in GovCloud. */
export const FORECAST_TABLE = 'ghost-dashboard-forecast-data'
export const FORECAST_ENVIRONMENT = 'govcloud' as const

/** Attributes that identify a record and its index entries; never client-editable. */
export const FORECAST_KEY_ATTRIBUTES = new Set(['id', 'PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK', 'createdAt'])

/**
 * Find a forecast record by its id. Records are keyed by account (PK) and upload
 * time (SK), so this scans. DynamoDB applies Limit before the filter, so the scan
 * must page through the table rather than read a single item.
 */
export async function findForecastItemById(id: string): Promise<Record<string, any> | undefined> {
  let nextToken: string | undefined
  do {
    const page = await scanItems(
      FORECAST_TABLE,
      '#id = :id',
      undefined,
      nextToken,
      FORECAST_ENVIRONMENT,
      { '#id': 'id' },
      { ':id': id }
    )
    if (page.items.length) return page.items[0]
    nextToken = page.nextToken
  } while (nextToken)
  return undefined
}
