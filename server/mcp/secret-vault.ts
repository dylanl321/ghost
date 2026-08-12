import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { DecryptCommand, GenerateDataKeyCommand, KMSClient } from '@aws-sdk/client-kms'

interface EncryptedEnvelope {
  version: 1
  encryptedDataKey: string
  iv: string
  authTag: string
  ciphertext: string
}

function kmsKeyArn(): string | undefined {
  return process.env.GHOST_MCP_SECRET_KMS_KEY_ARN
}

function client(): KMSClient {
  return new KMSClient({ region: process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1' })
}

export function isMcpSecretVaultEnabled(): boolean {
  return Boolean(kmsKeyArn())
}

export async function encryptMcpSecret(value: string, context: Record<string, string>): Promise<string> {
  const keyArn = kmsKeyArn()
  if (!keyArn) throw new Error('MCP secret encryption is not configured.')
  const response = await client().send(new GenerateDataKeyCommand({
    KeyId: keyArn,
    KeySpec: 'AES_256',
    EncryptionContext: context
  }))
  if (!response.Plaintext || !response.CiphertextBlob) throw new Error('KMS did not return an MCP data key.')

  const dataKey = Buffer.from(response.Plaintext)
  try {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', dataKey, iv)
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    const envelope: EncryptedEnvelope = {
      version: 1,
      encryptedDataKey: Buffer.from(response.CiphertextBlob).toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64')
    }
    return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64')
  } finally {
    dataKey.fill(0)
  }
}

export async function decryptMcpSecret(value: string, context: Record<string, string>): Promise<string> {
  const keyArn = kmsKeyArn()
  if (!keyArn) throw new Error('MCP secret encryption is not configured.')
  const envelope = JSON.parse(Buffer.from(value, 'base64').toString('utf8')) as EncryptedEnvelope
  if (envelope.version !== 1) throw new Error('Unsupported MCP secret envelope version.')
  const response = await client().send(new DecryptCommand({
    KeyId: keyArn,
    CiphertextBlob: Buffer.from(envelope.encryptedDataKey, 'base64'),
    EncryptionContext: context
  }))
  if (!response.Plaintext) throw new Error('KMS did not return the MCP data key.')

  const dataKey = Buffer.from(response.Plaintext)
  try {
    const decipher = createDecipheriv('aes-256-gcm', dataKey, Buffer.from(envelope.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8')
  } finally {
    dataKey.fill(0)
  }
}
