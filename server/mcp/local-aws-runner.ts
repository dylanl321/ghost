export interface LocalAwsCommand {
  service: string
  operation: string
  region?: string
  output: 'json' | 'markdown' | 'csv' | 'text'
  input: Record<string, unknown>
}

function toPascalCase(value: string): string {
  return value.split('-').filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

function parseValue(values: string[]): unknown {
  if (values.length > 1) return values.map(value => parseValue([value]))
  const value = values[0] || ''
  if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']')) || value === 'true' || value === 'false' || value === 'null') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  return value
}

export function parseLocalAwsCommand(argv: string[]): LocalAwsCommand {
  const [service, operation, ...argumentsList] = argv
  if (!service || !operation || service.startsWith('-') || operation.startsWith('-')) {
    throw new Error('Usage: npm run ghost:aws -- <service> <operation> [--parameter value]')
  }

  let region: string | undefined
  let output: LocalAwsCommand['output'] = 'json'
  let input: Record<string, unknown> = {}

  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index]!
    if (argument === '--region') {
      region = argumentsList[++index]
      continue
    }
    if (argument === '--output') {
      const requested = argumentsList[++index]
      if (!requested || !['json', 'markdown', 'csv', 'text'].includes(requested)) {
        throw new Error('--output must be json, markdown, csv, or text')
      }
      output = requested as LocalAwsCommand['output']
      continue
    }
    if (argument === '--cli-input-json') {
      const json = argumentsList[++index]
      if (!json) throw new Error('--cli-input-json requires a JSON object')
      const parsed = JSON.parse(json)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('--cli-input-json must be a JSON object')
      input = { ...input, ...parsed }
      continue
    }
    if (!argument.startsWith('--')) throw new Error(`Unexpected argument: ${argument}`)

    const key = toPascalCase(argument.slice(2))
    const values: string[] = []
    while (argumentsList[index + 1] && !argumentsList[index + 1]!.startsWith('--')) values.push(argumentsList[++index]!)
    input[key] = values.length ? parseValue(values) : true
  }

  return { service, operation: toPascalCase(operation), region, output, input }
}

const SERVICE_SDKS: Record<string, { packageName: string; clientName: string }> = {
  athena: { packageName: '@aws-sdk/client-athena', clientName: 'AthenaClient' },
  cloudformation: { packageName: '@aws-sdk/client-cloudformation', clientName: 'CloudFormationClient' },
  cloudtrail: { packageName: '@aws-sdk/client-cloudtrail', clientName: 'CloudTrailClient' },
  cloudwatch: { packageName: '@aws-sdk/client-cloudwatch', clientName: 'CloudWatchClient' },
  'cloudwatch-logs': { packageName: '@aws-sdk/client-cloudwatch-logs', clientName: 'CloudWatchLogsClient' },
  config: { packageName: '@aws-sdk/client-config-service', clientName: 'ConfigServiceClient' },
  dynamodb: { packageName: '@aws-sdk/client-dynamodb', clientName: 'DynamoDBClient' },
  ec2: { packageName: '@aws-sdk/client-ec2', clientName: 'EC2Client' },
  iam: { packageName: '@aws-sdk/client-iam', clientName: 'IAMClient' },
  lambda: { packageName: '@aws-sdk/client-lambda', clientName: 'LambdaClient' },
  organizations: { packageName: '@aws-sdk/client-organizations', clientName: 'OrganizationsClient' },
  s3: { packageName: '@aws-sdk/client-s3', clientName: 'S3Client' },
  securityhub: { packageName: '@aws-sdk/client-securityhub', clientName: 'SecurityHubClient' },
  ssm: { packageName: '@aws-sdk/client-ssm', clientName: 'SSMClient' },
  sts: { packageName: '@aws-sdk/client-sts', clientName: 'STSClient' }
}

export function getAwsSdkDetails(service: string): { packageName: string; clientName: string } {
  const details = SERVICE_SDKS[service.toLowerCase()]
  if (!details) {
    throw new Error(`Unsupported service: ${service}. Use a GHOST-supported AWS SDK service.`)
  }
  return details
}
