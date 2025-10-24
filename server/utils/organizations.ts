/**
 * AWS Organizations Utility Functions
 * Handles organizational unit operations and account management
 */

import { getOrganizationsClient } from '../lib/aws-client-factory'
import type { AWSEnvironmentType } from '../types/aws'
import { logger } from './logger'

export interface OrganizationalUnit {
  id: string
  arn: string
  name: string
  parentId?: string
  children?: OrganizationalUnit[]
  accounts?: string[]
}

export interface OrganizationInfo {
  id: string
  arn: string
  featureSet: string
  masterAccountId: string
  masterAccountEmail: string
  masterAccountArn: string
  availablePolicyTypes?: any[]
}

/**
 * Get Organizations management account ID
 */
function getOrganizationsAccountId(environment: AWSEnvironmentType): string | undefined {
  const prefix = environment === 'commercial' ? 'AWS_COMMERCIAL' : 'AWS_GOVCLOUD'
  return process.env[`${prefix}_ORGANIZATIONS_ACCOUNT_ID`]
}

/**
 * Get organization information
 */
export async function getOrganizationInfo(
  environment: AWSEnvironmentType = 'commercial'
): Promise<OrganizationInfo | null> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    // Organizations is a global service - use the correct region for each partition
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)
    
    const { DescribeOrganizationCommand } = await import('@aws-sdk/client-organizations')
    const response = await client.send(new DescribeOrganizationCommand({}))
    
    if (!response.Organization) return null
    
    return {
      id: response.Organization.Id!,
      arn: response.Organization.Arn!,
      featureSet: response.Organization.FeatureSet!,
      masterAccountId: response.Organization.MasterAccountId!,
      masterAccountEmail: response.Organization.MasterAccountEmail!,
      masterAccountArn: response.Organization.MasterAccountArn!,
      availablePolicyTypes: response.Organization.AvailablePolicyTypes
    }
  } catch (error) {
    logger.error('Failed to get organization info:', error)
    return null
  }
}

/**
 * List all organizational units
 */
export async function listOrganizationalUnits(
  parentId: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<OrganizationalUnit[]> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)
    
    const { ListOrganizationalUnitsForParentCommand } = await import('@aws-sdk/client-organizations')
    const ous: OrganizationalUnit[] = []
    let nextToken: string | undefined
    
    do {
      const response = await client.send(
        new ListOrganizationalUnitsForParentCommand({ 
          ParentId: parentId,
          NextToken: nextToken 
        })
      )
      
      if (response.OrganizationalUnits) {
        for (const ou of response.OrganizationalUnits) {
          ous.push({
            id: ou.Id!,
            arn: ou.Arn!,
            name: ou.Name!,
            parentId: parentId
          })
        }
      }
      
      nextToken = response.NextToken
    } while (nextToken)
    
    return ous
  } catch (error) {
    logger.error(`Failed to list OUs for parent ${parentId}:`, error)
    return []
  }
}

/**
 * Get organizational unit tree
 */
export async function getOrganizationalUnitTree(
  environment: AWSEnvironmentType = 'commercial'
): Promise<OrganizationalUnit | null> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)
    
    // Get root ID
    const { ListRootsCommand } = await import('@aws-sdk/client-organizations')
    const rootsResponse = await client.send(new ListRootsCommand({}))
    
    if (!rootsResponse.Roots || rootsResponse.Roots.length === 0) {
      return null
    }
    
    const root = rootsResponse.Roots[0]
    
    // Build tree recursively
    async function buildTree(parentId: string): Promise<OrganizationalUnit> {
      const ous = await listOrganizationalUnits(parentId, environment)
      const accounts = await listAccountsInOU(parentId, environment)
      
      const node: OrganizationalUnit = {
        id: parentId,
        arn: parentId === root.Id ? root.Arn! : '',
        name: parentId === root.Id ? root.Name! : '',
        accounts: accounts.map(a => a.Id!),
        children: []
      }
      
      // Recursively get children
      for (const ou of ous) {
        const child = await buildTree(ou.id)
        child.name = ou.name
        child.arn = ou.arn
        node.children!.push(child)
      }
      
      return node
    }
    
    return await buildTree(root.Id!)
  } catch (error) {
    logger.error('Failed to get OU tree:', error)
    return null
  }
}

/**
 * List accounts in an organizational unit
 */
export async function listAccountsInOU(
  ouId: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<any[]> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)
    
    const { ListAccountsForParentCommand } = await import('@aws-sdk/client-organizations')
    const accounts: any[] = []
    let nextToken: string | undefined
    
    do {
      const response = await client.send(
        new ListAccountsForParentCommand({ 
          ParentId: ouId,
          NextToken: nextToken 
        })
      )
      
      if (response.Accounts) {
        accounts.push(...response.Accounts)
      }
      
      nextToken = response.NextToken
    } while (nextToken)
    
    return accounts
  } catch (error) {
    logger.error(`Failed to list accounts in OU ${ouId}:`, error)
    return []
  }
}

/**
 * Get account's organizational unit
 */
export async function getAccountOU(
  accountId: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<OrganizationalUnit | null> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)
    
    const { ListParentsCommand } = await import('@aws-sdk/client-organizations')
    const response = await client.send(
      new ListParentsCommand({ ChildId: accountId })
    )
    
    if (!response.Parents || response.Parents.length === 0) {
      return null
    }
    
    const parent = response.Parents[0]
    
    // Get OU details
    const { DescribeOrganizationalUnitCommand } = await import('@aws-sdk/client-organizations')
    const ouResponse = await client.send(
      new DescribeOrganizationalUnitCommand({ 
        OrganizationalUnitId: parent.Id! 
      })
    )
    
    if (!ouResponse.OrganizationalUnit) return null
    
    return {
      id: ouResponse.OrganizationalUnit.Id!,
      arn: ouResponse.OrganizationalUnit.Arn!,
      name: ouResponse.OrganizationalUnit.Name!
    }
  } catch (error) {
    logger.error(`Failed to get OU for account ${accountId}:`, error)
    return null
  }
}

/**
 * Move account to a different organizational unit
 */
export async function moveAccount(
  accountId: string,
  sourceOuId: string,
  targetOuId: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<boolean> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)
    
    const { MoveAccountCommand } = await import('@aws-sdk/client-organizations')
    await client.send(new MoveAccountCommand({
      AccountId: accountId,
      SourceParentId: sourceOuId,
      DestinationParentId: targetOuId
    }))
    
    return true
  } catch (error) {
    logger.error(`Failed to move account ${accountId}:`, error)
    return false
  }
}

/**
 * Create a new organizational unit
 */
export async function createOrganizationalUnit(
  parentId: string,
  name: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<OrganizationalUnit | null> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)
    
    const { CreateOrganizationalUnitCommand } = await import('@aws-sdk/client-organizations')
    const response = await client.send(new CreateOrganizationalUnitCommand({
      ParentId: parentId,
      Name: name
    }))
    
    if (!response.OrganizationalUnit) return null
    
    return {
      id: response.OrganizationalUnit.Id!,
      arn: response.OrganizationalUnit.Arn!,
      name: response.OrganizationalUnit.Name!,
      parentId: parentId
    }
  } catch (error) {
    logger.error(`Failed to create OU ${name}:`, error)
    return null
  }
}

/**
 * Get service control policies for an account
 */
export async function getAccountPolicies(
  accountId: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<any[]> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)
    
    const { ListPoliciesForTargetCommand } = await import('@aws-sdk/client-organizations')
    const policies: any[] = []
    let nextToken: string | undefined
    
    do {
      const response = await client.send(
        new ListPoliciesForTargetCommand({
          TargetId: accountId,
          Filter: 'SERVICE_CONTROL_POLICY',
          NextToken: nextToken
        })
      )
      
      if (response.Policies) {
        policies.push(...response.Policies)
      }
      
      nextToken = response.NextToken
    } while (nextToken)
    
    return policies
  } catch (error) {
    logger.error(`Failed to get policies for account ${accountId}:`, error)
    return []
  }
}

/**
 * Get full policy document with statements
 */
export async function getPolicyDocument(
  policyId: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<any | null> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)

    const { DescribePolicyCommand } = await import('@aws-sdk/client-organizations')
    const response = await client.send(
      new DescribePolicyCommand({
        PolicyId: policyId
      })
    )

    if (!response.Policy) return null

    // Parse the policy content JSON
    const policyContent = response.Policy.Content
      ? JSON.parse(response.Policy.Content)
      : null

    return {
      id: response.Policy.PolicySummary?.Id,
      arn: response.Policy.PolicySummary?.Arn,
      name: response.Policy.PolicySummary?.Name,
      description: response.Policy.PolicySummary?.Description,
      type: response.Policy.PolicySummary?.Type,
      awsManaged: response.Policy.PolicySummary?.AwsManaged,
      content: policyContent
    }
  } catch (error) {
    logger.error(`Failed to get policy document for ${policyId}:`, error)
    return null
  }
}

/**
 * Get policies attached to a target (account or OU)
 */
export async function getAttachedPolicies(
  targetId: string,
  targetType: 'ACCOUNT' | 'ORGANIZATIONAL_UNIT',
  environment: AWSEnvironmentType = 'commercial'
): Promise<any[]> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)

    const { ListPoliciesForTargetCommand } = await import('@aws-sdk/client-organizations')
    const policies: any[] = []
    let nextToken: string | undefined

    do {
      const response = await client.send(
        new ListPoliciesForTargetCommand({
          TargetId: targetId,
          Filter: 'SERVICE_CONTROL_POLICY',
          NextToken: nextToken
        })
      )

      if (response.Policies) {
        policies.push(...response.Policies.map(policy => ({
          id: policy.Id,
          name: policy.Name,
          description: policy.Description,
          type: policy.Type,
          arn: policy.Arn
        })))
      }
      
      nextToken = response.NextToken
    } while (nextToken)
    
    return policies
  } catch (error) {
    logger.error(`Failed to get policies for ${targetType} ${targetId}:`, error)
    return []
  }
}

/**
 * Tag an account in Organizations
 */
export async function tagAccount(
  accountId: string,
  tags: Record<string, string>,
  environment: AWSEnvironmentType = 'commercial'
): Promise<boolean> {
  try {
    const orgAccountId = getOrganizationsAccountId(environment)
    const region = environment === 'commercial' ? 'us-east-1' : 'us-gov-west-1'
    const client = await getOrganizationsClient(environment, region, orgAccountId)
    
    const { TagResourceCommand } = await import('@aws-sdk/client-organizations')
    const tagList = Object.entries(tags).map(([key, value]) => ({
      Key: key,
      Value: value
    }))
    
    await client.send(new TagResourceCommand({
      ResourceId: accountId,
      Tags: tagList
    }))
    
    return true
  } catch (error) {
    logger.error(`Failed to tag account ${accountId}:`, error)
    return false
  }
}