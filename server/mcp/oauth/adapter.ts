import { deleteItem, getItem, putItem, queryItems } from '../../utils/dynamodb'
import { getOAuthTableConfig } from '../config'

interface StoredArtifact {
  artifactId: string
  model: string
  payload: Record<string, any>
  grantId?: string
  userCode?: string
  uid?: string
  ttl?: number
}

export class DynamoOidcAdapter {
  constructor(private readonly model: string) {}

  private key(id: string) {
    return { artifactId: `${this.model}#${id}` }
  }

  async upsert(id: string, payload: Record<string, any>, expiresIn?: number): Promise<void> {
    const config = getOAuthTableConfig()
    const artifact: StoredArtifact = {
      ...this.key(id),
      model: this.model,
      payload,
      grantId: payload.grantId,
      userCode: payload.userCode,
      uid: payload.uid,
      ttl: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : undefined
    }
    await putItem(config.tableName, artifact, config.environment)
  }

  async find(id: string): Promise<Record<string, any> | undefined> {
    const config = getOAuthTableConfig()
    const artifact = await getItem(config.tableName, this.key(id), config.environment) as StoredArtifact | null
    if (!artifact || (artifact.ttl && artifact.ttl <= Math.floor(Date.now() / 1000))) return undefined
    return artifact.payload
  }

  async findByUserCode(userCode: string): Promise<Record<string, any> | undefined> {
    return this.findByIndex('UserCodeIndex', 'userCode', userCode)
  }

  async findByUid(uid: string): Promise<Record<string, any> | undefined> {
    return this.findByIndex('UidIndex', 'uid', uid)
  }

  private async findByIndex(indexName: string, field: string, value: string): Promise<Record<string, any> | undefined> {
    const config = getOAuthTableConfig()
    const result = await queryItems({
      tableName: config.tableName,
      indexName,
      queryExpression: '#field = :value',
      expressionAttributeNames: { '#field': field },
      expressionAttributeValues: { ':value': value },
      limit: 1
    }, config.environment)
    const artifact = result.items[0] as StoredArtifact | undefined
    return artifact?.payload
  }

  async consume(id: string): Promise<void> {
    const payload = await this.find(id)
    if (payload) await this.upsert(id, { ...payload, consumed: Math.floor(Date.now() / 1000) }, payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : undefined)
  }

  async destroy(id: string): Promise<void> {
    const config = getOAuthTableConfig()
    await deleteItem(config.tableName, this.key(id), config.environment)
  }

  async revokeByGrantId(grantId: string): Promise<void> {
    const config = getOAuthTableConfig()
    let nextToken: string | undefined
    do {
      const result = await queryItems({
        tableName: config.tableName,
        indexName: 'GrantIdIndex',
        queryExpression: 'grantId = :grantId',
        expressionAttributeValues: { ':grantId': grantId },
        limit: 100,
        nextToken
      }, config.environment)
      await Promise.all(result.items.map((item: Record<string, any>) => deleteItem(config.tableName, { artifactId: item.artifactId }, config.environment)))
      nextToken = result.nextToken
    } while (nextToken)
  }
}
