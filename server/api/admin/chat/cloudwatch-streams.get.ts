/**
 * Admin API: Get CloudWatch Log Streams
 * GET /api/admin/chat/cloudwatch-streams
 * Returns available log streams from Strands ECS service (admin only)
 */

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event);

  // Get query parameters
  const query = getQuery(event);
  const limit = query.limit ? parseInt(query.limit as string) : 50;

  try {
    logger.info("[Admin] Fetching CloudWatch log streams from Strands service");

    const logStreams = await getStrandsLogStreams(limit);

    // Format stream data for display
    const formattedStreams = logStreams.map((stream) => ({
      logStreamName: stream.logStreamName,
      creationTime: stream.creationTime,
      firstEventTimestamp: stream.firstEventTimestamp,
      lastEventTimestamp: stream.lastEventTimestamp,
      lastIngestionTime: stream.lastIngestionTime,
      storedBytes: stream.storedBytes,
    }));

    logger.info(
      `[Admin] Fetched ${formattedStreams.length} CloudWatch log streams`
    );

    return {
      streams: formattedStreams,
      totalCount: formattedStreams.length,
    };
  } catch (error: any) {
    logger.error("[Admin] Error fetching CloudWatch log streams:", error);
    throw createError({
      statusCode: 500,
      message: `Failed to fetch log streams: ${error.message}`,
    });
  }
});
