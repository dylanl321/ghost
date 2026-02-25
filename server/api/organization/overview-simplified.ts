import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { organizationCache, CacheTags } from '../../utils/cache-manager'
import getMasterAccountCredentials, { assumeChildAccountRole } from '~~/server/utils/credentials/awsAccountCredentials'
import { getCostForecast } from '../../utils/cost-explorer'
import { getQuery } from 'h3'
import type { GetCostAndUsageCommandInput, GetCostAndUsageCommandOutput } from "@aws-sdk/client-cost-explorer";
import { CostExplorerClient,GetCostAndUsageCommand
} from "@aws-sdk/client-cost-explorer";
import { OrganizationsClient, ListAccountsCommand } from "@aws-sdk/client-organizations";
import { scanItems } from '../../utils/dynamodb'
import { getAccountsTableName } from '../../utils/accounts-consolidated'
import { logger } from '../../utils/logger'

const region = 'us-east-1'

type DailyCost = {
  date: string; // format: "YYYY-MM-DD"
  cost: number;
};

// Register OpenAPI documentation
registerEndpoint('/api/organization/overview-simplified', 'GET', {
  summary: 'Get simplified organization overview',
  description: 'Data to populate the GHOST home page. Month-to-date totals include full month Savings Plan commitments. Forecast uses AWS Cost Explorer ML models matching Console behavior.',
  tags: ['Dashboard'],
  parameters: [
    {
      name: 'proforma',
      in: 'query',
      required: false,
      schema: {
        type: 'boolean',
        default: false
      },
      description: 'Use proforma account for top accounts data (excludes master account overhead)'
    }
  ],
  responses: {
    200: {
      description: 'Organizational info',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  activeAccounts: { type: 'integer' },
                  suspendedAccounts: { type: 'integer' },
                  monthToDateTotal: { type: 'number' },
                  forecastedTotal: { type: 'number' },
                  previousMonthTotal: { type: 'number' },
                  previousMonthToDateTotal: { type: 'number' },
                  topAccounts: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        accountId: { type: 'string' },
                        cost: { type: 'number' },
                      }
                    }
                  },
                  allAccountCosts: {
                    type: 'object',
                    additionalProperties: { type: 'number' },
                    description: 'Map of all account IDs to their MTD costs'
                  },
                  rolling14Daily: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        date: { type: 'string' },
                        cost: { type: 'number' },
                      }
                    }
                  },
                  budgetHealth: {
                    type: 'object',
                    properties: {
                      totalBudget: { type: 'number', description: 'Sum of all account budgets' },
                      accountsOverBudget: { type: 'integer', description: 'Number of accounts exceeding their budget' },
                      actualDailyBurnRate: { type: 'number', description: 'Actual daily spending (excluding day 1 savings plans)' },
                      expectedDailyBudgetRate: { type: 'number', description: 'Expected daily budget rate' },
                      burnRateVsBudget: { type: 'number', description: 'Percentage variance: positive = over budget, negative = under' },
                      projectedMonthlySpend: { type: 'number', description: 'Projected month-end spending' },
                      accountsWithBudget: { type: 'integer', description: 'Number of accounts with budgets set' }
                    }
                  }
                }
              },
            }
          }
        }
      }
    },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

async function getAccountCounts() {
  const creds = getMasterAccountCredentials('commercial');
  const orgClient = new OrganizationsClient({ credentials: creds, region });

  let accounts: any = [];
  let nextToken = undefined;

  do {
    const response: any = await orgClient.send(new ListAccountsCommand({ NextToken: nextToken }));
    accounts = accounts.concat(response.Accounts || []);
    nextToken = response.NextToken;
  } while (nextToken);

  const activeCount = accounts.filter((acc: any) => acc.Status === "ACTIVE").length;
  const suspendedCount = accounts.filter((acc: any) => acc.Status === "SUSPENDED").length;

  return { activeCount, suspendedCount, activeAccountIds: accounts.filter((acc: any) => acc.Status === "ACTIVE").map((acc: any) => acc.Id) };
}

// Calculate budget health metrics
// Accounts for savings plans being pre-allocated on day 1 by using daily burn rate (excluding day 1)
async function getBudgetHealth(costClient: CostExplorerClient, startOfMonth: string, endOfMonth: string, activeAccountIds: string[]) {
  try {
    // Get account metadata from DynamoDB
    const tableName = await getAccountsTableName();
    const scanResult = await scanItems(tableName, undefined, undefined, undefined, 'commercial');
    const accountsData = scanResult.items;

    logger.info(`[Budget Health] Scanned ${accountsData.length} accounts from DynamoDB`)

    // Create a map of accountId to budget
    const budgetMap = new Map<string, number>();
    let totalBudget = 0;
    let accountsWithBudget = 0;

    accountsData.forEach((account: any) => {
      const accountId = account.awsStandardAccountID || account.accountId;
      if (accountId && account.estimatedMonthlyCharge) {
        const budgetStr = account.estimatedMonthlyCharge;
        const budget = typeof budgetStr === 'string'
          ? parseFloat(budgetStr.replace(/[^0-9.-]/g, '')) || 0
          : parseFloat(budgetStr) || 0;

        if (budget > 0) {
          budgetMap.set(accountId, budget);
          totalBudget += budget;
          accountsWithBudget++;
        }
      }
    });

    logger.debug(`[Budget Health] Found ${accountsWithBudget} accounts with budgets, total: $${totalBudget.toFixed(2)}`)

    // Get MTD costs by account to count over-budget accounts
    const byAccountResponse = await fetchCostData(costClient, {
      TimePeriod: { Start: startOfMonth, End: endOfMonth },
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
      GroupBy: [{ Type: "DIMENSION", Key: "LINKED_ACCOUNT" }],
    });

    let accountsOverBudget = 0;
    byAccountResponse.ResultsByTime?.[0]?.Groups?.forEach((group: any) => {
      const accountId = group.Keys[0];
      const cost = parseFloat(group.Metrics.UnblendedCost.Amount);
      const budget = budgetMap.get(accountId);
      if (budget && cost > budget) {
        accountsOverBudget++;
      }
    });

    // Get daily costs (excluding day 1 to avoid savings plan pre-allocation)
    const now = new Date();
    const currentDay = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    // Get daily data from day 2 onwards
    const year = now.getFullYear();
    const month = now.getMonth();
    const day2Start = buildPaddedDate(year, month, 2);
    const tomorrow = buildPaddedDate(year, month, currentDay + 1);

    let actualDailyBurnRate = 0;
    let daysExcludingFirst = 0;

    if (currentDay > 1) {
      const dailyResponse = await fetchCostData(costClient, {
        TimePeriod: { Start: day2Start, End: tomorrow },
        Granularity: "DAILY",
        Metrics: ["UnblendedCost"],
      });

      const dailyCosts = dailyResponse.ResultsByTime?.map((r: any) =>
        parseFloat(r.Total.UnblendedCost.Amount)
      ) || [];

      daysExcludingFirst = dailyCosts.length;
      const totalCostExcludingDay1 = dailyCosts.reduce((sum, cost) => sum + cost, 0);
      actualDailyBurnRate = daysExcludingFirst > 0 ? totalCostExcludingDay1 / daysExcludingFirst : 0;
    }

    // Calculate expected daily budget rate
    const expectedDailyBudgetRate = totalBudget / daysInMonth;

    // Calculate if we're over/under budget based on daily burn rate
    const projectedMonthlySpend = actualDailyBurnRate * daysInMonth;
    const burnRateVsBudget = expectedDailyBudgetRate > 0
      ? ((actualDailyBurnRate - expectedDailyBudgetRate) / expectedDailyBudgetRate) * 100
      : 0;

    logger.info(`[Budget Health] Daily burn rate: $${actualDailyBurnRate.toFixed(2)}/day (${daysExcludingFirst} days), Budget rate: $${expectedDailyBudgetRate.toFixed(2)}/day, Variance: ${burnRateVsBudget.toFixed(1)}%`)

    return {
      totalBudget,
      accountsOverBudget,
      actualDailyBurnRate,
      expectedDailyBudgetRate,
      burnRateVsBudget, // Positive means over budget, negative means under
      projectedMonthlySpend,
      accountsWithBudget,
    };
  } catch (error: any) {
    logger.error('Error calculating budget health:', {
      message: error.message,
      name: error.name,
      code: error.code,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    });
    return {
      totalBudget: 0,
      accountsOverBudget: 0,
      actualDailyBurnRate: 0,
      expectedDailyBudgetRate: 0,
      burnRateVsBudget: 0,
      projectedMonthlySpend: 0,
      accountsWithBudget: 0,
    };
  }
}

async function fetchCostData(client: CostExplorerClient, params: GetCostAndUsageCommandInput): Promise<GetCostAndUsageCommandOutput> {
  try {
    const command = new GetCostAndUsageCommand(params);
    return await client.send(command);
  } catch (error: any) {
    logger.error('Cost Explorer API error:', {
      message: error.message,
      code: error.name,
      statusCode: error.$metadata?.httpStatusCode,
      requestId: error.$metadata?.requestId,
      params: {
        timePeriod: params.TimePeriod,
        granularity: params.Granularity,
        groupBy: params.GroupBy
      }
    });
    throw error;
  }
}

function dailySeries(results: any) {
  return results.ResultsByTime.map((r: any) => ({
    date: r.TimePeriod.Start,
    cost: parseFloat(r.Total.UnblendedCost.Amount),
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

async function getOverview(useProforma: boolean = false) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-index
  const today = now.getDate(); // 1-index

  const proformaAccountId = process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'

  const startOfMonth = buildPaddedDate(year, month, 1);
  const tomorrow = buildPaddedDate(year, month, today + 1); // exclusive - for actual daily costs
  const endOfMonth = buildPaddedDate(year, month + 1, 1); // exclusive - captures full month including pre-allocated Savings Plan charges

  // Forecast date range (AWS forecast requires start >= today)
  const forecastStart = buildPaddedDate(year, month, today);
  const forecastEnd = endOfMonth; // Forecast to end of current month

  // Previous month
  const startOfPrevMonth = new Date(year, month - 1, 1);
  const prevYear = startOfPrevMonth.getFullYear();
  const prevMonthNum = startOfPrevMonth.getMonth(); // 0-index
  const prevMonthDays = new Date(prevYear, prevMonthNum + 1, 0).getDate(); // Date with '0' as day will go to the last day of previous month

  const prevStart = buildPaddedDate(prevYear, prevMonthNum, 1);
  const prevMTDEnd = buildPaddedDate(prevYear, prevMonthNum, Math.min(today, prevMonthDays) + 1); // Handle edge case where we are on 30th day of current month, but <30 days in previous month

  // Past 14 days (not including today)
  const dailyEnd = buildPaddedDate(year, month, today) // exclusive

  const tempStart = new Date(now);
  tempStart.setDate(tempStart.getDate() - 14); // Go back 14 days to get the start date
  const dailyStart = buildPaddedDate(tempStart.getFullYear(), tempStart.getMonth(), tempStart.getDate());

  logger.info(`Running queries with values: startOfMonth=${startOfMonth},
    tomorrow=${tomorrow}, endOfMonth=${endOfMonth}, forecastStart=${forecastStart}, forecastEnd=${forecastEnd},
    prevStart=${prevStart}, prevMTDEnd=${prevMTDEnd}, dailyEnd=${dailyEnd}, dailyStart=${dailyStart}, `)

  // ----- Queries -----

  const creds = getMasterAccountCredentials('commercial');
  const costClient = new CostExplorerClient({ region, credentials: creds });

  const [
    rolling14DailyResponse,
    mtdDailyResponse,
    mtdMonthly,
    prevMonthly,
    prevMtd,
    forecastResponse,
    accountCounts,
    budgetHealth
  ] = await Promise.all([
    fetchCostData(costClient, {
      TimePeriod: { Start: dailyStart, End: dailyEnd },
      Granularity: "DAILY",
      Metrics: ["UnblendedCost"],
    }),
    fetchCostData(costClient, {
      TimePeriod: { Start: startOfMonth, End: tomorrow },
      Granularity: "DAILY",
      Metrics: ["UnblendedCost"],
    }),
    fetchCostData(costClient, {
      TimePeriod: { Start: startOfMonth, End: endOfMonth },
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
    }),
    fetchCostData(costClient, {
      TimePeriod: { Start: prevStart, End: startOfMonth },
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
    }),
    fetchCostData(costClient, {
      TimePeriod: { Start: prevStart, End: prevMTDEnd },
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
    }),
    getCostForecast(forecastStart, forecastEnd, "UNBLENDED_COST", "MONTHLY", undefined, "commercial"),
    getAccountCounts(),
    getBudgetHealth(costClient, startOfMonth, endOfMonth, []),
  ]);

  // Query for top accounts - use proforma or master account based on parameter
  let byAccountMonthly
  if (useProforma) {
    logger.info(`Querying proforma account (${proformaAccountId}) for top accounts`)
    const proformaCreds = await assumeChildAccountRole('commercial', proformaAccountId)
    const proformaClient = new CostExplorerClient({ region, credentials: proformaCreds })
    byAccountMonthly = await fetchCostData(proformaClient, {
      TimePeriod: { Start: startOfMonth, End: endOfMonth },
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
      GroupBy: [{ Type: "DIMENSION", Key: "LINKED_ACCOUNT" }],
    })
  } else {
    logger.info(`Querying master account for top accounts`)
    byAccountMonthly = await fetchCostData(costClient, {
      TimePeriod: { Start: startOfMonth, End: endOfMonth },
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
      GroupBy: [{ Type: "DIMENSION", Key: "LINKED_ACCOUNT" }],
    })
  }

  // ----- Transformations -----

  const mtdTotal = parseFloat(mtdMonthly.ResultsByTime?.[0].Total?.UnblendedCost.Amount || "0");

  const rolling14Daily = dailySeries(rolling14DailyResponse)
  const mtdDaily = dailySeries(mtdDailyResponse)

  // Use AWS's native forecast API which uses ML models to predict spending
  // This matches the AWS Console forecast exactly
  const forecast = parseFloat(forecastResponse.total?.Amount || "0")
  logger.info(`AWS Forecast API returned: $${forecast.toFixed(2)} for period ${forecastStart} to ${forecastEnd}`)

  const prevTotal = parseFloat(prevMonthly.ResultsByTime?.[0].Total?.UnblendedCost.Amount || "0");

  const prevMtdTotal = parseFloat(prevMtd.ResultsByTime?.[0].Total?.UnblendedCost.Amount || "0");

  // Build full map of account costs for accurate user cost calculation
  const allAccountCosts: Record<string, number> = {}
  const accountCostsList = byAccountMonthly.ResultsByTime?.[0].Groups?.map((g: any) => {
    const accountId = g.Keys[0]
    const cost = parseFloat(g.Metrics.UnblendedCost.Amount)
    allAccountCosts[accountId] = cost
    return { accountId, cost }
  }) || []

  const topAccounts = accountCostsList
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  return {
    activeAccounts: accountCounts.activeCount,
    suspendedAccounts: accountCounts.suspendedCount,
    monthToDateTotal: mtdTotal,
    forecastedTotal: forecast,
    previousMonthTotal: prevTotal,
    previousMonthToDateTotal: prevMtdTotal,
    topAccounts: topAccounts,
    allAccountCosts,
    rolling14Daily,
    budgetHealth,
  };
}

export default defineEventHandler(handleAsync(async (event) => {
  const startTime = Date.now()

  // Get query parameters
  const query = getQuery(event)
  const useProforma = query.proforma === 'true' || query.proforma === true

  // Generate cache key including proforma flag
  const cacheKey = `organization:simplified-overview:${useProforma ? 'proforma' : 'billable'}`

  const info = await organizationCache.getOrSet(
    cacheKey,
    async () => {
      logger.info(`Cache miss: Fetching organization overview (${useProforma ? 'proforma' : 'billable'})...`)
      return await getOverview(useProforma)
    },
    {
      ttl: 1200, // 20 minutes
      tags: [CacheTags.ORGANIZATION, CacheTags.COSTS]
    }
  )
  
  if (!info) {
    return errors.serverError(event, 'Unable to fetch simplified organization overview')
  }
  
  const metadata = { responseTimeMs: Date.now() - startTime }
  
  return sendSuccess(event, info, metadata)
}))