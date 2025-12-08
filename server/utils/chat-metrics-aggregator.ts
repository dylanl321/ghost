/**
 * Chat Metrics Aggregator
 * Aggregate analytics and metrics from chat threads in DynamoDB
 */

import { scanItems, queryItems } from "./dynamodb";
import type { ChatThread, ChatMessage, ChatMetrics } from "~/shared/types/chat-threads";
import { logger } from "./logger";
import {
  getTableName,
  getTableEnvironment,
  getTableAccountId,
} from "../lib/dynamodb-config";

/**
 * Get table configuration for chat threads
 */
async function getThreadsTableConfig() {
  const tableName = await getTableName("chatThreads");
  const environment = await getTableEnvironment("chatThreads");
  const accountId = await getTableAccountId("chatThreads");
  return { tableName, environment, accountId };
}

/**
 * Get table configuration for async chat jobs
 */
async function getAsyncJobsTableConfig() {
  const tableName = await getTableName("asyncChatJobs");
  const environment = await getTableEnvironment("asyncChatJobs");
  const accountId = await getTableAccountId("asyncChatJobs");
  return { tableName, environment, accountId };
}

/**
 * Time period options for metrics
 */
export type MetricsPeriod = "24h" | "7d" | "30d" | "all";

/**
 * Convert period to milliseconds
 */
function periodToMs(period: MetricsPeriod): number | null {
  switch (period) {
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
    case "all":
      return null; // No time limit
    default:
      return 7 * 24 * 60 * 60 * 1000; // Default to 7 days
  }
}

/**
 * Get comprehensive chat metrics for a given time period
 */
export async function getChatMetrics(
  period: MetricsPeriod = "7d"
): Promise<ChatMetrics> {
  const config = await getThreadsTableConfig();
  const periodMs = periodToMs(period);
  const endDate = new Date();
  const startDate = periodMs
    ? new Date(Date.now() - periodMs)
    : new Date(0); // Unix epoch for "all"

  logger.info(
    `[Chat Metrics] Fetching metrics for period ${period} (${startDate.toISOString()} to ${endDate.toISOString()})`
  );

  // Build filter expression for time range
  const filterExpression = periodMs
    ? "#lastMessageAt >= :startDate"
    : undefined;
  const expressionAttributeNames = periodMs
    ? { "#lastMessageAt": "lastMessageAt" }
    : undefined;
  const expressionAttributeValues = periodMs
    ? { ":startDate": startDate.toISOString() }
    : undefined;

  // Scan threads with time filter
  let allThreads: ChatThread[] = [];
  let nextToken: string | undefined;

  try {
    do {
      const result = await scanItems(
        config.tableName,
        filterExpression,
        1000, // Fetch 1000 items per page
        nextToken,
        config.environment,
        expressionAttributeNames,
        expressionAttributeValues,
        config.accountId
      );

      allThreads.push(...(result.items as ChatThread[]));
      nextToken = result.nextToken;
    } while (nextToken);

    logger.info(
      `[Chat Metrics] Found ${allThreads.length} threads for period ${period}`
    );
  } catch (error: any) {
    // Handle case where table doesn't exist
    if (
      error.name === "ResourceNotFoundException" ||
      error.message?.includes("Requested resource not found")
    ) {
      logger.warn(
        `[Chat Metrics] Table ${config.tableName} not found - returning empty metrics`
      );
      return getEmptyMetrics(period, startDate, endDate);
    }
    throw error;
  }

  // Aggregate metrics
  const userSet = new Set<string>();
  const accountMap = new Map<string, number>();
  const userStatsMap = new Map<
    string,
    { threadCount: number; messageCount: number }
  >();

  let totalMessages = 0;
  let totalQueries = 0;
  let mcpPermanent = 0;
  let mcpTemporary = 0;
  let mcpUnknown = 0;
  let sharedCount = 0;
  let pinnedCount = 0;
  let archivedCount = 0;
  let totalResponseTimes = 0;
  let responseTimeCount = 0;
  let cancelledQueriesCount = 0;
  let reasoningCount = 0;
  let totalAssistantMessages = 0;

  for (const thread of allThreads) {
    // Track unique users
    userSet.add(thread.userId);

    // Update user stats
    const userStats = userStatsMap.get(thread.userId) || {
      threadCount: 0,
      messageCount: 0,
    };
    userStats.threadCount++;
    userStats.messageCount += thread.messageCount;
    userStatsMap.set(thread.userId, userStats);

    // Count messages
    totalMessages += thread.messageCount;

    // Count threads by status
    if (thread.isShared) sharedCount++;
    if (thread.isPinned) pinnedCount++;
    if (thread.isArchived) archivedCount++;

    // Analyze messages
    for (let i = 0; i < thread.messages.length; i++) {
      const message = thread.messages[i];

      // Count user queries
      if (message.role === "user") {
        totalQueries++;
      }

      // Count assistant messages for reasoning rate calculation
      if (message.role === "assistant") {
        totalAssistantMessages++;

        // Track reasoning usage
        if ((message as any).reasoning) {
          reasoningCount++;
        }

        // Track cancelled queries
        if ((message as any).status?.status === "error" && (message as any).status?.error?.toLowerCase().includes("cancel")) {
          cancelledQueriesCount++;
        }
      }

      // Track accounts queried
      if (message.metadata?.accountId) {
        const currentCount = accountMap.get(message.metadata.accountId) || 0;
        accountMap.set(message.metadata.accountId, currentCount + 1);
      }

      // Track MCP type distribution
      if (message.metadata?.mcpType) {
        if (message.metadata.mcpType === "permanent") {
          mcpPermanent++;
        } else if (message.metadata.mcpType === "temporary") {
          mcpTemporary++;
        } else {
          mcpUnknown++;
        }
      } else if (message.metadata?.mcpUsed) {
        // Infer from mcpUsed if mcpType not present
        if (message.metadata.mcpUsed.includes("stdio")) {
          mcpTemporary++;
        } else {
          mcpPermanent++;
        }
      }

      // Calculate response times (if available)
      if (
        message.role === "assistant" &&
        i > 0 &&
        thread.messages[i - 1].role === "user"
      ) {
        const userMessage = thread.messages[i - 1];
        const assistantMessage = message;
        const userTime = new Date(userMessage.timestamp).getTime();
        const assistantTime = new Date(assistantMessage.timestamp).getTime();
        const responseTime = assistantTime - userTime;

        if (responseTime > 0 && responseTime < 300000) {
          // Valid response time (< 5 minutes)
          totalResponseTimes += responseTime;
          responseTimeCount++;
        }
      }
    }
  }

  // Sort and get top accounts
  const topAccounts = Array.from(accountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([accountId, queryCount]) => ({ accountId, queryCount }));

  // Sort and get top users
  const topUsers = Array.from(userStatsMap.entries())
    .sort((a, b) => b[1].messageCount - a[1].messageCount)
    .slice(0, 10)
    .map(([userId, stats]) => ({
      userId,
      threadCount: stats.threadCount,
      messageCount: stats.messageCount,
    }));

  // Calculate averages
  const averageMessagesPerThread =
    allThreads.length > 0 ? totalMessages / allThreads.length : 0;
  const averageResponseTime =
    responseTimeCount > 0 ? totalResponseTimes / responseTimeCount : undefined;

  // Calculate reasoning usage rate
  const reasoningUsageRate =
    totalAssistantMessages > 0 ? (reasoningCount / totalAssistantMessages) * 100 : 0;

  // Error rate (for now, we don't track explicit errors in threads)
  // This would need to be enhanced if we store error status
  const errorRate = 0;

  // Fetch async job metrics
  let asyncJobsQueued = 0;
  let asyncJobsRunning = 0;
  let asyncJobsComplete = 0;
  let asyncJobsErrored = 0;
  const asyncDurations: number[] = [];

  try {
    const asyncConfig = await getAsyncJobsTableConfig();
    const cutoffTime = periodMs ? Date.now() - periodMs : 0;

    const asyncResult = await scanItems(
      asyncConfig.tableName,
      undefined,
      1000,
      undefined,
      asyncConfig.environment,
      undefined,
      undefined,
      asyncConfig.accountId
    );

    // Filter jobs by time period and aggregate stats
    const jobs = asyncResult.items.filter((job: any) => {
      if (!periodMs) return true; // Include all for "all" period
      const jobTime = new Date(job.createdAt).getTime();
      return jobTime >= cutoffTime;
    });

    jobs.forEach((job: any) => {
      switch (job.status) {
        case "queued":
          asyncJobsQueued++;
          break;
        case "running":
          asyncJobsRunning++;
          break;
        case "complete":
          asyncJobsComplete++;
          if (job.startedAt && job.completedAt) {
            const duration =
              (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000;
            asyncDurations.push(duration);
          }
          break;
        case "error":
          asyncJobsErrored++;
          break;
      }
    });

    logger.info(
      `[Chat Metrics] Async jobs: ${asyncJobsQueued} queued, ${asyncJobsRunning} running, ${asyncJobsComplete} complete, ${asyncJobsErrored} errored`
    );
  } catch (error: any) {
    if (
      error.name === "ResourceNotFoundException" ||
      error.message?.includes("Requested resource not found")
    ) {
      logger.warn("[Chat Metrics] Async jobs table not found - using zeros");
    } else {
      logger.error("[Chat Metrics] Error fetching async jobs:", error);
    }
    // Continue with zeros if table doesn't exist or error occurs
  }

  const averageAsyncDuration =
    asyncDurations.length > 0
      ? asyncDurations.reduce((a, b) => a + b, 0) / asyncDurations.length
      : undefined;

  return {
    period,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    totalThreads: allThreads.length,
    totalMessages,
    totalQueries,
    uniqueUsers: userSet.size,
    averageMessagesPerThread: parseFloat(averageMessagesPerThread.toFixed(2)),
    averageResponseTime: averageResponseTime
      ? parseFloat((averageResponseTime / 1000).toFixed(2))
      : undefined, // Convert to seconds
    mcpTypeDistribution: {
      permanent: mcpPermanent,
      temporary: mcpTemporary,
      unknown: mcpUnknown,
    },
    topAccounts,
    topUsers,
    errorRate,
    sharedThreadsCount: sharedCount,
    pinnedThreadsCount: pinnedCount,
    archivedThreadsCount: archivedCount,
    // New metrics
    asyncJobsQueued,
    asyncJobsRunning,
    asyncJobsComplete,
    asyncJobsErrored,
    averageAsyncDuration,
    cancelledQueriesCount,
    reasoningUsageRate: parseFloat(reasoningUsageRate.toFixed(2)),
  };
}

// TODO: Future - Add caching for expensive aggregations
// TODO: Future - Add incremental updates instead of full scans

/**
 * Get metrics for a specific user
 */
export async function getUserMetrics(
  userId: string,
  period: MetricsPeriod = "7d"
): Promise<Partial<ChatMetrics>> {
  const config = await getThreadsTableConfig();
  const periodMs = periodToMs(period);
  const startDate = periodMs
    ? new Date(Date.now() - periodMs).toISOString()
    : undefined;

  // Query user's threads using UserIdIndex
  const result = await queryItems(
    {
      tableName: config.tableName,
      indexName: "UserIdIndex",
      queryExpression: "userId = :userId",
      filterExpression: startDate
        ? "#lastMessageAt >= :startDate"
        : undefined,
      expressionAttributeNames: startDate
        ? { "#lastMessageAt": "lastMessageAt" }
        : undefined,
      expressionAttributeValues: {
        ":userId": userId,
        ...(startDate && { ":startDate": startDate }),
      },
      scanIndexForward: false,
    },
    config.environment,
    config.accountId
  );

  const threads = result.items as ChatThread[];

  // Calculate user-specific metrics
  let totalMessages = 0;
  let totalQueries = 0;
  const accountMap = new Map<string, number>();

  for (const thread of threads) {
    totalMessages += thread.messageCount;

    for (const message of thread.messages) {
      if (message.role === "user") {
        totalQueries++;
      }

      if (message.metadata?.accountId) {
        const currentCount = accountMap.get(message.metadata.accountId) || 0;
        accountMap.set(message.metadata.accountId, currentCount + 1);
      }
    }
  }

  const topAccounts = Array.from(accountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([accountId, queryCount]) => ({ accountId, queryCount }));

  return {
    totalThreads: threads.length,
    totalMessages,
    totalQueries,
    topAccounts,
  };
}

/**
 * Return empty metrics structure
 */
function getEmptyMetrics(
  period: MetricsPeriod,
  startDate: Date,
  endDate: Date
): ChatMetrics {
  return {
    period,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    totalThreads: 0,
    totalMessages: 0,
    totalQueries: 0,
    uniqueUsers: 0,
    averageMessagesPerThread: 0,
    averageResponseTime: undefined,
    mcpTypeDistribution: {
      permanent: 0,
      temporary: 0,
      unknown: 0,
    },
    topAccounts: [],
    topUsers: [],
    errorRate: 0,
    sharedThreadsCount: 0,
    pinnedThreadsCount: 0,
    archivedThreadsCount: 0,
    asyncJobsQueued: 0,
    asyncJobsRunning: 0,
    asyncJobsComplete: 0,
    asyncJobsErrored: 0,
    averageAsyncDuration: undefined,
    cancelledQueriesCount: 0,
    reasoningUsageRate: 0,
  };
}

/**
 * Get recent thread activity (for real-time monitoring)
 */
export async function getRecentThreadActivity(
  limit: number = 20
): Promise<
  Array<{
    threadId: string;
    userId: string;
    title: string;
    lastMessageAt: string;
    messageCount: number;
    lastQuery?: string;
  }>
> {
  const config = await getThreadsTableConfig();

  // Scan recent threads (sorted by lastMessageAt)
  const result = await scanItems(
    config.tableName,
    undefined,
    limit,
    undefined,
    config.environment,
    undefined,
    undefined,
    config.accountId
  );

  const threads = result.items as ChatThread[];

  // Sort by lastMessageAt descending
  threads.sort(
    (a, b) =>
      new Date(b.lastMessageAt).getTime() -
      new Date(a.lastMessageAt).getTime()
  );

  return threads.slice(0, limit).map((thread) => {
    // Find last user message
    const lastUserMessage = thread.messages
      .slice()
      .reverse()
      .find((m) => m.role === "user");

    return {
      threadId: thread.threadId,
      userId: thread.userId,
      title: thread.title,
      lastMessageAt: thread.lastMessageAt,
      messageCount: thread.messageCount,
      lastQuery: lastUserMessage
        ? lastUserMessage.content.substring(0, 100)
        : undefined,
    };
  });
}
