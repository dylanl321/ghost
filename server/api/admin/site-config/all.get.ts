/**
 * GET /api/admin/site-config/all
 *
 * Fetch all site configuration items (admin only).
 * Returns all configs including private ones with full metadata.
 */

import { defineEventHandler } from 'h3';
import { requireAdmin } from '../../../utils/user-roles';
import { getAllSiteConfig, buildNestedConfig } from '../../../utils/site-config';
import type { SiteConfigListResponse } from '../../../../shared/types/site-config';

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event);

  try {
    // Fetch all config items (including private)
    const configs = await getAllSiteConfig();

    // Build nested object for easier display
    const nestedConfig = buildNestedConfig(configs);

    // Group by category for admin panel display
    const byCategory = configs.reduce((acc, config) => {
      if (!acc[config.category]) {
        acc[config.category] = [];
      }
      acc[config.category].push(config);
      return acc;
    }, {} as Record<string, typeof configs>);

    return {
      success: true,
      configs,
      count: configs.length,
      nestedConfig,
      byCategory,
    } as SiteConfigListResponse & { nestedConfig: any; byCategory: any };
  } catch (error) {
    logger.error('Error fetching admin site config:', error);

    throw createError({
      statusCode: 500,
      message: 'Failed to fetch site configuration',
    });
  }
});
