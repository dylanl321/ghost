# OpenAPI & Swagger Documentation Guide

## Overview

This application automatically generates interactive API documentation using OpenAPI 3.0 specifications and Swagger UI. Every API endpoint should be properly documented to ensure discoverability, testability, and maintainability.

## Quick Access

- **Swagger UI**: http://localhost:3000/api/docs
- **OpenAPI JSON**: http://localhost:3000/api/swagger.json

## Basic Documentation Structure

### 1. Import and Register

Every API file must register its endpoint documentation:

```typescript
import { registerEndpoint } from '../../plugins/swagger'

// Register the endpoint documentation
registerEndpoint('/api/your-endpoint', 'GET', {
  // Documentation configuration
})

// Your API handler
export default defineEventHandler(handleAsync(async (event) => {
  // API logic
}))
```

### 2. Minimal Documentation

```typescript
registerEndpoint('/api/accounts/list', 'GET', {
  summary: 'List AWS accounts',
  description: 'Retrieve a list of AWS accounts with optional filtering',
  tags: ['Accounts'],
  responses: {
    200: {
      description: 'List of accounts',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: { type: 'object' }
              }
            }
          }
        }
      }
    }
  }
})
```

## Complete Documentation Examples

### GET Endpoint with Query Parameters

```typescript
registerEndpoint('/api/accounts/search', 'GET', {
  summary: 'Search AWS accounts',
  description: 'Search and filter AWS accounts by various criteria including name, LOB, status, and department',
  tags: ['Accounts'],
  parameters: [
    {
      name: 'query',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        minLength: 2,
        maxLength: 100
      },
      description: 'Search term for account name or ID (minimum 2 characters)',
      example: 'production'
    },
    {
      name: 'lob',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['IT', 'Cyber', 'SC&I', 'MSS', 'SIS', 'LAS']
      },
      description: 'Filter by Line of Business'
    },
    {
      name: 'status',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['ACTIVE', 'SUSPENDED', 'CLOSED']
      },
      description: 'Filter by account status'
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: { 
        type: 'integer',
        minimum: 1,
        maximum: 1000,
        default: 50
      },
      description: 'Maximum number of results to return'
    },
    {
      name: 'offset',
      in: 'query',
      required: false,
      schema: { 
        type: 'integer',
        minimum: 0,
        default: 0
      },
      description: 'Number of results to skip for pagination'
    }
  ],
  responses: {
    200: {
      description: 'List of matching accounts',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { 
                type: 'boolean',
                description: 'Indicates if the request was successful'
              },
              data: {
                type: 'array',
                description: 'Array of account objects matching the search criteria',
                items: {
                  type: 'object',
                  properties: {
                    accountId: { 
                      type: 'string',
                      description: '12-digit AWS Account ID',
                      pattern: '^\\d{12}$',
                      example: '123456789012'
                    },
                    name: { 
                      type: 'string',
                      description: 'Account name',
                      example: 'Production Environment'
                    },
                    status: { 
                      type: 'string',
                      enum: ['ACTIVE', 'SUSPENDED', 'CLOSED'],
                      description: 'Current account status'
                    },
                    linesOfBusiness: { 
                      type: 'string',
                      description: 'Line of Business designation',
                      example: 'IT'
                    },
                    email: { 
                      type: 'string',
                      format: 'email',
                      description: 'Account contact email'
                    },
                    departmentNumber: { 
                      type: 'string',
                      description: 'Department code',
                      example: 'DE158'
                    }
                  },
                  required: ['accountId', 'name', 'status']
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  total: { type: 'integer', description: 'Total number of accounts matching criteria' },
                  limit: { type: 'integer', description: 'Number of results requested' },
                  offset: { type: 'integer', description: 'Number of results skipped' },
                  hasMore: { type: 'boolean', description: 'Whether more results are available' }
                }
              }
            },
            required: ['success', 'data']
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})
```

### POST Endpoint with Request Body

```typescript
registerEndpoint('/api/accounts/create', 'POST', {
  summary: 'Create new AWS account',
  description: 'Create a new AWS account with specified configuration and metadata',
  tags: ['Accounts'],
  requestBody: {
    required: true,
    description: 'Account creation parameters',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['accountName', 'email', 'linesOfBusiness'],
          properties: {
            accountName: {
              type: 'string',
              minLength: 3,
              maxLength: 50,
              description: 'Name for the new AWS account',
              example: 'Production Web Services'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Contact email for the account',
              example: 'admin@company.com'
            },
            linesOfBusiness: {
              type: 'string',
              enum: ['IT', 'Cyber', 'SC&I', 'MSS', 'SIS', 'LAS'],
              description: 'Line of Business designation'
            },
            departmentNumber: {
              type: 'string',
              pattern: '^[A-Z]{2}\\d{3}$',
              description: 'Department code (2 letters + 3 digits)',
              example: 'DE158'
            },
            projectName: {
              type: 'string',
              maxLength: 100,
              description: 'Associated project name',
              example: 'Customer Portal Modernization'
            },
            estimatedMonthlyCharge: {
              type: 'number',
              minimum: 0,
              maximum: 1000000,
              description: 'Estimated monthly AWS charges in USD',
              example: 2500.00
            },
            tags: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Key-value pairs for account tagging',
              example: {
                "Environment": "Production",
                "CostCenter": "IT-001",
                "Owner": "John Doe"
              }
            }
          }
        },
        examples: {
          production: {
            summary: 'Production Account',
            description: 'Example of creating a production environment account',
            value: {
              accountName: 'Production Web Services',
              email: 'prod-admin@company.com',
              linesOfBusiness: 'IT',
              departmentNumber: 'DE158',
              projectName: 'Customer Portal',
              estimatedMonthlyCharge: 5000.00,
              tags: {
                "Environment": "Production",
                "CostCenter": "IT-001"
              }
            }
          },
          development: {
            summary: 'Development Account',
            description: 'Example of creating a development environment account',
            value: {
              accountName: 'Development Environment',
              email: 'dev-team@company.com',
              linesOfBusiness: 'IT',
              departmentNumber: 'DE158',
              estimatedMonthlyCharge: 500.00
            }
          }
        }
      }
    }
  },
  responses: {
    201: {
      description: 'Account created successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  accountId: { 
                    type: 'string',
                    description: 'Newly created AWS Account ID',
                    example: '123456789012'
                  },
                  createAccountStatus: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', description: 'Request ID' },
                      state: { 
                        type: 'string',
                        enum: ['IN_PROGRESS', 'SUCCEEDED', 'FAILED'],
                        description: 'Current status of account creation'
                      },
                      requestedTimestamp: { 
                        type: 'string',
                        format: 'date-time',
                        description: 'When the request was initiated'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    409: {
      description: 'Account already exists',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
        }
      }
    },
    500: { $ref: '#/components/schemas/Error' }
  }
})
```

### Path Parameters

```typescript
registerEndpoint('/api/accounts/[accountId]/costs', 'GET', {
  summary: 'Get account costs',
  description: 'Retrieve cost analysis for a specific AWS account over a given time period',
  tags: ['Accounts', 'Costs'],
  parameters: [
    {
      name: 'accountId',
      in: 'path',
      required: true,
      schema: { 
        type: 'string',
        pattern: '^\\d{12}$'
      },
      description: '12-digit AWS Account ID',
      example: '123456789012'
    },
    {
      name: 'startDate',
      in: 'query',
      required: true,
      schema: { 
        type: 'string',
        format: 'date'
      },
      description: 'Start date for cost analysis (YYYY-MM-DD)',
      example: '2025-01-01'
    },
    {
      name: 'endDate',
      in: 'query',
      required: true,
      schema: { 
        type: 'string',
        format: 'date'
      },
      description: 'End date for cost analysis (YYYY-MM-DD)',
      example: '2025-01-31'
    },
    {
      name: 'granularity',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['DAILY', 'MONTHLY'],
        default: 'DAILY'
      },
      description: 'Granularity of cost data'
    }
  ],
  responses: {
    200: {
      description: 'Cost data for the specified account and time period',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  accountId: { type: 'string' },
                  accountName: { type: 'string' },
                  totalCost: { 
                    type: 'number',
                    description: 'Total cost for the period'
                  },
                  currency: { 
                    type: 'string',
                    example: 'USD'
                  },
                  costsByDay: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        date: { type: 'string', format: 'date' },
                        cost: { type: 'number' },
                        services: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              service: { type: 'string' },
                              cost: { type: 'number' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})
```

## Schema Components and Reusability

### Defining Reusable Schemas

The application has predefined schemas in `server/plugins/swagger.ts`. You can reference them or add new ones:

```typescript
// Reference existing error schema
400: { $ref: '#/components/schemas/Error' }

// Reference existing account schema
200: {
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/AccountInfo' }
    }
  }
}
```

### Creating Custom Reusable Schemas

Add new schemas to the swagger plugin configuration:

```typescript
// In server/plugins/swagger.ts, add to components.schemas:
CustomResponse: {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object' },
    metadata: {
      type: 'object',
      properties: {
        timestamp: { type: 'string', format: 'date-time' },
        version: { type: 'string' }
      }
    }
  },
  required: ['success', 'data']
}

// Then reference it in your endpoints:
200: {
  description: 'Success response',
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/CustomResponse' }
    }
  }
}
```

## Advanced Documentation Features

### Multiple Response Examples

```typescript
responses: {
  200: {
    description: 'Account information',
    content: {
      'application/json': {
        schema: { /* schema definition */ },
        examples: {
          active_account: {
            summary: 'Active Account',
            description: 'Example of an active AWS account',
            value: {
              success: true,
              data: {
                accountId: '123456789012',
                name: 'Production Environment',
                status: 'ACTIVE',
                linesOfBusiness: 'IT'
              }
            }
          },
          suspended_account: {
            summary: 'Suspended Account',
            description: 'Example of a suspended AWS account',
            value: {
              success: true,
              data: {
                accountId: '987654321098',
                name: 'Legacy System',
                status: 'SUSPENDED',
                linesOfBusiness: 'LAS'
              }
            }
          }
        }
      }
    }
  }
}
```

### Complex Nested Objects

```typescript
schema: {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        organization: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            accounts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  accountId: { type: 'string' },
                  costs: {
                    type: 'object',
                    properties: {
                      current: { type: 'number' },
                      previous: { type: 'number' },
                      trend: {
                        type: 'string',
                        enum: ['up', 'down', 'stable']
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### Conditional Properties

```typescript
schema: {
  type: 'object',
  properties: {
    accountType: {
      type: 'string',
      enum: ['production', 'development', 'test']
    }
  },
  allOf: [
    {
      if: {
        properties: { accountType: { const: 'production' } }
      },
      then: {
        properties: {
          backupSchedule: { type: 'string' },
          monitoringLevel: { type: 'string', enum: ['basic', 'enhanced'] }
        },
        required: ['backupSchedule', 'monitoringLevel']
      }
    },
    {
      if: {
        properties: { accountType: { const: 'development' } }
      },
      then: {
        properties: {
          autoShutdown: { type: 'boolean' },
          maxDailyCost: { type: 'number' }
        }
      }
    }
  ]
}
```

## Tags and Organization

### Standard Tags

Use consistent tags to organize your APIs:

```typescript
tags: ['Accounts']        // Account management
tags: ['Costs']           // Cost and billing
tags: ['Organization']    // Organization structure
tags: ['Analytics']       // Data analysis and reporting
tags: ['Admin']           // Administrative functions
tags: ['Monitoring']      // Health checks and metrics
```

### Multiple Tags

```typescript
tags: ['Accounts', 'Costs']  // APIs that deal with both accounts and costs
```

## Security Documentation

### API Key Authentication

```typescript
registerEndpoint('/api/secure-endpoint', 'GET', {
  summary: 'Secure endpoint',
  tags: ['Admin'],
  security: [
    {
      apiKey: []
    }
  ],
  responses: {
    401: {
      description: 'Authentication required',
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/Error' }
        }
      }
    }
  }
})
```

### Role-Based Access

```typescript
registerEndpoint('/api/admin/users', 'GET', {
  summary: 'List users (Admin only)',
  description: 'Retrieve list of users. Requires administrator privileges.',
  tags: ['Admin', 'Users'],
  security: [
    {
      bearerAuth: [],
      roles: ['admin']
    }
  ]
})
```

## Error Documentation Best Practices

### Standard Error Responses

Always include these standard error responses:

```typescript
responses: {
  // Your success responses...
  400: {
    description: 'Bad Request - Invalid parameters or request body',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' }
      }
    }
  },
  401: {
    description: 'Unauthorized - Authentication required',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' }
      }
    }
  },
  403: {
    description: 'Forbidden - Insufficient permissions',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' }
      }
    }
  },
  404: {
    description: 'Not Found - Resource does not exist',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' }
      }
    }
  },
  500: {
    description: 'Internal Server Error',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' }
      }
    }
  }
}
```

### Custom Error Responses

```typescript
409: {
  description: 'Conflict - Account already exists',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'ACCOUNT_EXISTS' },
              message: { type: 'string', example: 'An account with this email already exists' },
              existingAccountId: { type: 'string', example: '123456789012' }
            }
          }
        }
      }
    }
  }
}
```

## Testing with Swagger UI

### Accessing Swagger UI

1. Start the development server: `npm run dev`
2. Navigate to: http://localhost:3000/api/docs
3. Find your API in the appropriate section
4. Click "Try it out" to test interactively

### Using the Interface

1. **Fill in Parameters**: Enter values for path and query parameters
2. **Add Request Body**: For POST/PUT requests, fill in the JSON body
3. **Execute**: Click the "Execute" button
4. **View Response**: See the actual response, headers, and status code

### Example Test Scenarios

```json
// Test account search with filters
GET /api/accounts/search?lob=IT&status=ACTIVE&limit=10

// Test account creation
POST /api/accounts/create
{
  "accountName": "Test Account",
  "email": "test@company.com",
  "linesOfBusiness": "IT",
  "estimatedMonthlyCharge": 1000
}

// Test cost analysis
GET /api/accounts/123456789012/costs?startDate=2025-01-01&endDate=2025-01-31
```

## Documentation Quality Checklist

### ✅ Essential Elements

- [ ] Clear, descriptive summary
- [ ] Detailed description explaining purpose
- [ ] Appropriate tags for organization
- [ ] All parameters documented with types and examples
- [ ] Request body schema (for POST/PUT)
- [ ] Complete response schemas
- [ ] Error responses (at minimum 400, 500)
- [ ] Examples for complex requests/responses

### ✅ Good Practices

- [ ] Use meaningful parameter names
- [ ] Include validation rules (min/max, patterns)
- [ ] Provide realistic examples
- [ ] Document edge cases in description
- [ ] Use consistent terminology
- [ ] Include units for numeric values
- [ ] Specify required vs optional fields

### ✅ Advanced Features

- [ ] Multiple response examples
- [ ] Conditional schemas where applicable
- [ ] Security requirements
- [ ] Deprecation notices (if applicable)
- [ ] External documentation links

## Troubleshooting

### Common Issues

**Swagger UI not loading:**
- Check that the development server is running
- Verify the endpoint registration is correct
- Look for syntax errors in the schema

**Schema validation errors:**
- Ensure all required properties are defined
- Check that enum values match exactly
- Verify reference paths are correct (`$ref`)

**Missing endpoints:**
- Confirm `registerEndpoint` is called before the handler
- Check that the path matches the file structure
- Ensure the HTTP method matches the filename

### Debug Schema Issues

```typescript
// Add console logging to debug schema issues
console.log('Registering endpoint:', '/api/my-endpoint')
registerEndpoint('/api/my-endpoint', 'GET', {
  // Your schema
})
```

### Validate JSON Schema

Use online tools to validate your JSON schemas:
- [JSON Schema Validator](https://www.jsonschemavalidator.net/)
- [OpenAPI Editor](https://editor.swagger.io/)

This comprehensive documentation system ensures your APIs are discoverable, testable, and maintainable!