/**
 * GET /api/admin/announcements/list
 *
 * Fetch all announcements stored in site-config.
 * Announcements are stored as a site-config item under key 'announcements.list'.
 */

import { defineEventHandler } from 'h3';
import { getConfigValue } from '../../../utils/site-config';
import type { Announcement } from '../../../../shared/types/site-config';

export default defineEventHandler(async (_event) => {
  try {
    const announcements = await getConfigValue<Announcement[]>('announcements.list') ?? [];

    return {
      success: true,
      announcements,
    };
  } catch (error) {
    logger.error('Error fetching announcements:', error);
    return {
      success: true,
      announcements: [] as Announcement[],
    };
  }
});
