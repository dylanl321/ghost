import assert from 'node:assert/strict'
import test from 'node:test'
import { getAwsSdkDetails, parseLocalAwsCommand } from '../../server/mcp/local-aws-runner'

test('parses AWS CLI-style operation arguments without using a local profile', () => {
  const command = parseLocalAwsCommand([
    'ec2', 'describe-instances', '--instance-ids', 'i-123', 'i-456', '--max-results', '5', '--region', 'us-east-1', '--output', 'csv'
  ])
  assert.deepEqual(command, {
    service: 'ec2', operation: 'DescribeInstances', region: 'us-east-1', output: 'csv',
    input: { InstanceIds: ['i-123', 'i-456'], MaxResults: 5 }
  })
  assert.deepEqual(getAwsSdkDetails('ec2'), { packageName: '@aws-sdk/client-ec2', clientName: 'EC2Client' })
})
