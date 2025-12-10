/**
 * Admin API: List Available CloudWatch Log Groups
 * GET /api/admin/chat/log-groups
 * Returns available CloudWatch log groups in deployment account (admin only)
 */

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event);

  try {
    logger.info("[Admin] Listing available CloudWatch log groups");

    const logGroups = await listAvailableLogGroups();
    const config = getStrandsLogConfig();

    logger.info(
      `[Admin] Found ${logGroups.length} ECS log groups. Current log group prefix: ${config.logGroupPrefix}`
    );

    return {
      currentConfig: config,
      availableLogGroups: logGroups,
      totalCount: logGroups.length,
    };
  } catch (error: any) {
    logger.error("[Admin] Error listing log groups:", error);
    throw createError({
      statusCode: 500,
      message: `Failed to list log groups: ${error.message}`,
    });
  }
});
