/**
 * PUT /api/admin/site-config/:key
 *
 * Update a site configuration item (admin only).
 */

import { defineEventHandler, readBody, getRouterParam } from 'h3';
import { requireAdmin } from '~/server/utils/user-roles';
import { updateSiteConfig } from '~/server/utils/site-config';
import type { SiteConfigUpdateRequest, SiteConfigUpdateResponse } from '~/shared/types/site-config';

export default defineEventHandler(async (event) => {
  // Require admin access
  const user = await requireAdmin(event);

  try {
    // Get the config key from URL params
    const key = getRouterParam(event, 'key');
    if (!key) {
      throw createError({
        statusCode: 400,
        message: 'Configuration key is required',
      });
    }

    // Decode the key (in case it has dots and is URL encoded)
    const decodedKey = decodeURIComponent(key);

    // Parse request body
    const body = await readBody<SiteConfigUpdateRequest>(event);
    if (body.value === undefined) {
      throw createError({
        statusCode: 400,
        message: 'Value is required',
      });
    }

    // Get username for audit trail
    const username = user.email || user.preferred_username || 'unknown';

    // Update the configuration
    const updated = await updateSiteConfig(
      decodedKey,
      body.value,
      username
    );

    return {
      success: true,
      config: updated,
      message: `Configuration ${decodedKey} updated successfully`,
    } as SiteConfigUpdateResponse & { message: string };
  } catch (error: any) {
    console.error('Error updating site config:', error);

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update site configuration',
    });
  }
});
