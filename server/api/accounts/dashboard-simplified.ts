import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { organizationCache, CacheTags } from '../../utils/cache-manager'
import { getCostAndUsage } from '../../utils/cost-explorer'
import { logger } from '../../utils/logger'

const monitoringAccountId = '253821132832'

// Register OpenAPI documentation
registerEndpoint('/api/accounts/dashboard-simplified', 'GET', {
  summary: 'Get simplified account dashboard',
  description: 'Data to populate GHOST account page for specific account. This includes both "Billable" and "Pro Forma" numbers.',
  tags: ['Accounts'],
  parameters: [
    {
      name: 'standard_account_id',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'Commercial Account ID'
    },
  ],
  responses: {
    200: {
      description: 'Account info',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  billableMonthToDateTotal: { type: 'number' },
                  proformaMonthToDateTotal: { type: 'number' },
                  billableLast14Days: { 
                    type: 'array', 
                    items: { 
                      type: 'object',
                      properties: {
                        date: { type: 'string' },
                        cost: { type: 'number' },
                      }
                    } 
                  },
                  proformaLast14Days: { 
                    type: 'array', 
                    items: { 
                      type: 'object',
                      properties: {
                        date: { type: 'string' },
                        cost: { type: 'number' },
                      }
                    } 
                  },
                }
              }
            }
          }
        }
      }
    },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

function sumResults(resultsByTime: any[]) {
  return resultsByTime.reduce((sum, r) => {
    const cost = parseFloat(r.Total?.BlendedCost?.Amount || "0");
    return sum + cost;
  }, 0);
}

function mapDaily(resultsByTime: any[]) {
  return resultsByTime.map((r) => ({
    date: r.TimePeriod?.Start,
    cost: parseFloat(r.Total?.BlendedCost?.Amount || "0"),
  }));
}

// month as 0–11, day as 1–31
function buildPaddedDate(year: number, month: number, day: number) {
  // JS Date auto-rolls months and days (e.g., month 12 (0-index) → Jan next year)
  const date = new Date(year, month, day);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

const ALLOWED_DAYS = [7, 14, 30, 90] as const

async function getOverview(accountId: string, days: number = 14) {
  const now = new Date();
  const today = now.getDate(); // 1-index
  const year = now.getFullYear();
  const month = now.getMonth(); // 0–11
  const startOfMonth = buildPaddedDate(year, month, 1);
  const tomorrow = buildPaddedDate(year, month, today + 1); // exclusive end

  // Past N days (not including today)
  const dailyEnd = buildPaddedDate(year, month, today) // exclusive

  const tempStart = new Date(now);
  tempStart.setDate(tempStart.getDate() - days); // Go back N days to get the start date
  const dailyStart = buildPaddedDate(tempStart.getFullYear(), tempStart.getMonth(), tempStart.getDate());

  const linkedAccountFilter = {
    Dimensions: {
      Key: "LINKED_ACCOUNT",
      Values: [accountId],
    },
  }

  // Fetch all four cost queries in parallel:
  // Billable = master account (no targetAccountId), Proforma = monitoring account
  const [billableMtd, billableLast14Days, proformaMtd, proformaLast14Days] = await Promise.all([
    getCostAndUsage({
      startDate: startOfMonth,
      endDate: tomorrow,
      granularity: "MONTHLY",
      metrics: ["BlendedCost"],
      filter: linkedAccountFilter,
    }, 'commercial'),
    getCostAndUsage({
      startDate: dailyStart,
      endDate: dailyEnd,
      granularity: "DAILY",
      metrics: ["BlendedCost"],
      filter: linkedAccountFilter,
    }, 'commercial'),
    getCostAndUsage({
      startDate: startOfMonth,
      endDate: tomorrow,
      granularity: "MONTHLY",
      metrics: ["BlendedCost"],
      filter: linkedAccountFilter,
    }, 'commercial', monitoringAccountId),
    getCostAndUsage({
      startDate: dailyStart,
      endDate: dailyEnd,
      granularity: "DAILY",
      metrics: ["BlendedCost"],
      filter: linkedAccountFilter,
    }, 'commercial', monitoringAccountId),
  ]);

  return {
    billableMonthToDateTotal: sumResults(billableMtd.resultsByTime),
    proformaMonthToDateTotal: sumResults(proformaMtd.resultsByTime),
    billableLast14Days: mapDaily(billableLast14Days.resultsByTime),
    proformaLast14Days: mapDaily(proformaLast14Days.resultsByTime),
  };
}

export default defineEventHandler(handleAsync(async (event) => {
  const startTime = Date.now()

  const query = getQuery(event)
  
  const accountId = query.standard_account_id as string
  if (!accountId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'standard_account_id parameter is required'
    })
  }

  const rawDays = parseInt(query.days as string) || 14
  const days = ALLOWED_DAYS.includes(rawDays as any) ? rawDays : 14

  // Generate cache key
  const cacheKey = `accounts:simplified-overview:${accountId}:${days}d`

  const info = await organizationCache.getOrSet(
    cacheKey,
    async () => {
      logger.info(`Cache miss: Fetching organization overview...`)
      return await getOverview(accountId, days)
    },
    {
      ttl: 1200, // 20 minutes
      tags: [CacheTags.ACCOUNTS]
    }
  )
  
  if (!info) {
    return errors.serverError(event, 'Unable to fetch simplified organization overview')
  }
  
  const metadata = { responseTimeMs: Date.now() - startTime }
  
  return sendSuccess(event, info, metadata)
}))