import * as z from 'zod-v4'
import { getAllAccountsUnified, type UnifiedAccount } from '../utils/accounts-consolidated'
import { fuzzySearchAccounts } from '../utils/fuzzy-search'

export type OperationalEnvironment = 'commercial' | 'govcloud'

export interface ResolvedAccountRef {
  name: string
  commercialAccountId?: string
  govCloudAccountId?: string
  selectedAccountId: string
  environment: OperationalEnvironment
}

export interface ResolvedOperationalScope {
  environment: OperationalEnvironment
  accounts: ResolvedAccountRef[]
  commercialAccountIds: string[]
  operationalAccountIds: string[]
  organizationWide: boolean
}

export class McpInputError extends Error {
  code: string
  details?: Record<string, unknown>

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = code
    this.code = code
    this.details = details
  }
}

export const flexibleStringListSchema = z.union([
  z.string(),
  z.array(z.string())
]).optional()

export const flexibleIntegerSchema = z.union([
  z.number(),
  z.string()
]).optional()

export const flexibleBooleanSchema = z.union([
  z.boolean(),
  z.string()
]).optional()

export const flexibleEnvironmentSchema = z.string().optional()

export function stringList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return [...new Set(values.flatMap(item => String(item).split(','))
    .map(item => item.trim())
    .filter(Boolean))]
}

export function booleanValue(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  const normalized = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true
  if (['false', '0', 'no', 'n'].includes(normalized)) return false
  throw new McpInputError('INVALID_BOOLEAN', `Expected true or false, received ${JSON.stringify(value)}.`, {
    accepted: [true, false, 'true', 'false']
  })
}

export function boundedInteger(
  value: unknown,
  options: { name: string; minimum: number; maximum: number; fallback: number }
): number {
  if (value === undefined || value === null || value === '') return options.fallback
  const parsed = typeof value === 'number' ? value : Number(String(value).trim())
  if (!Number.isInteger(parsed)) {
    throw new McpInputError('INVALID_NUMBER', `${options.name} must be a whole number.`, {
      parameter: options.name,
      requested: value,
      correctedExample: options.fallback
    })
  }
  if (parsed < options.minimum || parsed > options.maximum) {
    throw new McpInputError('OUT_OF_RANGE', `${options.name} must be between ${options.minimum} and ${options.maximum}.`, {
      parameter: options.name,
      requested: parsed,
      minimum: options.minimum,
      maximum: options.maximum,
      correctedExample: Math.min(Math.max(parsed, options.minimum), options.maximum)
    })
  }
  return parsed
}

export function operationalEnvironment(value: unknown, fallback: OperationalEnvironment = 'govcloud'): OperationalEnvironment {
  if (value === undefined || value === null || value === '' || String(value).toLowerCase() === 'auto') return fallback
  const normalized = String(value).trim().toLowerCase().replace(/[\s_-]+/g, '')
  if (['govcloud', 'gov'].includes(normalized)) return 'govcloud'
  if (['commercial', 'comm', 'aws'].includes(normalized)) return 'commercial'
  throw new McpInputError('INVALID_ENVIRONMENT', 'environment must be auto, govcloud, or commercial.', {
    requested: value,
    accepted: ['auto', 'govcloud', 'commercial']
  })
}

function displayName(account: UnifiedAccount): string {
  return account.name || account.projectName || account.accountName || account.accountId || account.govCloudAccountId || 'Unknown account'
}

function ids(account: UnifiedAccount) {
  return {
    commercial: account.accountId || account.awsStandardAccountID,
    govcloud: account.govCloudAccountId || account.awsGovCloudAccountID
  }
}

function normalized(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function exactAccountMatch(accounts: UnifiedAccount[], reference: string): UnifiedAccount[] {
  const lower = reference.toLowerCase()
  const compact = normalized(reference)
  return accounts.filter(account => {
    const accountIds = ids(account)
    const exactValues = [
      accountIds.commercial,
      accountIds.govcloud,
      account.email,
      account.awsAccountEmail,
      account.requestId,
      (account as any).requestID
    ].filter(value => value !== undefined && value !== null).map(value => String(value).toLowerCase())
    if (exactValues.includes(lower)) return true
    const names = [account.name, account.projectName, account.accountName, (account as any).accountAlias]
      .filter(Boolean)
    return names.some(value => normalized(value) === compact)
  })
}

export async function resolveAccountReference(reference: string, accounts: UnifiedAccount[]): Promise<UnifiedAccount> {
  const exact = exactAccountMatch(accounts, reference)
  if (exact.length === 1) return exact[0]!
  if (exact.length > 1) throw ambiguousAccount(reference, exact)

  const fuzzy = await fuzzySearchAccounts(reference, accounts, 5)
  const top = fuzzy[0]
  const runnerUp = fuzzy[1]
  const topRelevance = top ? Math.round((1 - top.score) * 100) : 0
  const margin = top && runnerUp ? Math.round((runnerUp.score - top.score) * 100) : 100
  if (top && topRelevance >= 85 && margin >= 10) return top.item
  if (fuzzy.length) throw ambiguousAccount(reference, fuzzy.map(item => item.item), fuzzy.map(item => Math.round((1 - item.score) * 100)))

  throw new McpInputError('ACCOUNT_NOT_FOUND', `No GHOST account matched ${JSON.stringify(reference)}.`, {
    reference,
    correctedExample: { account: 'account name, email, request ID, Commercial ID, or GovCloud ID' }
  })
}

function ambiguousAccount(reference: string, accounts: UnifiedAccount[], scores?: number[]): McpInputError {
  return new McpInputError('ACCOUNT_AMBIGUOUS', `Account reference ${JSON.stringify(reference)} matched multiple accounts.`, {
    reference,
    candidates: accounts.slice(0, 5).map((account, index) => ({
      name: displayName(account),
      commercialAccountId: ids(account).commercial,
      govCloudAccountId: ids(account).govcloud,
      relevance: scores?.[index]
    })),
    correctedExample: { account: ids(accounts[0]!).govcloud || ids(accounts[0]!).commercial }
  })
}

export async function resolveOperationalScope(
  accountInput: unknown,
  environmentInput: unknown,
  options: { requireAccount?: boolean; includeDecommissioned?: boolean } = {}
): Promise<ResolvedOperationalScope> {
  const references = stringList(accountInput)
  if (!references.length) {
    if (options.requireAccount) {
      throw new McpInputError('ACCOUNT_REQUIRED', 'Provide at least one account name or identifier.', {
        correctedExample: { account: 'it-aiops' }
      })
    }
    const environment = operationalEnvironment(environmentInput)
    return { environment, accounts: [], commercialAccountIds: [], operationalAccountIds: [], organizationWide: true }
  }

  const catalog = await getAllAccountsUnified(options.includeDecommissioned ?? true)
  const resolved = await Promise.all(references.map(reference => resolveAccountReference(reference, catalog)))
  const requestedEnvironment = environmentInput === undefined || String(environmentInput).toLowerCase() === 'auto'
    ? undefined
    : operationalEnvironment(environmentInput)
  const environment = requestedEnvironment || (resolved.every(account => ids(account).govcloud) ? 'govcloud' : 'commercial')

  const refs = resolved.map(account => {
    const accountIds = ids(account)
    const selectedAccountId = environment === 'govcloud' ? accountIds.govcloud : accountIds.commercial
    if (!selectedAccountId) {
      throw new McpInputError('ACCOUNT_ENVIRONMENT_MISSING', `${displayName(account)} has no ${environment} account.`, {
        account: displayName(account),
        environment,
        available: accountIds
      })
    }
    return {
      name: displayName(account),
      commercialAccountId: accountIds.commercial,
      govCloudAccountId: accountIds.govcloud,
      selectedAccountId,
      environment
    }
  })

  return {
    environment,
    accounts: refs,
    commercialAccountIds: [...new Set(refs.map(account => account.commercialAccountId).filter((id): id is string => Boolean(id)))],
    operationalAccountIds: [...new Set(refs.map(account => account.selectedAccountId))],
    organizationWide: false
  }
}

const RESOURCE_TYPE_ALIASES: Record<string, string> = {
  ec2: 'AWS::EC2::Instance', instance: 'AWS::EC2::Instance', instances: 'AWS::EC2::Instance',
  volume: 'AWS::EC2::Volume', volumes: 'AWS::EC2::Volume', ebs: 'AWS::EC2::Volume',
  bucket: 'AWS::S3::Bucket', buckets: 'AWS::S3::Bucket', s3: 'AWS::S3::Bucket',
  lambda: 'AWS::Lambda::Function', function: 'AWS::Lambda::Function',
  rds: 'AWS::RDS::DBInstance', database: 'AWS::RDS::DBInstance',
  vpc: 'AWS::EC2::VPC', subnet: 'AWS::EC2::Subnet',
  securitygroup: 'AWS::EC2::SecurityGroup', sg: 'AWS::EC2::SecurityGroup',
  dynamodb: 'AWS::DynamoDB::Table', table: 'AWS::DynamoDB::Table',
  stack: 'AWS::CloudFormation::Stack', cloudformation: 'AWS::CloudFormation::Stack',
  ecsservice: 'AWS::ECS::Service', ecscluster: 'AWS::ECS::Cluster'
}

export function resourceTypes(value: unknown): string[] {
  return stringList(value).map(type => {
    if (/^AWS::[A-Za-z0-9]+::[A-Za-z0-9]+$/.test(type)) return type
    const alias = RESOURCE_TYPE_ALIASES[normalized(type)]
    if (!alias) throw new McpInputError('UNKNOWN_RESOURCE_TYPE', `Unknown resource type ${JSON.stringify(type)}.`, {
      requested: type,
      acceptedAliases: Object.keys(RESOURCE_TYPE_ALIASES).sort(),
      correctedExample: 'AWS::EC2::Instance'
    })
    return alias
  })
}

export function enumList<T extends string>(value: unknown, accepted: readonly T[], name: string): T[] {
  const byNormalized = new Map(accepted.map(item => [normalized(item), item]))
  return stringList(value).map(item => {
    const match = byNormalized.get(normalized(item))
    if (!match) throw new McpInputError('INVALID_FILTER', `${name} contains unsupported value ${JSON.stringify(item)}.`, {
      parameter: name,
      requested: item,
      accepted
    })
    return match
  })
}
