import { getAwsSdkDetails, parseLocalAwsCommand } from '../server/mcp/local-aws-runner'
import { renderGhostOutput } from '../server/mcp/output-format'

async function main() {
  const command = parseLocalAwsCommand(process.argv.slice(2))
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const sessionToken = process.env.AWS_SESSION_TOKEN
  if (!accessKeyId || !secretAccessKey || !sessionToken) {
    throw new Error('Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_SESSION_TOKEN from ghost.credentials.issue for this command only.')
  }

  const details = getAwsSdkDetails(command.service)
  const sdk = await import(details.packageName) as Record<string, any>
  const Client = sdk[details.clientName]
  const Command = sdk[`${command.operation}Command`]
  if (!Client || !Command) {
    throw new Error(`The ${command.service} ${command.operation} operation is not available in this GHOST AWS SDK runner.`)
  }

  const client = new Client({
    region: command.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
    credentials: { accessKeyId, secretAccessKey, sessionToken }
  })
  const result = await client.send(new Command(command.input))
  process.stdout.write(`${renderGhostOutput(result, command.output).content}\n`)
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
