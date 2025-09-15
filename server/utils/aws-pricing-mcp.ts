/**
 * AWS Pricing MCP Server Integration
 * Provides AWS pricing tools for AI models via Model Context Protocol
 * Based on: https://github.com/awslabs/mcp/tree/main/src/aws-pricing-mcp-server
 */

import { getPricingClient } from '../lib/aws-client-factory'
import type { AWSEnvironmentType } from '../types'

export interface PricingService {
  serviceCode: string
  serviceName: string
  description: string
}

export interface PricingDimension {
  dimension: string
  description: string
  unit: string
}

export interface PricingAttribute {
  attributeName: string
  attributeValues: string[]
}

export interface PricingFilter {
  type: string
  field: string
  value: string
}

export interface PricingRequest {
  serviceCode: string
  filters?: PricingFilter[]
  formatVersion?: string
  nextToken?: string
  maxResults?: number
}

export interface PricingResponse {
  formatVersion: string
  priceList: any[]
  nextToken?: string
}

/**
 * Get available AWS services for pricing
 */
export async function getPricingServices(
  environment: AWSEnvironmentType = 'commercial'
): Promise<PricingService[]> {
  try {
    const pricingClient = await getPricingClient(environment, 'us-east-1') // Pricing API is only available in us-east-1
    
    const command = new (await import('@aws-sdk/client-pricing')).DescribeServicesCommand({
      formatVersion: 'aws_v1',
      maxResults: 100
    })

    const response = await pricingClient.send(command)
    
    return response.services?.map(service => ({
      serviceCode: service.serviceCode || '',
      serviceName: service.serviceName || '',
      description: service.description || ''
    })) || []
  } catch (error: any) {
    console.error('[AWS Pricing MCP] Error getting services:', error)
    throw new Error(`Failed to get pricing services: ${error.message}`)
  }
}

/**
 * Get pricing dimensions for a specific service
 */
export async function getPricingDimensions(
  serviceCode: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<PricingDimension[]> {
  try {
    const pricingClient = await getPricingClient(environment, 'us-east-1')
    
    const command = new (await import('@aws-sdk/client-pricing')).DescribeServicesCommand({
      serviceCode,
      formatVersion: 'aws_v1'
    })

    const response = await pricingClient.send(command)
    const service = response.services?.[0]
    
    return service?.attributeNames?.map(attr => ({
      dimension: attr,
      description: `Attribute: ${attr}`,
      unit: 'varies'
    })) || []
  } catch (error: any) {
    console.error('[AWS Pricing MCP] Error getting dimensions:', error)
    throw new Error(`Failed to get pricing dimensions for ${serviceCode}: ${error.message}`)
  }
}

/**
 * Get pricing attributes for a specific service
 */
export async function getPricingAttributes(
  serviceCode: string,
  attributeName: string,
  environment: AWSEnvironmentType = 'commercial'
): Promise<PricingAttribute> {
  try {
    const pricingClient = await getPricingClient(environment, 'us-east-1')
    
    const command = new (await import('@aws-sdk/client-pricing')).GetAttributeValuesCommand({
      serviceCode,
      attributeName,
      maxResults: 100
    })

    const response = await pricingClient.send(command)
    
    return {
      attributeName,
      attributeValues: response.attributeValues?.map(attr => attr.value || '') || []
    }
  } catch (error: any) {
    console.error('[AWS Pricing MCP] Error getting attributes:', error)
    throw new Error(`Failed to get pricing attributes for ${serviceCode}: ${error.message}`)
  }
}

/**
 * Get pricing information for a specific service
 */
export async function getPricing(
  request: PricingRequest,
  environment: AWSEnvironmentType = 'commercial'
): Promise<PricingResponse> {
  try {
    const pricingClient = await getPricingClient(environment, 'us-east-1')
    
    const command = new (await import('@aws-sdk/client-pricing')).GetProductsCommand({
      serviceCode: request.serviceCode,
      filters: request.filters,
      formatVersion: request.formatVersion || 'aws_v1',
      nextToken: request.nextToken,
      maxResults: request.maxResults || 100
    })

    const response = await pricingClient.send(command)
    
    return {
      formatVersion: request.formatVersion || 'aws_v1',
      priceList: response.priceList?.map(item => {
        try {
          return typeof item === 'string' ? JSON.parse(item) : item
        } catch {
          return item
        }
      }) || [],
      nextToken: response.nextToken
    }
  } catch (error: any) {
    console.error('[AWS Pricing MCP] Error getting pricing:', error)
    throw new Error(`Failed to get pricing for ${request.serviceCode}: ${error.message}`)
  }
}

/**
 * MCP Tools for AWS Pricing
 * These tools can be used by AI models to get AWS pricing information
 */
export const awsPricingMCPTools = {
  /**
   * Get list of available AWS services for pricing
   */
  get_services: {
    name: 'get_services',
    description: 'Get list of available AWS services for pricing information',
    inputSchema: {
      type: 'object',
      properties: {
        environment: {
          type: 'string',
          enum: ['commercial', 'govcloud'],
          description: 'AWS environment to query',
          default: 'commercial'
        }
      }
    }
  },

  /**
   * Get pricing dimensions for a service
   */
  get_dimensions: {
    name: 'get_dimensions',
    description: 'Get pricing dimensions/attributes for a specific AWS service',
    inputSchema: {
      type: 'object',
      required: ['serviceCode'],
      properties: {
        serviceCode: {
          type: 'string',
          description: 'AWS service code (e.g., AmazonEC2, AmazonS3)'
        },
        environment: {
          type: 'string',
          enum: ['commercial', 'govcloud'],
          description: 'AWS environment to query',
          default: 'commercial'
        }
      }
    }
  },

  /**
   * Get attribute values for a service
   */
  get_attribute_values: {
    name: 'get_attribute_values',
    description: 'Get possible values for a specific attribute of an AWS service',
    inputSchema: {
      type: 'object',
      required: ['serviceCode', 'attributeName'],
      properties: {
        serviceCode: {
          type: 'string',
          description: 'AWS service code (e.g., AmazonEC2, AmazonS3)'
        },
        attributeName: {
          type: 'string',
          description: 'Attribute name to get values for'
        },
        environment: {
          type: 'string',
          enum: ['commercial', 'govcloud'],
          description: 'AWS environment to query',
          default: 'commercial'
        }
      }
    }
  },

  /**
   * Get pricing information
   */
  get_pricing: {
    name: 'get_pricing',
    description: 'Get detailed pricing information for AWS services',
    inputSchema: {
      type: 'object',
      required: ['serviceCode'],
      properties: {
        serviceCode: {
          type: 'string',
          description: 'AWS service code (e.g., AmazonEC2, AmazonS3)'
        },
        filters: {
          type: 'array',
          description: 'Filters to apply to pricing query',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              field: { type: 'string' },
              value: { type: 'string' }
            }
          }
        },
        environment: {
          type: 'string',
          enum: ['commercial', 'govcloud'],
          description: 'AWS environment to query',
          default: 'commercial'
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 100
        }
      }
    }
  }
}

/**
 * Execute MCP tool for AWS pricing
 */
export async function executePricingMCPTool(
  toolName: string,
  parameters: any,
  environment: AWSEnvironmentType = 'commercial'
): Promise<any> {
  console.log(`[MCP Tool] Executing tool: ${toolName} with parameters:`, parameters)
  
  try {
    let result: any
    
    switch (toolName) {
      case 'get_services':
        result = await getPricingServices(parameters.environment || environment)
        console.log(`[MCP Tool] get_services returned ${result?.length || 0} services`)
        return result
      
      case 'get_dimensions':
        result = await getPricingDimensions(
          parameters.serviceCode,
          parameters.environment || environment
        )
        console.log(`[MCP Tool] get_dimensions returned ${result?.length || 0} dimensions for ${parameters.serviceCode}`)
        return result
      
      case 'get_attribute_values':
        result = await getPricingAttributes(
          parameters.serviceCode,
          parameters.attributeName,
          parameters.environment || environment
        )
        console.log(`[MCP Tool] get_attribute_values returned ${result?.length || 0} values for ${parameters.serviceCode}.${parameters.attributeName}`)
        return result
      
      case 'get_pricing':
        result = await getPricing(
          {
            serviceCode: parameters.serviceCode,
            filters: parameters.filters,
            maxResults: parameters.maxResults
          },
          parameters.environment || environment
        )
        console.log(`[MCP Tool] get_pricing returned ${result?.priceList?.length || 0} prices for ${parameters.serviceCode}`)
        return result
      
      default:
        throw new Error(`Unknown MCP tool: ${toolName}`)
    }
  } catch (error: any) {
    console.error(`[AWS Pricing MCP] Error executing tool ${toolName}:`, error)
    throw error
  }
}

/**
 * Get MCP tools description for AI models
 */
export function getMCPToolsDescription(): string {
  return `
AWS Pricing MCP Tools Available:

1. get_services - Get list of available AWS services for pricing
2. get_dimensions - Get pricing dimensions/attributes for a specific service  
3. get_attribute_values - Get possible values for a service attribute
4. get_pricing - Get detailed pricing information for AWS services

These tools allow you to query AWS pricing information to help users with cost analysis, 
budget planning, and service comparison. Use these tools when users ask about:
- AWS service costs
- Pricing comparisons
- Budget planning
- Cost optimization recommendations
- Service pricing details
`
}
