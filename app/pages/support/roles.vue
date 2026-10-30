<template>
  <div class="container mx-auto p-6 max-w-4xl">
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-white mb-2">Understanding Roles & Permissions</h1>
      <p class="text-gray-400">Learn about the role-based access control system in GHOST</p>
    </div>

    <!-- Your Access Level -->
    <UCard class="mb-8">
      <template #header>
        <h2 class="text-lg font-semibold text-white">Your Current Access Level</h2>
      </template>
      <UserRoleInfo />
    </UCard>

    <!-- How Roles Work -->
    <UCard class="mb-8">
      <template #header>
        <h2 class="text-lg font-semibold text-white">How Roles Work</h2>
      </template>
      
      <div class="prose prose-invert max-w-none">
        <p class="text-gray-300">
          GHOST uses a role-based access control (RBAC) system to manage user permissions. 
          Roles are automatically assigned based on your Microsoft Entra ID group memberships 
          and user attributes.
        </p>
        
        <h3 class="text-white mt-4 mb-2">Role Assignment</h3>
        <p class="text-gray-300">
          When you log in, the system evaluates your profile against a set of rules to determine 
          which roles you should have. You can have multiple roles, and your effective permissions 
          are the combination of all your assigned roles.
        </p>
        
        <h3 class="text-white mt-4 mb-2">Available Roles</h3>
        <div class="space-y-4">
          <div v-for="role in ROLES" :key="role.id" class="border-l-2 border-gray-700 pl-4">
            <div class="flex items-center gap-2 mb-1">
              <h4 class="text-white font-medium">{{ role.name }}</h4>
              <UBadge 
                v-if="hasRole(role.id)" 
                color="green" 
                variant="soft" 
                size="xs"
              >
                You have this role
              </UBadge>
            </div>
            <p class="text-gray-400 text-sm mb-2">{{ role.description }}</p>
            
            <div class="text-xs text-gray-500">
              <span class="font-medium">How to get this role:</span>
              <ul class="mt-1 ml-4 list-disc">
                <li v-if="role.rules.groups_exact">
                  Be a member of: {{ role.rules.groups_exact.join(' or ') }}
                </li>
                <li v-if="role.rules.username_ends_with">
                  Have a username ending with: {{ role.rules.username_ends_with.join(' or ') }}
                </li>
                <li v-if="role.rules.department_includes">
                  Work in department: {{ role.rules.department_includes.join(' or ') }}
                </li>
                <li v-if="role.rules.default">
                  Automatically assigned to all authenticated users
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </UCard>

    <!-- Key Features by Role -->
    <UCard class="mb-8">
      <template #header>
        <h2 class="text-lg font-semibold text-white">Key Features by Role</h2>
      </template>
      
      <div class="space-y-6">
        <div>
          <h3 class="text-white font-medium mb-2">Administrator Features</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <FeatureItem 
              icon="i-heroicons-document-arrow-up" 
              title="Import Forecast Data"
              description="Upload and manage cost forecast files"
              :enabled="can('forecast.import')"
            />
            <FeatureItem 
              icon="i-heroicons-cog-6-tooth" 
              title="Cost Settings"
              description="Configure cost display and filtering options"
              :enabled="can('costs.settings')"
            />
            <FeatureItem 
              icon="i-heroicons-server-stack" 
              title="System Logs"
              description="Access application logs and debugging tools"
              :enabled="can('admin.logs')"
            />
            <FeatureItem 
              icon="i-heroicons-users" 
              title="User Management"
              description="Manage user roles and permissions"
              :enabled="can('users.manage')"
            />
          </div>
        </div>

        <div>
          <h3 class="text-white font-medium mb-2">Power User Features</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <FeatureItem 
              icon="i-heroicons-pencil-square" 
              title="Edit Forecasts"
              description="Modify existing forecast entries"
              :enabled="can('forecast.edit')"
            />
            <FeatureItem 
              icon="i-heroicons-arrow-down-tray" 
              title="Export Cost Data"
              description="Download cost reports in various formats"
              :enabled="can('costs.export')"
            />
            <FeatureItem 
              icon="i-heroicons-building-office-2" 
              title="Edit Accounts"
              description="Update account metadata and tags"
              :enabled="can('accounts.edit')"
            />
          </div>
        </div>

        <div>
          <h3 class="text-white font-medium mb-2">Standard Features (All Users)</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            <FeatureItem 
              icon="i-heroicons-chart-bar" 
              title="View Cost Data"
              description="Access cost dashboards and reports"
              :enabled="can('costs.view')"
            />
            <FeatureItem 
              icon="i-heroicons-building-office" 
              title="View Accounts"
              description="Browse AWS account information"
              :enabled="can('accounts.view')"
            />
            <FeatureItem 
              icon="i-heroicons-user-group" 
              title="View Users"
              description="See user profiles and group memberships"
              :enabled="can('users.view')"
            />
          </div>
        </div>
      </div>
    </UCard>

    <!-- Need More Access? -->
    <UCard>
      <template #header>
        <h2 class="text-lg font-semibold text-white">Need More Access?</h2>
      </template>
      
      <div class="space-y-4">
        <p class="text-gray-300">
          If you need additional permissions to perform your job duties, please contact 
          your team lead or the AWS-Product-Team.
        </p>
        
        <div class="bg-gray-800 rounded-lg p-4">
          <h3 class="text-white font-medium mb-2">For AWS-Product-Team Members</h3>
          <p class="text-gray-400 text-sm mb-3">
            As a member of the AWS-Product-Team, you have administrator access. This includes:
          </p>
          <ul class="text-sm text-gray-400 space-y-1 list-disc list-inside">
            <li>Full access to all features and data</li>
            <li>Ability to import and manage forecast data</li>
            <li>Access to system administration tools</li>
            <li>User and permission management capabilities</li>
          </ul>
        </div>

        <div class="flex gap-3">
          <UButton 
            variant="outline" 
            icon="i-heroicons-envelope"
            to="mailto:aws-product-team@company.com"
          >
            Contact AWS Product Team
          </UButton>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import { ROLES } from '~/config/roles'
import UserRoleInfo from '~/components/support/UserRoleInfo.vue'
import FeatureItem from '~/components/support/FeatureItem.vue'

const { can, hasRole } = useUserRoles()
</script>
