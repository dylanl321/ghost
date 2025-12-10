// =============================================================================
// Resource Counts (Simplified Summary)
// =============================================================================

export interface ResourceCounts {
  ec2?: {
    total: number;
    stopped?: number;
    windows?: number;
  };
  volumes?: {
    total: number;
    totalSizeGB: number;
    gp2?: number;
    gp3?: number;
    io1?: number;
  };
  ecsContainers?: {
    total: number;
  };
  eksClusters?: {
    total: number;
  };
  buckets?: {
    total: number;
    versioned?: number;
  };
  lambda?: {
    total: number;
  };
  rds?: {
    total: number;
  };
  metadata?: {
    accountId: string;
    timestamp: string;
  };
}

// =============================================================================
// AWS Config API Types
// =============================================================================

export type AWSResourceType =
  | 'AWS::EC2::Instance'
  | 'AWS::EC2::Volume'
  | 'AWS::EC2::SecurityGroup'
  | 'AWS::EC2::VPC'
  | 'AWS::EC2::Subnet'
  | 'AWS::S3::Bucket'
  | 'AWS::RDS::DBInstance'
  | 'AWS::Lambda::Function'
  | 'AWS::DynamoDB::Table'
  | 'AWS::IAM::Role'
  | 'AWS::IAM::User'
  | 'AWS::IAM::Policy'
  | 'AWS::ECS::Cluster'
  | 'AWS::EKS::Cluster'
  | 'AWS::AutoScaling::AutoScalingGroup'
  | 'AWS::ElasticLoadBalancingV2::LoadBalancer'
  | 'AWS::CloudFormation::Stack'
  | string // Allow other types

export type ResponseDetailLevel = 'simple' | 'partial' | 'full'

export type ScanMode = 'quick' | 'standard' | 'full'

export interface ConfigResource {
  resourceId: string
  resourceType: AWSResourceType
  resourceName?: string
  accountId: string
  accountName?: string
  region: string
  arn?: string
  creationTime?: string
  tags?: Record<string, string>
  configuration?: any
  optimization?: ResourceOptimization
}

export interface ResourceOptimization {
  finding: 'Optimized' | 'Underprovisioned' | 'Overprovisioned' | 'NotOptimized'
  findingReasonCodes?: string[]
  estimatedMonthlySavings?: number
  recommendations?: OptimizationRecommendation[]
}

export interface OptimizationRecommendation {
  code: string
  description: string
  impact?: 'High' | 'Medium' | 'Low'
  currentConfiguration?: any
  recommendedConfiguration?: any
}

export interface ConfigResourcesResponse {
  resources: ConfigResource[]
  summary: {
    totalResources: number
    byAccount: Record<string, number>
    byRegion: Record<string, number>
    byType: Record<string, number>
    tagCoverage: number
    oldestResource?: string
    newestResource?: string
    optimizationSummary?: {
      totalOptimized: number
      totalUnderprovisioned: number
      totalOverprovisioned: number
      totalNotOptimized: number
      potentialMonthlySavings: number
      optimizationPercentage: number
    }
  }
  aiAnalysis?: {
    summary: string
    recommendations: string[]
    riskFactors: string[]
  }
  pagination: {
    nextToken?: string
    hasMore: boolean
    currentPageSize: number
    runningTotal: number
  }
}

export interface ConfigSummaryResponse {
  summary: {
    totalResources: number
    totalAccounts: number
    totalRegions: number
    resourceTypes: number
    tagCoverage: number
    oldestResource?: string
    newestResource?: string
  }
  topResourceTypes: Array<{
    type: string
    count: number
    percentage: number
    limitReached?: boolean
  }>
  ageDistribution?: {
    lessThan30Days: number
    between30And90Days: number
    between90And180Days: number
    between180And365Days: number
    moreThan365Days: number
  }
  byAccount?: Record<string, number>
  byRegion?: Record<string, number>
  byType?: Record<
    string,
    {
      count: number
      accounts?: string[]
      regions?: string[]
    }
  >
  performance: {
    queryTime: number
    scanMode: ScanMode
    resourceTypesQueried: number
    totalQueriesMade: number
    cached: boolean
  }
}

// =============================================================================
// Query Parameters
// =============================================================================

export interface ConfigResourcesQueryParams {
  environment?: 'commercial' | 'govcloud'
  resourceType?: AWSResourceType
  accountIds?: string
  linesOfBusiness?: string
  departments?: string
  includeDecommissioned?: boolean
  region?: string
  tags?: string
  resourceName?: string
  responseDetail?: ResponseDetailLevel
  includeOptimization?: boolean
  includeAiAnalysis?: boolean
  aiModel?: 'nova-pro' | 'claude-sonnet'
  limit?: number
  nextToken?: string
}

export interface ConfigSummaryQueryParams {
  environment?: 'commercial' | 'govcloud'
  accountIds?: string
  linesOfBusiness?: string
  departments?: string
  includeDecommissioned?: boolean
  region?: string
  includeDetails?: boolean
  scanMode?: ScanMode
  maxResourcesPerType?: number
}

export interface ConfigSummarySimplifiedQueryParams {
  environment?: 'commercial' | 'govcloud'
  account_id?: string
  govcloud_account_id?: string // Deprecated, kept for backward compatibility
}