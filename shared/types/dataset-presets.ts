/**
 * Dataset Report Presets
 * Pre-configured queries for common security, compliance, and operational use cases
 */

import type { DatasetSelection } from './dataset-reports'

export interface DatasetPreset {
  id: string
  name: string
  description: string
  category: 'security' | 'network' | 'compliance' | 'access' | 'operations'
  icon: string
  datasets: DatasetSelection
  // Optional: suggest specific accounts or formats
  suggestedFormat?: 'pdf' | 'xlsx' | 'csv' | 'json'
  enableAI?: boolean
}

/**
 * Pre-configured dataset report presets
 */
export const DATASET_PRESETS: DatasetPreset[] = [
  // ============================================================================
  // SECURITY PRESETS
  // ============================================================================
  {
    id: 'public-ec2-instances',
    name: 'Public EC2 Instances',
    description: 'All EC2 instances with public IP addresses',
    category: 'security',
    icon: 'i-heroicons-server',
    suggestedFormat: 'xlsx',
    datasets: {
      config: {
        enabled: true,
        filters: {
          resourceTypes: ['AWS::EC2::Instance'],
          regions: [],
          quickFilters: {
            publicIpOnly: true
          }
        }
      }
    }
  },
  {
    id: 'public-s3-buckets',
    name: 'Publicly Accessible S3 Buckets',
    description: 'S3 buckets with public access enabled',
    category: 'security',
    icon: 'i-heroicons-cloud',
    suggestedFormat: 'xlsx',
    datasets: {
      config: {
        enabled: true,
        filters: {
          resourceTypes: ['AWS::S3::Bucket'],
          regions: [],
          quickFilters: {
            publicAccessEnabled: true
          }
        }
      }
    }
  },
  {
    id: 'security-groups-wide-open',
    name: 'Security Groups with 0.0.0.0/0',
    description: 'Security groups allowing access from any IP address',
    category: 'security',
    icon: 'i-heroicons-shield-exclamation',
    suggestedFormat: 'xlsx',
    datasets: {
      config: {
        enabled: true,
        filters: {
          resourceTypes: ['AWS::EC2::SecurityGroup'],
          regions: [],
          quickFilters: {
            openToInternet: true
          }
        }
      }
    }
  },
  {
    id: 'critical-security-findings',
    name: 'Critical Security Findings',
    description: 'All critical and high severity security findings',
    category: 'security',
    icon: 'i-heroicons-exclamation-triangle',
    suggestedFormat: 'pdf',
    enableAI: true,
    datasets: {
      securityHub: {
        enabled: true,
        filters: {
          severities: ['CRITICAL', 'HIGH'],
          statuses: ['NEW', 'NOTIFIED'],
          lookbackDays: 30
        }
      }
    }
  },
  {
    id: 'unencrypted-volumes',
    name: 'Unencrypted EBS Volumes',
    description: 'EBS volumes without encryption enabled',
    category: 'security',
    icon: 'i-heroicons-lock-open',
    suggestedFormat: 'xlsx',
    datasets: {
      config: {
        enabled: true,
        filters: {
          resourceTypes: ['AWS::EC2::Volume'],
          regions: [],
          quickFilters: {
            unencryptedOnly: true
          }
        }
      }
    }
  },
  {
    id: 'iam-users-no-mfa',
    name: 'IAM Users Without MFA',
    description: 'IAM users that do not have MFA enabled',
    category: 'security',
    icon: 'i-heroicons-user-circle',
    suggestedFormat: 'xlsx',
    datasets: {
      config: {
        enabled: true,
        filters: {
          resourceTypes: ['AWS::IAM::User'],
          regions: [],
          quickFilters: {
            noMfaOnly: true
          }
        }
      }
    }
  },

  // ============================================================================
  // NETWORK PRESETS
  // ============================================================================
  {
    id: 'internet-gateways',
    name: 'All Internet Gateways',
    description: 'Complete inventory of internet gateways across the organization',
    category: 'network',
    icon: 'i-heroicons-globe-alt',
    suggestedFormat: 'xlsx',
    datasets: {
      config: {
        enabled: true,
        filters: {
          resourceTypes: ['AWS::EC2::InternetGateway'],
          regions: []
        }
      }
    }
  },
  {
    id: 'nat-gateways',
    name: 'All NAT Gateways',
    description: 'Inventory of NAT gateways and their configurations',
    category: 'network',
    icon: 'i-heroicons-arrow-path',
    suggestedFormat: 'xlsx',
    datasets: {
      config: {
        enabled: true,
        filters: {
          resourceTypes: ['AWS::EC2::NatGateway'],
          regions: []
        }
      }
    }
  },
  {
    id: 'vpc-inventory',
    name: 'VPC Inventory',
    description: 'All VPCs and their CIDR blocks',
    category: 'network',
    icon: 'i-heroicons-square-3-stack-3d',
    suggestedFormat: 'xlsx',
    datasets: {
      config: {
        enabled: true,
        filters: {
          resourceTypes: ['AWS::EC2::VPC'],
          regions: []
        }
      }
    }
  },
  {
    id: 'elastic-ips',
    name: 'Elastic IP Addresses',
    description: 'All allocated Elastic IPs and their associations',
    category: 'network',
    icon: 'i-heroicons-map-pin',
    suggestedFormat: 'xlsx',
    datasets: {
      config: {
        enabled: true,
        filters: {
          resourceTypes: ['AWS::EC2::EIP'],
          regions: []
        }
      }
    }
  },
  {
    id: 'load-balancers',
    name: 'Load Balancer Inventory',
    description: 'All load balancers (ALB, NLB, CLB)',
    category: 'network',
    icon: 'i-heroicons-arrows-right-left',
    suggestedFormat: 'xlsx',
    datasets: {
      config: {
        enabled: true,
        filters: {
          resourceTypes: [
            'AWS::ElasticLoadBalancing::LoadBalancer',
            'AWS::ElasticLoadBalancingV2::LoadBalancer'
          ],
          regions: []
        }
      }
    }
  },

  // ============================================================================
  // COMPLIANCE PRESETS
  // ============================================================================
  {
    id: 'non-compliant-resources',
    name: 'Non-Compliant Resources',
    description: 'All resources failing compliance checks',
    category: 'compliance',
    icon: 'i-heroicons-x-circle',
    suggestedFormat: 'pdf',
    enableAI: true,
    datasets: {
      config: {
        enabled: true,
        filters: {
          complianceStatus: ['NON_COMPLIANT'],
          complianceOnly: true
        }
      }
    }
  },
  {
    id: 'cis-benchmark-findings',
    name: 'CIS Benchmark Findings',
    description: 'Security Hub findings for CIS AWS Foundations Benchmark',
    category: 'compliance',
    icon: 'i-heroicons-clipboard-document-check',
    suggestedFormat: 'pdf',
    enableAI: true,
    datasets: {
      securityHub: {
        enabled: true,
        filters: {
          complianceStandards: ['cis-aws-foundations-benchmark'],
          statuses: ['NEW', 'NOTIFIED'],
          lookbackDays: 30
        }
      }
    }
  },
  {
    id: 'pci-dss-findings',
    name: 'PCI-DSS Compliance Findings',
    description: 'Security findings related to PCI-DSS compliance',
    category: 'compliance',
    icon: 'i-heroicons-credit-card',
    suggestedFormat: 'pdf',
    enableAI: true,
    datasets: {
      securityHub: {
        enabled: true,
        filters: {
          complianceStandards: ['pci-dss'],
          statuses: ['NEW', 'NOTIFIED'],
          lookbackDays: 30
        }
      }
    }
  },

  // ============================================================================
  // ACCESS CONTROL PRESETS
  // ============================================================================
  {
    id: 'admin-user-access',
    name: 'Admin User Access Report',
    description: 'All users with administrative access to AWS accounts',
    category: 'access',
    icon: 'i-heroicons-shield-check',
    suggestedFormat: 'xlsx',
    datasets: {
      entraUsers: {
        enabled: true,
        filters: {
          // Note: Adjust role names based on your organization's naming convention
          // The filter UI will show actual roles from your Entra ID
          roles: [] // Leave empty to show all users, or specify your admin role names
        }
      }
    }
  },
  {
    id: 'inactive-user-accounts',
    name: 'Inactive User Accounts',
    description: 'Users who have not signed in within the last 90 days',
    category: 'access',
    icon: 'i-heroicons-user-minus',
    suggestedFormat: 'xlsx',
    datasets: {
      entraUsers: {
        enabled: true,
        filters: {
          activeOnly: true,
          lookbackDays: 90
        }
      }
    }
  },
  {
    id: 'user-access-matrix',
    name: 'Complete User Access Matrix',
    description: 'Full matrix of all users and their AWS account access',
    category: 'access',
    icon: 'i-heroicons-table-cells',
    suggestedFormat: 'xlsx',
    datasets: {
      entraUsers: {
        enabled: true,
        filters: {}
      }
    }
  },
  {
    id: 'privileged-access-review',
    name: 'Privileged Access Review',
    description: 'Users with privileged access roles',
    category: 'access',
    icon: 'i-heroicons-key',
    suggestedFormat: 'pdf',
    datasets: {
      entraUsers: {
        enabled: true,
        filters: {
          // Note: Adjust role names based on your organization's naming convention
          // The filter UI will show actual roles from your Entra ID
          roles: [] // Leave empty to show all users, or specify privileged role names
        }
      }
    }
  },
  {
    id: 'iam-console-logins',
    name: 'IAM Console Login Activity',
    description: 'Recent console sign-in events across all accounts',
    category: 'access',
    icon: 'i-heroicons-arrow-right-on-rectangle',
    suggestedFormat: 'xlsx',
    datasets: {
      cloudtrail: {
        enabled: true,
        filters: {
          eventTypes: ['AwsConsoleSignIn'],
          lookbackDays: 7
        }
      }
    }
  },

  // ============================================================================
  // OPERATIONS PRESETS
  // ============================================================================
  {
    id: 'recent-resource-changes',
    name: 'Recent Resource Changes',
    description: 'All resource modifications in the last 7 days',
    category: 'operations',
    icon: 'i-heroicons-pencil-square',
    suggestedFormat: 'xlsx',
    datasets: {
      cloudtrail: {
        enabled: true,
        filters: {
          writeEventsOnly: true,
          lookbackDays: 7
        }
      }
    }
  },
  {
    id: 'failed-api-calls',
    name: 'Failed API Calls',
    description: 'CloudTrail events that resulted in errors',
    category: 'operations',
    icon: 'i-heroicons-exclamation-circle',
    suggestedFormat: 'xlsx',
    datasets: {
      cloudtrail: {
        enabled: true,
        filters: {
          errorsOnly: true,
          lookbackDays: 7
        }
      }
    }
  },
  {
    id: 'rds-database-inventory',
    name: 'RDS Database Inventory',
    description: 'All RDS database instances and their configurations',
    category: 'operations',
    icon: 'i-heroicons-circle-stack',
    suggestedFormat: 'xlsx',
    datasets: {
      config: {
        enabled: true,
        filters: {
          resourceTypes: ['AWS::RDS::DBInstance'],
          regions: []
        }
      }
    }
  },
  {
    id: 'lambda-functions',
    name: 'Lambda Functions Inventory',
    description: 'All Lambda functions across the organization',
    category: 'operations',
    icon: 'i-heroicons-bolt',
    suggestedFormat: 'xlsx',
    datasets: {
      config: {
        enabled: true,
        filters: {
          resourceTypes: ['AWS::Lambda::Function'],
          regions: []
        }
      }
    }
  },
  {
    id: 'ecs-fargate-services',
    name: 'ECS & Fargate Services',
    description: 'Inventory of ECS clusters, services, and task definitions',
    category: 'operations',
    icon: 'i-heroicons-cube',
    suggestedFormat: 'xlsx',
    datasets: {
      config: {
        enabled: true,
        filters: {
          resourceTypes: [
            'AWS::ECS::Cluster',
            'AWS::ECS::Service',
            'AWS::ECS::TaskDefinition'
          ],
          regions: []
        }
      }
    }
  },

  // ============================================================================
  // COMBINED/COMPREHENSIVE PRESETS
  // ============================================================================
  {
    id: 'security-posture-review',
    name: 'Complete Security Posture Review',
    description: 'Comprehensive security review including config, findings, and access',
    category: 'security',
    icon: 'i-heroicons-shield-check',
    suggestedFormat: 'pdf',
    enableAI: true,
    datasets: {
      config: {
        enabled: true,
        filters: {
          complianceStatus: ['NON_COMPLIANT'],
          complianceOnly: true
        }
      },
      securityHub: {
        enabled: true,
        filters: {
          severities: ['CRITICAL', 'HIGH'],
          statuses: ['NEW', 'NOTIFIED'],
          lookbackDays: 30
        }
      },
      entraUsers: {
        enabled: true,
        filters: {
          // Note: Role names are dynamically loaded from your Entra ID
          roles: [] // Leave empty to include all users
        }
      }
    }
  },
  {
    id: 'quarterly-access-review',
    name: 'Quarterly Access Review',
    description: 'Complete user access review with activity data',
    category: 'access',
    icon: 'i-heroicons-document-chart-bar',
    suggestedFormat: 'pdf',
    enableAI: true,
    datasets: {
      entraUsers: {
        enabled: true,
        filters: {}
      },
      cloudtrail: {
        enabled: true,
        filters: {
          eventTypes: ['AwsConsoleSignIn'],
          lookbackDays: 90
        }
      }
    }
  },
  {
    id: 'network-security-audit',
    name: 'Network Security Audit',
    description: 'Network resources with security findings',
    category: 'network',
    icon: 'i-heroicons-shield-exclamation',
    suggestedFormat: 'pdf',
    enableAI: true,
    datasets: {
      config: {
        enabled: true,
        filters: {
          resourceTypes: [
            'AWS::EC2::SecurityGroup',
            'AWS::EC2::NetworkAcl',
            'AWS::EC2::InternetGateway'
          ]
        }
      },
      securityHub: {
        enabled: true,
        filters: {
          severities: ['CRITICAL', 'HIGH', 'MEDIUM'],
          statuses: ['NEW', 'NOTIFIED'],
          lookbackDays: 30
        }
      }
    }
  }
]

/**
 * Get presets by category
 */
export function getPresetsByCategory(category: DatasetPreset['category']): DatasetPreset[] {
  return DATASET_PRESETS.filter(preset => preset.category === category)
}

/**
 * Get preset by ID
 */
export function getPresetById(id: string): DatasetPreset | undefined {
  return DATASET_PRESETS.find(preset => preset.id === id)
}

/**
 * Get all preset categories
 */
export function getPresetCategories(): Array<{
  value: DatasetPreset['category']
  label: string
  icon: string
  description: string
}> {
  return [
    {
      value: 'security',
      label: 'Security',
      icon: 'i-heroicons-shield-check',
      description: 'Security vulnerabilities and threat detection'
    },
    {
      value: 'network',
      label: 'Network',
      icon: 'i-heroicons-globe-alt',
      description: 'Network infrastructure and connectivity'
    },
    {
      value: 'compliance',
      label: 'Compliance',
      icon: 'i-heroicons-clipboard-document-check',
      description: 'Compliance standards and regulatory requirements'
    },
    {
      value: 'access',
      label: 'Access Control',
      icon: 'i-heroicons-key',
      description: 'User access and identity management'
    },
    {
      value: 'operations',
      label: 'Operations',
      icon: 'i-heroicons-cog-6-tooth',
      description: 'Operational resources and activity'
    }
  ]
}
