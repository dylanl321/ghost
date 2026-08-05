export type CostTagCreatorType = 'email' | 'iam-user' | 'automation' | 'service' | 'root' | 'untagged'

export interface NormalizedCostTagIdentity {
  groupKey: string
  tagValue: string
  displayName: string
  creatorType?: CostTagCreatorType
  isPerson: boolean
  isUntagged: boolean
  rawValue: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const IAM_USER_ARN_PATTERN = /^arn:(?:aws|aws-us-gov|aws-cn):iam::\d{12}:user\/(.+)$/i

export function isCreatedByTag(tagKey: string): boolean {
  return tagKey.toLowerCase() === 'aws:createdby'
}

export function extractCostTagValue(groupKey: string, tagKey: string): string {
  const expectedPrefix = `${tagKey}$`
  if (groupKey.startsWith(expectedPrefix)) return groupKey.slice(expectedPrefix.length)
  if (groupKey === '$not_tagged' || groupKey === '__untagged__') return ''
  return groupKey
}

function createdByDisplayName(rawValue: string): string {
  if (rawValue.startsWith('AssumedRole:')) {
    return rawValue.split(':').slice(2).join(':') || rawValue
  }
  if (rawValue.startsWith('AWSService:')) return rawValue.slice('AWSService:'.length)
  const iamUser = rawValue.match(IAM_USER_ARN_PATTERN)
  if (iamUser?.[1]) return iamUser[1]
  if (rawValue.includes(':role/')) return rawValue.split(':role/').pop() || rawValue
  return rawValue
}

export function normalizeCostTagIdentity(groupKey: string, tagKey: string): NormalizedCostTagIdentity {
  const rawValue = extractCostTagValue(groupKey, tagKey)
  const isUntagged = !rawValue.trim()

  if (!isCreatedByTag(tagKey)) {
    return {
      groupKey,
      tagValue: rawValue,
      displayName: isUntagged ? 'Untagged' : rawValue,
      isPerson: false,
      isUntagged,
      rawValue
    }
  }

  if (isUntagged) {
    return {
      groupKey: `${tagKey}$`,
      tagValue: '',
      displayName: 'Untagged',
      creatorType: 'untagged',
      isPerson: false,
      isUntagged: true,
      rawValue: ''
    }
  }

  const displayName = createdByDisplayName(rawValue)
  if (EMAIL_PATTERN.test(displayName)) {
    const normalizedEmail = displayName.toLowerCase()
    return {
      groupKey: `${tagKey}$person:email:${normalizedEmail}`,
      tagValue: normalizedEmail,
      displayName,
      creatorType: 'email',
      isPerson: true,
      isUntagged: false,
      rawValue
    }
  }

  const iamUser = rawValue.match(IAM_USER_ARN_PATTERN)
  if (iamUser?.[1]) {
    const normalizedPath = iamUser[1].toLowerCase()
    return {
      groupKey: `${tagKey}$person:iam-user:${normalizedPath}`,
      tagValue: normalizedPath,
      displayName: iamUser[1],
      creatorType: 'iam-user',
      isPerson: true,
      isUntagged: false,
      rawValue
    }
  }

  const creatorType: CostTagCreatorType = rawValue.startsWith('AWSService:')
    ? 'service'
    : rawValue.startsWith('Root:') || rawValue === 'Root'
      ? 'root'
      : 'automation'

  return {
    groupKey,
    tagValue: rawValue,
    displayName,
    creatorType,
    isPerson: false,
    isUntagged: false,
    rawValue
  }
}
