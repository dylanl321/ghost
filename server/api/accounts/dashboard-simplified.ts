import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { organizationCache, CacheTags } from '../../utils/cache-manager'
import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import type { GetCostAndUsageCommandInput, GetCostAndUsageCommandOutput } from "@aws-sdk/client-cost-explorer";
import getMasterAccountCredentials from '~~/server/utils/credentials/awsAccountCredentials';

const region = 'us-east-1'
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

async function fetchCostData(client: CostExplorerClient, params: GetCostAndUsageCommandInput) {
  const command = new GetCostAndUsageCommand(params);
  return client.send(command);
}

function sumResults(response: GetCostAndUsageCommandOutput) {
  if (!response.ResultsByTime) return 0;
  return response.ResultsByTime.reduce((sum, r) => {
    const cost = parseFloat(r.Total?.BlendedCost.Amount || "0");
    return sum + cost;
  }, 0);
}

function mapDaily(response: GetCostAndUsageCommandOutput) {
  if (!response.ResultsByTime) return [];
  return response.ResultsByTime.map((r) => ({
    date: r.TimePeriod?.Start,
    cost: parseFloat(r.Total?.BlendedCost.Amount || "0"),
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

async function getOverview(accountId: string) {
  const now = new Date();
  const today = now.getDate(); // 1-index
  const year = now.getFullYear();
  const month = now.getMonth(); // 1–12
  const startOfMonth = buildPaddedDate(year, month, 1);
  const tomorrow = buildPaddedDate(year, month, today + 1); // exclusive end

  // Past 14 days (not including today)
  const dailyEnd = buildPaddedDate(year, month, today) // exclusive

  const tempStart = new Date(now);
  tempStart.setDate(tempStart.getDate() - 14); // Go back 14 days to get the start date
  const dailyStart = buildPaddedDate(tempStart.getFullYear(), tempStart.getMonth(), tempStart.getDate());

  // ---- BILLABLE (master account) ----
  const masterCreds = getMasterAccountCredentials('commercial')
  const billableClient = new CostExplorerClient({ credentials: masterCreds, region });

  // ---- PROFORMA (monitoring account) ----
  const monitoringCreds = await assumeChildAccountRole('commercial', monitoringAccountId);
  const proformaClient = new CostExplorerClient({ credentials: monitoringCreds, region });

  const [billableMtd, billableLast14Days, proformaMtd, proformaLast14Days] = await Promise.all([
    fetchCostData(billableClient, {
      TimePeriod: { Start: startOfMonth, End: tomorrow },
      Granularity: "MONTHLY",
      Metrics: ["BlendedCost"],
      Filter: {
        Dimensions: {
          Key: "LINKED_ACCOUNT",
          Values: [accountId],
        },
      },
    }),
    fetchCostData(billableClient, {
      TimePeriod: { Start: dailyStart, End: dailyEnd },
      Granularity: "DAILY",
      Metrics: ["BlendedCost"],
      Filter: {
        Dimensions: {
          Key: "LINKED_ACCOUNT",
          Values: [accountId],
        },
      },
    }),
    fetchCostData(proformaClient, {
      TimePeriod: { Start: startOfMonth, End: tomorrow },
      Granularity: "MONTHLY",
      Metrics: ["BlendedCost"],
      Filter: {
        Dimensions: {
          Key: "LINKED_ACCOUNT",
          Values: [accountId],
        },
      },
    }),
    fetchCostData(proformaClient, {
      TimePeriod: { Start: dailyStart, End: dailyEnd },
      Granularity: "DAILY",
      Metrics: ["BlendedCost"],
      Filter: {
        Dimensions: {
          Key: "LINKED_ACCOUNT",
          Values: [accountId],
        },
      },
    }),
  ]);

  return {
    billableMonthToDateTotal: sumResults(billableMtd),
    proformaMonthToDateTotal: sumResults(proformaMtd),
    billableLast14Days: mapDaily(billableLast14Days),
    proformaLast14Days: mapDaily(proformaLast14Days),
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

  // Generate cache key
  const cacheKey = `accounts:simplified-overview${accountId}`

  const info = await organizationCache.getOrSet(
    cacheKey,
    async () => {
      console.log(`Cache miss: Fetching organization overview...`)
      return await getOverview(accountId)
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