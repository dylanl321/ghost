/**
 * POST /api/admin/announcements/update
 *
 * Save announcements list to site-config.
 * Stores under key 'announcements.list' as an array value.
 */

import { defineEventHandler, readBody } from 'h3';
import { requireAdmin } from '../../../utils/user-roles';
import { getSiteConfig, updateSiteConfig } from '../../../utils/site-config';
import type { Announcement } from '../../../../shared/types/site-config';

interface UpdateAnnouncementsBody {
  announcements: Announcement[];
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event);

  try {
    const body = await readBody<UpdateAnnouncementsBody>(event);

    if (!Array.isArray(body?.announcements)) {
      throw createError({
        statusCode: 400,
        message: 'announcements must be an array',
      });
    }

    const auth = event.context.auth;
    const user = auth?.user;
    const username = user?.email || user?.preferred_username || 'unknown';

    const ANNOUNCEMENTS_KEY = 'announcements.list';

    // Ensure the config key exists in DynamoDB; if not, we need to upsert it.
    // updateSiteConfig requires the key to exist — so we check and handle a missing key.
    const existing = await getSiteConfig(ANNOUNCEMENTS_KEY, false);

    if (!existing) {
      // Key not in DynamoDB or defaults — write it directly via the DynamoDB client.
      // We use updateSiteConfig with a synthesized item by first creating it via a direct put.
      // Since updateSiteConfig checks DEFAULT_SITE_CONFIG, we fall back to a raw DynamoDB write.
      const { DynamoDBClient, PutItemCommand } = await import('@aws-sdk/client-dynamodb');
      const { STSClient, AssumeRoleCommand } = await import('@aws-sdk/client-sts');
      const { marshall } = await import('@aws-sdk/util-dynamodb');

      const TABLE_NAME = process.env.SITE_CONFIG_TABLE || 'ghost-site-config';
      const region = process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1';
      const deploymentAccountId = process.env.AWS_DEPLOYMENT_ACCOUNT_ID || '461760157232';
      const roleName = process.env.AWS_ASSUME_ROLE_NAME || 'GDMSOrganizationsRole';

      const stsClient = new STSClient({
        region,
        credentials: {
          accessKeyId: process.env.AWS_GOVCLOUD_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY!,
        },
      });

      const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
        RoleArn: `arn:aws-us-gov:iam::${deploymentAccountId}:role/${roleName}`,
        RoleSessionName: `announcements-update-${Date.now()}`,
        DurationSeconds: 900,
      }));

      if (!assumeRoleResponse.Credentials) {
        throw new Error('Failed to assume role for announcements update');
      }

      const dynamoClient = new DynamoDBClient({
        region,
        credentials: {
          accessKeyId: assumeRoleResponse.Credentials.AccessKeyId!,
          secretAccessKey: assumeRoleResponse.Credentials.SecretAccessKey!,
          sessionToken: assumeRoleResponse.Credentials.SessionToken!,
        },
      });

      const timestamp = new Date().toISOString();
      const item = {
        key: ANNOUNCEMENTS_KEY,
        value: body.announcements,
        type: 'array',
        category: 'ui',
        label: 'Announcements',
        description: 'Active announcements displayed as banners to all users',
        defaultValue: [],
        isPublic: true,
        isEditable: true,
        createdAt: timestamp,
        updatedAt: timestamp,
        updatedBy: username,
      };

      await dynamoClient.send(new PutItemCommand({
        TableName: TABLE_NAME,
        Item: marshall(item, { removeUndefinedValues: true }),
      }));
    } else {
      await updateSiteConfig(ANNOUNCEMENTS_KEY, body.announcements, username);
    }

    return {
      success: true,
      announcements: body.announcements,
      message: 'Announcements updated successfully',
    };
  } catch (error: any) {
    logger.error('Error updating announcements:', error);
    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update announcements',
    });
  }
});
