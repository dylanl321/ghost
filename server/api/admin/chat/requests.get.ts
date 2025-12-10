/**
 * Admin API: Get Raw Chat Request Logs
 * GET /api/admin/chat/requests
 * Returns raw request/response logs from GHOST CloudWatch logs (admin only)
 */

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event);

  // Get query parameters
  const query = getQuery(event);
  const durationSeconds = query.duration
    ? parseInt(query.duration as string)
    : 7 * 24 * 60 * 60; // Default: 7 days
  const userId = query.userId as string | undefined;
  const requestType = query.type as string | undefined; // 'REQUEST', 'RESPONSE', 'ERROR'

  try {
    logger.info(
      `[Admin] Fetching chat request logs (duration: ${durationSeconds}s)`
    );

    // Fetch logs from GHOST CloudWatch logs
    const rawLogs = await getLogs(durationSeconds);

    // Filter for Strands Chat Debug logs
    const debugLogs = rawLogs
      .filter((log) => {
        const message = log.message || "";
        return message.includes("[Strands Chat Debug]");
      })
      .map((log) => {
        try {
          const message = log.message || "";

          // Parse the message to extract structured data
          // Format: [Strands Chat Debug] req-xxx { type: 'REQUEST', ... }
          const jsonStart = message.indexOf("{");
          if (jsonStart === -1) return null;

          const jsonStr = message.substring(jsonStart);
          const logData = JSON.parse(jsonStr);

          return {
            timestamp: log.timestamp,
            logTimestamp: logData.timestamp,
            requestId: logData.requestId,
            type: logData.type,
            userId: logData.userId,
            responseTimeMs: logData.responseTimeMs,
            metadata: logData.metadata,
            payload: logData.payload,
            error: logData.error,
          };
        } catch (error) {
          // If parsing fails, return raw log
          return {
            timestamp: log.timestamp,
            raw: log.message,
            parseError: true,
          };
        }
      })
      .filter((log) => log !== null);

    // Apply filters
    let filteredLogs = debugLogs;

    if (userId) {
      filteredLogs = filteredLogs.filter((log: any) => log.userId === userId);
    }

    if (requestType) {
      filteredLogs = filteredLogs.filter((log: any) => log.type === requestType);
    }

    // Group logs by requestId to create complete request-response pairs
    const requestMap = new Map<string, any>();

    for (const log of filteredLogs as any[]) {
      if (!log.requestId) continue;

      if (!requestMap.has(log.requestId)) {
        requestMap.set(log.requestId, {
          requestId: log.requestId,
          userId: log.userId,
          timestamp: log.timestamp,
          request: null,
          response: null,
          error: null,
        });
      }

      const entry = requestMap.get(log.requestId);

      if (log.type === "REQUEST") {
        entry.request = log.payload;
        entry.timestamp = log.timestamp; // Use request timestamp as primary
      } else if (log.type === "RESPONSE") {
        entry.response = {
          ...log.payload,
          metadata: log.metadata,
          responseTimeMs: log.responseTimeMs,
        };
      } else if (log.type === "ERROR") {
        entry.error = {
          ...log.error,
          responseTimeMs: log.responseTimeMs,
        };
      }
    }

    // Convert map to array and sort by timestamp (most recent first)
    const requestLogs = Array.from(requestMap.values()).sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );

    logger.info(
      `[Admin] Fetched ${requestLogs.length} chat request logs (filtered from ${debugLogs.length} debug logs)`
    );

    return {
      logs: requestLogs,
      totalCount: requestLogs.length,
      durationSeconds,
    };
  } catch (error: any) {
    logger.error("[Admin] Error fetching chat request logs:", error);
    throw createError({
      statusCode: 500,
      message: "Failed to fetch chat request logs",
    });
  }
});
