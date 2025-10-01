import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { organizationCache, CacheTags } from '../../utils/cache-manager'
import getMasterAccountCredentials from '~~/server/utils/credentials/awsAccountCredentials'
import type { GetCostAndUsageCommandInput, GetCostAndUsageCommandOutput } from "@aws-sdk/client-cost-explorer";
import { CostExplorerClient,GetCostAndUsageCommand
} from "@aws-sdk/client-cost-explorer";
import { OrganizationsClient, ListAccountsCommand } from "@aws-sdk/client-organizations";

const region = 'us-east-1'

type DailyCost = {
  date: string; // format: "YYYY-MM-DD"
  cost: number;
};

// Register OpenAPI documentation
registerEndpoint('/api/organization/overview-simplified', 'GET', {
  summary: 'Get simplified organization overview',
  description: 'Data to populate the GHOST home page. These are the "Billable" numbers that you would see in the master account cost explorer.',
  tags: ['Dashboard'],
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
                        // name: { type: 'string' },
                      }
                    } 
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

  return { activeCount, suspendedCount };
}

async function fetchCostData(client: CostExplorerClient, params: GetCostAndUsageCommandInput): Promise<GetCostAndUsageCommandOutput> {
  const command = new GetCostAndUsageCommand(params);
  return client.send(command);
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

function calculateForecast(last14Daily: DailyCost[], mtdDaily: DailyCost[]): number {
  // 1. Cost so far this month = sum of all MTD entries
  const costSoFar = mtdDaily.reduce((sum, d) => sum + d.cost, 0);

  // 2. Average of last 14 days, excluding any 01 days
  const filtered = last14Daily.filter(d => !d.date.endsWith("-01"));
  const avgDaily =
    filtered.reduce((sum, d) => sum + d.cost, 0) / (filtered.length || 1);

  // 3. Forecast = actual MTD + projection for remaining days
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const remainingDays = daysInMonth - today;

  console.log(`Forecast Calculation: MTDcostSoFar + (avgDaily * remainingDays)`)
  console.log(`${costSoFar} + (${avgDaily} * ${remainingDays})`)
  const forecast = costSoFar + (avgDaily * remainingDays);

  return forecast;
}

async function getOverview() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-index
  const today = now.getDate(); // 1-index

  const startOfMonth = buildPaddedDate(year, month, 1);
  const tomorrow = buildPaddedDate(year, month, today + 1); // exclusive

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

  console.log(`Running queries with values: startOfMonth=${startOfMonth}, 
    tomorrow=${tomorrow}, prevStart=${prevStart}, prevMTDEnd=${prevMTDEnd}, dailyEnd=${dailyEnd}, dailyStart=${dailyStart}, `)

  // ----- Queries -----

  const creds = getMasterAccountCredentials('commercial');
  const costClient = new CostExplorerClient({ region, credentials: creds });

  const [
    rolling14DailyResponse,
    mtdDailyResponse,
    mtdMonthly,
    prevMonthly,
    prevMtd,
    byAccountMonthly,
    accountCounts
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
      TimePeriod: { Start: startOfMonth, End: tomorrow },
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
    fetchCostData(costClient, {
      TimePeriod: { Start: startOfMonth, End: tomorrow },
      Granularity: "MONTHLY",
      Metrics: ["UnblendedCost"],
      GroupBy: [{ Type: "DIMENSION", Key: "LINKED_ACCOUNT" }],
    }),
    getAccountCounts(),
  ]);

  // ----- Transformations -----

  const mtdTotal = parseFloat(mtdMonthly.ResultsByTime?.[0].Total?.UnblendedCost.Amount || "0");

  const rolling14Daily = dailySeries(rolling14DailyResponse)
  const mtdDaily = dailySeries(mtdDailyResponse)

  // This calculation is equivalent to `sum of current days + (average of current days * remaining days)`
  // const forecast = daily[0].cost + forecastAvg * (lastDay - 1);
  const forecast = calculateForecast(rolling14Daily, mtdDaily)

  const prevTotal = parseFloat(prevMonthly.ResultsByTime?.[0].Total?.UnblendedCost.Amount || "0");

  const prevMtdTotal = parseFloat(prevMtd.ResultsByTime?.[0].Total?.UnblendedCost.Amount || "0");

  const topAccounts = byAccountMonthly.ResultsByTime?.[0].Groups?.map((g: any) => ({
    accountId: g.Keys[0],
    cost: parseFloat(g.Metrics.UnblendedCost.Amount),
  }))
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
    rolling14Daily,
  };
}

export default defineEventHandler(handleAsync(async (event) => {
  const startTime = Date.now()
  
  // Generate cache key
  const cacheKey = `organization:simplified-overview`

  const info = await organizationCache.getOrSet(
    cacheKey,
    async () => {
      console.log(`Cache miss: Fetching organization overview...`)
      return await getOverview()
    },
    {
      ttl: 3600, // 1 hour
      tags: [CacheTags.ORGANIZATION]
    }
  )
  
  if (!info) {
    return errors.serverError(event, 'Unable to fetch simplified organization overview')
  }
  
  const metadata = { responseTimeMs: Date.now() - startTime }
  
  return sendSuccess(event, info, metadata)
}))