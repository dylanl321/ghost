/**
 * Admin API: Get Chat Metrics
 * GET /api/admin/chat/metrics?period=7d
 * Returns aggregated metrics for chat activity (admin only)
 */

import type { MetricsPeriod } from "../../../utils/chat-metrics-aggregator";

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event);

  // Get query parameters
  const query = getQuery(event);
  const period = (query.period as MetricsPeriod) || "7d";

  // Validate period
  const validPeriods = ["24h", "7d", "30d", "all"];
  if (!validPeriods.includes(period)) {
    throw createError({
      statusCode: 400,
      message: `Invalid period. Must be one of: ${validPeriods.join(", ")}`,
    });
  }

  try {
    logger.info(`[Admin] Fetching chat metrics for period: ${period}`);

    const metrics = await getChatMetrics(period);

    logger.info(
      `[Admin] Metrics fetched: ${metrics.totalThreads} threads, ${metrics.totalQueries} queries, ${metrics.uniqueUsers} users`
    );

    return {
      metrics,
    };
  } catch (error: any) {
    logger.error("[Admin] Error fetching chat metrics:", error);
    throw createError({
      statusCode: 500,
      message: "Failed to fetch chat metrics",
    });
  }
});
