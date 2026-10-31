/**
 * POST /api/admin/announcements/update
 *
 * Save announcements list to site-config.
 * Stores under key 'announcements.list' as an array value.
 */

import { defineEventHandler, readBody } from 'h3';
import { requireAdmin, getUserEmail } from '../../../utils/user-roles';
import { updateSiteConfigWithHistory } from '../../../utils/site-config';
import type { Announcement } from '../../../../shared/types/site-config';

interface UpdateAnnouncementsBody {
  announcements: Announcement[];
}

const SEVERITIES = new Set(['info', 'warning', 'critical']);
const MAX_ANNOUNCEMENTS = 20;
const MAX_MESSAGE_LENGTH = 1000;

function isValidDate(value: unknown): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validateAnnouncement(value: any, index: number): Announcement {
  const where = `announcements[${index}]`;
  if (!value || typeof value !== 'object') {
    throw createError({ statusCode: 400, message: `${where} must be an object` });
  }
  if (typeof value.id !== 'string' || !value.id.trim()) {
    throw createError({ statusCode: 400, message: `${where}.id is required` });
  }
  if (typeof value.message !== 'string' || !value.message.trim() || value.message.length > MAX_MESSAGE_LENGTH) {
    throw createError({ statusCode: 400, message: `${where}.message must be 1-${MAX_MESSAGE_LENGTH} characters` });
  }
  if (!SEVERITIES.has(value.severity)) {
    throw createError({ statusCode: 400, message: `${where}.severity must be info, warning or critical` });
  }
  if (typeof value.active !== 'boolean') {
    throw createError({ statusCode: 400, message: `${where}.active must be true or false` });
  }
  if (!isValidDate(value.createdAt)) {
    throw createError({ statusCode: 400, message: `${where}.createdAt must be an ISO date` });
  }
  if (value.expiresAt !== undefined && value.expiresAt !== null && !isValidDate(value.expiresAt)) {
    throw createError({ statusCode: 400, message: `${where}.expiresAt must be an ISO date` });
  }

  return {
    id: value.id.trim(),
    message: value.message.trim(),
    severity: value.severity,
    active: value.active,
    createdAt: value.createdAt,
    ...(value.expiresAt ? { expiresAt: value.expiresAt } : {}),
  };
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  const body = await readBody<UpdateAnnouncementsBody>(event);

  if (!Array.isArray(body?.announcements)) {
    throw createError({ statusCode: 400, message: 'announcements must be an array' });
  }
  if (body.announcements.length > MAX_ANNOUNCEMENTS) {
    throw createError({ statusCode: 400, message: `At most ${MAX_ANNOUNCEMENTS} announcements are allowed` });
  }

  const announcements = body.announcements.map(validateAnnouncement);
  if (new Set(announcements.map(a => a.id)).size !== announcements.length) {
    throw createError({ statusCode: 400, message: 'Announcement ids must be unique' });
  }

  try {
    await updateSiteConfigWithHistory('announcements.list', announcements, getUserEmail(event) || 'unknown', 'Announcements updated');
  } catch (error: any) {
    logger.error('Error updating announcements:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.statusCode ? error.message : 'Failed to update announcements',
    });
  }

  return {
    success: true,
    announcements,
    message: 'Announcements updated successfully',
  };
});
