/**
 * Hermes per-user resource links
 * Generates deep links to AWS console and Mattermost resources for a given user
 */

export interface HermesUserLink {
  label: string
  icon: string
  url: string
  description: string
  available: boolean
}

const AWS_CONSOLE_BASE = 'https://console.amazonaws-us-gov.com'
const AWS_REGION = 'us-gov-west-1'
const MM_BASE = 'https://aws-mm.gd-ms.us'
const CW_LOG_GROUP = '/ecs/hermes-mattermost'

/**
 * Returns deep links to all Hermes-related resources for a given user.
 * @param username - the local part of the user's email (e.g. "john.doe" from "john.doe@gd-ms.com")
 * @param mmUserId - Mattermost internal user ID (UUID), optional
 */
export function getUserResourceLinks(username: string, mmUserId?: string): HermesUserLink[] {
  // CloudWatch logs deep-link filtered by gateway prefix
  const cwLogGroupEncoded = encodeURIComponent(CW_LOG_GROUP).replace(/%2F/g, '$252F')
  const cwFilterPattern = encodeURIComponent(`gw-${username}`)
  const cwUrl = `${AWS_CONSOLE_BASE}/cloudwatch/home?region=${AWS_REGION}#logsV2:log-groups/log-group/${cwLogGroupEncoded}/log-events$3FfilterPattern$3D${cwFilterPattern}`

  // ECS service console deep-link
  const ecsUrl = `${AWS_CONSOLE_BASE}/ecs/home?region=${AWS_REGION}#/clusters/hermes-mattermost/services/gw-${username}/details`

  // Secrets Manager deep-link
  const secretName = `hermes-mattermost/${username}`
  const secretsUrl = `${AWS_CONSOLE_BASE}/secretsmanager/secret?name=${encodeURIComponent(secretName)}&region=${AWS_REGION}`

  return [
    {
      label: 'Gateway Health',
      icon: 'i-heroicons-heart',
      url: `${MM_BASE}/gw-${username}/health`,
      description: `Gateway health: gw-${username}`,
      available: true
    },
    {
      label: 'MM Profile',
      icon: 'i-heroicons-user-circle',
      url: mmUserId ? `${MM_BASE}/admin_console/user_management/user/${mmUserId}` : '',
      description: mmUserId
        ? 'Mattermost admin console user profile'
        : 'Mattermost profile (MM user ID not available)',
      available: !!mmUserId
    },
    {
      label: 'MM Bot DM',
      icon: 'i-heroicons-chat-bubble-left-right',
      url: `${MM_BASE}/messages/@hermes-${username}`,
      description: `Open DM with @hermes-${username} bot`,
      available: true
    },
    {
      label: 'CloudWatch',
      icon: 'i-heroicons-magnifying-glass-circle',
      url: cwUrl,
      description: `CloudWatch logs for gw-${username}`,
      available: true
    },
    {
      label: 'ECS Service',
      icon: 'i-heroicons-server',
      url: ecsUrl,
      description: `ECS service: gw-${username}`,
      available: true
    },
    {
      label: 'Secret',
      icon: 'i-heroicons-key',
      url: secretsUrl,
      description: `Secrets Manager: hermes-mattermost/${username}`,
      available: true
    }
  ]
}
