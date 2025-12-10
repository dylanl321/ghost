/**
 * Admin API: List All Chat Threads
 * GET /api/admin/chat/threads
 * Returns all chat threads across all users (admin only)
 */

import type { ChatThread } from "../../../../shared/types/chat-threads";
import {
  getTableName,
  getTableEnvironment,
  getTableAccountId,
} from "../../../lib/dynamodb-config";

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event);

  // Get query parameters
  const query = getQuery(event);
  const userId = query.userId as string | undefined;
  const accountId = query.accountId as string | undefined;
  const startDate = query.startDate as string | undefined;
  const endDate = query.endDate as string | undefined;
  const isShared = query.isShared as string | undefined;
  const limit = parseInt((query.limit as string) || "50");
  const nextToken = query.nextToken as string | undefined;

  // Get table configuration
  const tableName = await getTableName("chatThreads");
  const environment = await getTableEnvironment("chatThreads");
  const tableAccountId = await getTableAccountId("chatThreads");

  try {
    let result;

    // If filtering by specific user, use UserIdIndex for efficiency
    if (userId) {
      // Build filter expression for additional filters
      const filterParts: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {
        ":userId": userId,
      };

      if (startDate) {
        filterParts.push("#lastMessageAt >= :startDate");
        expressionAttributeNames["#lastMessageAt"] = "lastMessageAt";
        expressionAttributeValues[":startDate"] = startDate;
      }

      if (endDate) {
        filterParts.push("#lastMessageAt <= :endDate");
        expressionAttributeNames["#lastMessageAt"] = "lastMessageAt";
        expressionAttributeValues[":endDate"] = endDate;
      }

      if (isShared !== undefined) {
        filterParts.push("#isShared = :isShared");
        expressionAttributeNames["#isShared"] = "isShared";
        expressionAttributeValues[":isShared"] = isShared === "true";
      }

      result = await queryItems(
        {
          tableName,
          indexName: "UserIdIndex",
          queryExpression: "userId = :userId",
          filterExpression:
            filterParts.length > 0 ? filterParts.join(" AND ") : undefined,
          expressionAttributeNames:
            Object.keys(expressionAttributeNames).length > 0
              ? expressionAttributeNames
              : undefined,
          expressionAttributeValues,
          limit,
          scanIndexForward: false, // Most recent first
          nextToken,
        },
        environment,
        tableAccountId
      );
    } else {
      // Scan all threads with filters
      const filterParts: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};

      if (startDate) {
        filterParts.push("#lastMessageAt >= :startDate");
        expressionAttributeNames["#lastMessageAt"] = "lastMessageAt";
        expressionAttributeValues[":startDate"] = startDate;
      }

      if (endDate) {
        filterParts.push("#lastMessageAt <= :endDate");
        expressionAttributeNames["#lastMessageAt"] = "lastMessageAt";
        expressionAttributeValues[":endDate"] = endDate;
      }

      if (isShared !== undefined) {
        filterParts.push("#isShared = :isShared");
        expressionAttributeNames["#isShared"] = "isShared";
        expressionAttributeValues[":isShared"] = isShared === "true";
      }

      result = await scanItems(
        tableName,
        filterParts.length > 0 ? filterParts.join(" AND ") : undefined,
        limit,
        nextToken,
        environment,
        Object.keys(expressionAttributeNames).length > 0
          ? expressionAttributeNames
          : undefined,
        Object.keys(expressionAttributeValues).length > 0
          ? expressionAttributeValues
          : undefined,
        tableAccountId
      );
    }

    let threads = result.items as ChatThread[];

    // Client-side filtering for accountId (since it's in message metadata)
    if (accountId) {
      threads = threads.filter((thread) =>
        thread.messages.some(
          (msg) => msg.metadata?.accountId === accountId
        )
      );
    }

    // Sort by lastMessageAt descending
    threads.sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() -
        new Date(a.lastMessageAt).getTime()
    );

    // Return thread summaries (without full message content for performance)
    const threadSummaries = threads.map((thread) => {
      const lastUserMessage = thread.messages
        .slice()
        .reverse()
        .find((m) => m.role === "user");

      return {
        threadId: thread.threadId,
        userId: thread.userId,
        title: thread.title,
        messageCount: thread.messageCount,
        lastMessageAt: thread.lastMessageAt,
        createdAt: thread.createdAt,
        isPinned: thread.isPinned,
        isArchived: thread.isArchived,
        isShared: thread.isShared,
        shareId: thread.shareId,
        lastQuery: lastUserMessage
          ? lastUserMessage.content.substring(0, 100)
          : undefined,
        sessionId: thread.sessionId,
      };
    });

    logger.info(
      `[Admin] Fetched ${threadSummaries.length} chat threads${userId ? ` for user ${userId}` : ""}`
    );

    return {
      threads: threadSummaries,
      nextToken: result.nextToken,
      hasMore: !!result.nextToken,
      totalCount: result.count,
    };
  } catch (error: any) {
    logger.error("[Admin] Error fetching chat threads:", error);

    // Handle table not found
    if (
      error.name === "ResourceNotFoundException" ||
      error.message?.includes("Requested resource not found")
    ) {
      return {
        threads: [],
        hasMore: false,
        totalCount: 0,
      };
    }

    throw createError({
      statusCode: 500,
      message: "Failed to fetch chat threads",
    });
  }
});
