/**
 * AWS Configuration Management
 * Handles both Commercial and GovCloud environments
 */

import type { AWSConfig, AWSEnvironment } from '../types'

export function getAWSConfig(): AWSConfig {
  const config: AWSConfig = {}

  // Commercial AWS Configuration
  if (process.env.AWS_COMMERCIAL_ACCESS_KEY_ID && process.env.AWS_COMMERCIAL_SECRET_ACCESS_KEY) {
    config.commercial = {
      type: 'commercial',
      region: process.env.AWS_COMMERCIAL_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_COMMERCIAL_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_COMMERCIAL_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_COMMERCIAL_SESSION_TOKEN
    }
  }

  // GovCloud AWS Configuration
  if (process.env.AWS_GOVCLOUD_ACCESS_KEY_ID && process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY) {
    config.govcloud = {
      type: 'govcloud',
      region: process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1',
      accessKeyId: process.env.AWS_GOVCLOUD_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_GOVCLOUD_SESSION_TOKEN
    }
  }

  return config
}

export function getEnvironmentConfig(environment: 'commercial' | 'govcloud'): AWSEnvironment | undefined {
  const config = getAWSConfig()
  return config[environment]
}

export function validateAWSConfig(): void {
  const config = getAWSConfig()
  
  if (!config.commercial && !config.govcloud) {
    throw new Error('No AWS credentials configured. Please set environment variables.')
  }
}