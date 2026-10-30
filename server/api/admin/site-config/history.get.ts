/**
 * GET /api/admin/site-config/history
 *
 * Get change history for site configuration.
 * Requires admin role.
 */

import { getAllConfigHistory } from '../../../utils/site-config';
import { requireAdmin } from '../../../utils/user-roles';
import type { SiteConfigHistoryResponse } from '../../../../shared/types/site-config';

export default defineEventHandler(async (event): Promise<SiteConfigHistoryResponse> => {
  await requireAdmin(event);

  try {
    const history = await getAllConfigHistory(200); // Get last 200 changes

    return {
      success: true,
      history,
      count: history.length,
    };
  } catch (error: any) {
    logger.error('Error fetching config history:', error);
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to fetch configuration history',
    });
  }
});
