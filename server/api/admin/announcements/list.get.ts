/**
 * GET /api/admin/announcements/list
 *
 * Fetch all announcements stored in site-config.
 * Announcements are stored as a site-config item under key 'announcements.list'.
 */

import { defineEventHandler } from 'h3';
import { getConfigValue } from '../../../utils/site-config';
import type { Announcement } from '../../../../shared/types/site-config';

export default defineEventHandler(async () => {
  try {
    const announcements = await getConfigValue<Announcement[]>('announcements.list') ?? [];

    return {
      success: true,
      announcements: Array.isArray(announcements) ? announcements : [],
    };
  } catch (error) {
    logger.error('Error fetching announcements:', error);
    throw createError({ statusCode: 500, message: 'Failed to load announcements' });
  }
});
