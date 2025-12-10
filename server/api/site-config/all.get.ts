/**
 * GET /api/site-config/all
 *
 * Fetch all public site configuration items.
 * Returns only configs marked as public for client-side use.
 */

import { defineEventHandler } from 'h3';
import { getPublicSiteConfig, buildNestedConfig } from '../../utils/site-config';

export default defineEventHandler(async (event) => {
  try {
    // Fetch only public config items
    const configs = await getPublicSiteConfig();

    // Build nested object for easier client-side access
    const nestedConfig = buildNestedConfig(configs);

    return {
      success: true,
      config: nestedConfig,
      items: configs, // Also return flat array for metadata
      count: configs.length,
    };
  } catch (error) {
    console.error('Error fetching public site config:', error);

    return {
      success: false,
      error: 'Failed to fetch site configuration',
      config: {},
      items: [],
      count: 0,
    };
  }
});
