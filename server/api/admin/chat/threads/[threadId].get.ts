/**
 * Admin API: Get Thread Details
 * GET /api/admin/chat/threads/:threadId
 * Returns full thread details including all messages (admin only)
 */

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event);

  // Get thread ID from route params
  const threadId = getRouterParam(event, "threadId");

  if (!threadId) {
    throw createError({
      statusCode: 400,
      message: "Thread ID is required",
    });
  }

  try {
    // Get thread without userId check (admin can access any thread)
    const thread = await getThreadById(threadId);

    if (!thread) {
      throw createError({
        statusCode: 404,
        message: "Thread not found",
      });
    }

    logger.info(
      `[Admin] Fetched thread details for ${threadId} (user: ${thread.userId})`
    );

    return {
      thread,
    };
  } catch (error: any) {
    // If it's already an H3Error, rethrow it
    if (error.statusCode) {
      throw error;
    }

    logger.error(`[Admin] Error fetching thread ${threadId}:`, error);
    throw createError({
      statusCode: 500,
      message: "Failed to fetch thread details",
    });
  }
});
