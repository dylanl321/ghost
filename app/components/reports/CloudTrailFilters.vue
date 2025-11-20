<template>
  <div class="space-y-4">
    <div class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
      Filter Options
    </div>

    <!-- Lookback Period -->
    <UFormGroup label="Lookback Period" help="How far back to search for events (max 90 days)">
      <USelectMenu
        v-model="filters.lookbackDays"
        :options="lookbackOptions"
        placeholder="Select period..."
      />
    </UFormGroup>

    <!-- Event Types -->
    <UFormGroup label="Event Types" help="Filter by event classification">
      <USelectMenu
        v-model="filters.eventTypes"
        :options="eventTypeOptions"
        multiple
        searchable
        placeholder="Select event types..."
      >
        <template #label>
          <span v-if="!filters.eventTypes || filters.eventTypes.length === 0">
            All event types
          </span>
          <span v-else>
            {{ filters.eventTypes.length }} selected
          </span>
        </template>
      </USelectMenu>
    </UFormGroup>

    <!-- Event Names -->
    <UFormGroup label="Specific Events" help="Filter by specific API calls">
      <USelectMenu
        v-model="filters.eventNames"
        :options="eventNameOptions"
        multiple
        searchable
        placeholder="Select events..."
      >
        <template #label>
          <span v-if="!filters.eventNames || filters.eventNames.length === 0">
            All events
          </span>
          <span v-else>
            {{ filters.eventNames.length }} selected
          </span>
        </template>
      </USelectMenu>
    </UFormGroup>

    <!-- Services -->
    <UFormGroup label="AWS Services" help="Filter by service source">
      <USelectMenu
        v-model="filters.eventSources"
        :options="serviceOptions"
        multiple
        searchable
        placeholder="Select services..."
      >
        <template #label>
          <span v-if="!filters.eventSources || filters.eventSources.length === 0">
            All services
          </span>
          <span v-else>
            {{ filters.eventSources.length }} selected
          </span>
        </template>
      </USelectMenu>
    </UFormGroup>

    <!-- Filter Toggles -->
    <div class="space-y-2">
      <UFormGroup>
        <div class="flex items-center gap-2">
          <UCheckbox
            v-model="filters.writeEventsOnly"
            label="Write events only (exclude read operations)"
          />
        </div>
      </UFormGroup>

      <UFormGroup>
        <div class="flex items-center gap-2">
          <UCheckbox
            v-model="filters.errorsOnly"
            label="Errors only (failed API calls)"
          />
        </div>
      </UFormGroup>
    </div>

    <!-- Quick Filters -->
    <div class="pt-3 border-t border-gray-200 dark:border-gray-700">
      <div class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Quick Filters</div>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="xs"
          color="red"
          variant="soft"
          @click="setSecurityEvents"
        >
          Security Events
        </UButton>
        <UButton
          size="xs"
          color="blue"
          variant="soft"
          @click="setIAMChanges"
        >
          IAM Changes
        </UButton>
        <UButton
          size="xs"
          color="purple"
          variant="soft"
          @click="setS3Changes"
        >
          S3 Changes
        </UButton>
        <UButton
          size="xs"
          color="orange"
          variant="soft"
          @click="setConsoleLogins"
        >
          Console Logins
        </UButton>
        <UButton
          size="xs"
          color="gray"
          variant="soft"
          @click="clearFilters"
        >
          Clear All
        </UButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CloudTrailDatasetFilters } from '~/shared/types/dataset-reports'

const filters = defineModel<CloudTrailDatasetFilters>({ default: () => ({ lookbackDays: 7 }) })

// Constants
const lookbackOptions = [
  { value: 1, label: 'Last 24 hours' },
  { value: 3, label: 'Last 3 days' },
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 60, label: 'Last 60 days' },
  { value: 90, label: 'Last 90 days (max)' }
]

const eventTypeOptions = [
  { value: 'AwsApiCall', label: 'AWS API Call' },
  { value: 'AwsServiceEvent', label: 'AWS Service Event' },
  { value: 'AwsConsoleSignIn', label: 'Console Sign In' },
  { value: 'AwsConsoleAction', label: 'Console Action' }
]

const eventNameOptions = [
  // IAM Events
  { value: 'CreateUser', label: 'CreateUser (IAM)' },
  { value: 'DeleteUser', label: 'DeleteUser (IAM)' },
  { value: 'CreateAccessKey', label: 'CreateAccessKey (IAM)' },
  { value: 'DeleteAccessKey', label: 'DeleteAccessKey (IAM)' },
  { value: 'CreateRole', label: 'CreateRole (IAM)' },
  { value: 'DeleteRole', label: 'DeleteRole (IAM)' },
  { value: 'AttachUserPolicy', label: 'AttachUserPolicy (IAM)' },
  { value: 'PutRolePolicy', label: 'PutRolePolicy (IAM)' },

  // S3 Events
  { value: 'CreateBucket', label: 'CreateBucket (S3)' },
  { value: 'DeleteBucket', label: 'DeleteBucket (S3)' },
  { value: 'PutBucketPolicy', label: 'PutBucketPolicy (S3)' },
  { value: 'DeleteBucketPolicy', label: 'DeleteBucketPolicy (S3)' },
  { value: 'PutBucketEncryption', label: 'PutBucketEncryption (S3)' },
  { value: 'PutPublicAccessBlock', label: 'PutPublicAccessBlock (S3)' },

  // EC2 Events
  { value: 'RunInstances', label: 'RunInstances (EC2)' },
  { value: 'TerminateInstances', label: 'TerminateInstances (EC2)' },
  { value: 'StopInstances', label: 'StopInstances (EC2)' },
  { value: 'CreateSecurityGroup', label: 'CreateSecurityGroup (EC2)' },
  { value: 'AuthorizeSecurityGroupIngress', label: 'AuthorizeSecurityGroupIngress (EC2)' },

  // Console
  { value: 'ConsoleLogin', label: 'ConsoleLogin' },

  // STS
  { value: 'AssumeRole', label: 'AssumeRole (STS)' },
  { value: 'GetSessionToken', label: 'GetSessionToken (STS)' }
]

const serviceOptions = [
  { value: 'iam.amazonaws.com', label: 'IAM' },
  { value: 's3.amazonaws.com', label: 'S3' },
  { value: 'ec2.amazonaws.com', label: 'EC2' },
  { value: 'rds.amazonaws.com', label: 'RDS' },
  { value: 'lambda.amazonaws.com', label: 'Lambda' },
  { value: 'kms.amazonaws.com', label: 'KMS' },
  { value: 'sts.amazonaws.com', label: 'STS' },
  { value: 'signin.amazonaws.com', label: 'Console Sign-In' },
  { value: 'cloudtrail.amazonaws.com', label: 'CloudTrail' },
  { value: 'config.amazonaws.com', label: 'Config' },
  { value: 'guardduty.amazonaws.com', label: 'GuardDuty' }
]

// Methods
function setSecurityEvents() {
  filters.value.eventNames = [
    'CreateUser',
    'DeleteUser',
    'CreateAccessKey',
    'CreateRole',
    'PutRolePolicy',
    'AttachUserPolicy',
    'AuthorizeSecurityGroupIngress',
    'PutBucketPolicy',
    'DeleteBucketPolicy'
  ]
  filters.value.writeEventsOnly = true
  filters.value.lookbackDays = 7
}

function setIAMChanges() {
  filters.value.eventSources = ['iam.amazonaws.com']
  filters.value.writeEventsOnly = true
  filters.value.lookbackDays = 14
}

function setS3Changes() {
  filters.value.eventSources = ['s3.amazonaws.com']
  filters.value.eventNames = [
    'CreateBucket',
    'DeleteBucket',
    'PutBucketPolicy',
    'DeleteBucketPolicy',
    'PutBucketEncryption',
    'PutPublicAccessBlock'
  ]
  filters.value.writeEventsOnly = true
  filters.value.lookbackDays = 7
}

function setConsoleLogins() {
  filters.value.eventTypes = ['AwsConsoleSignIn']
  filters.value.eventNames = ['ConsoleLogin']
  filters.value.lookbackDays = 7
}

function clearFilters() {
  filters.value = { lookbackDays: 7 }
}
</script>
