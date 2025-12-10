/**
 * Admin API: Get CloudWatch Logs from Strands Service
 * GET /api/admin/chat/cloudwatch-logs
 * Returns CloudWatch logs from Strands ECS service (admin only)
 */

import type { StrandsLogQuery } from "../../../utils/strands-cloudwatch-logs";

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event);

  // Get query parameters
  const query = getQuery(event);
  const startTime = query.startTime
    ? parseInt(query.startTime as string)
    : Date.now() - 7 * 24 * 60 * 60 * 1000; // Default: 7 days ago
  const endTime = query.endTime
    ? parseInt(query.endTime as string)
    : Date.now();
  const filterPattern = query.filterPattern as string | undefined;
  const logStreamNames = query.logStreamNames
    ? (query.logStreamNames as string).split(",")
    : undefined;
  const limit = query.limit ? parseInt(query.limit as string) : 1000;
  const logLevel = query.logLevel as string | undefined;
  const containers = query.containers
    ? (query.containers as string).split(",")
    : ["agent"]; // Default to agent container
  const includeHealthChecks = query.includeHealthChecks === "true"; // Default: false (exclude health checks)

  try {
    logger.info(
      `[Admin] Fetching CloudWatch logs from Strands service (${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}), includeHealthChecks: ${includeHealthChecks}`
    );

    // Build filter pattern based on log level and health check exclusion
    let effectiveFilterPattern = filterPattern;

    // Add log level filter
    if (logLevel && logLevel !== "ALL") {
      effectiveFilterPattern = effectiveFilterPattern
        ? `${effectiveFilterPattern} ${logLevel}`
        : logLevel;
    }

    // Exclude health checks at CloudWatch API level (unless explicitly included)
    if (!includeHealthChecks) {
      // CloudWatch filter pattern to exclude health check logs
      const healthCheckExclusion = '-"GET /health"';
      effectiveFilterPattern = effectiveFilterPattern
        ? `${effectiveFilterPattern} ${healthCheckExclusion}`
        : healthCheckExclusion;
    }

    logger.info(
      `[Admin] Using CloudWatch filter pattern: ${effectiveFilterPattern || "none"}`
    );

    const logQuery: StrandsLogQuery = {
      startTime,
      endTime,
      filterPattern: effectiveFilterPattern,
      logStreamNames,
      limit,
      containers,
    };

    const rawEvents = await getStrandsLogs(logQuery);

    // Format events for display
    const formattedEvents = rawEvents.map(formatLogEvent);

    logger.info(
      `[Admin] Fetched ${formattedEvents.length} CloudWatch log events (filtered at AWS API level)`
    );

    // Additional client-side log level filtering if needed (for accuracy)
    let filteredEvents = formattedEvents;
    if (logLevel && logLevel !== "ALL") {
      filteredEvents = formattedEvents.filter(
        (event) => event.level === logLevel
      );
    }

    return {
      logs: filteredEvents,
      totalCount: filteredEvents.length,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
    };
  } catch (error: any) {
    logger.error("[Admin] Error fetching CloudWatch logs:", error);
    throw createError({
      statusCode: 500,
      message: `Failed to fetch CloudWatch logs: ${error.message}`,
    });
  }
});
