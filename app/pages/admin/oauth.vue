<script setup lang="ts">
/**
 * /admin/oauth — OAuth & Applications administration (read-only).
 *
 * A route-query-driven tab surface (`?view=overview|configuration|applications|
 * activity|issues|limits|audit`) built on the existing admin layout and NuxtUI
 * (Requirement 17.1). All data lives in composable memory; requests are
 * abortable and generation-guarded so switching view/filters can never let a
 * stale response overwrite the current view (Requirements 17.5, 17.6).
 *
 * This page delegates each tab to a focused component and stays read-only:
 * there are no create/edit/revoke/diagnostic controls in this phase
 * (Requirement 18.1). Page-level admin access is enforced by the
 * `auth-permission` middleware; per-view OAuth capability denials surface as an
 * explicit "unavailable" state inside each panel.
 */
import {
  OAUTH_ADMIN_VIEWS,
  useOAuthAdministration,
  type OAuthAdminView
} from '../../composables/useOAuthAdministration'

definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'OAuth & Applications',
  description: 'Inspect OAuth health, configuration, applications, activity, issues, and limits'
})

const admin = useOAuthAdministration()
const {
  selectedView,
  filters,
  overview,
  configuration,
  applications,
  applicationDetail,
  attempts,
  grants,
  issues,
  issueDetail,
  issueUpdate,
  limits,
  audit,
  isEmpty
} = admin

const TABS: { view: OAuthAdminView, label: string, icon: string }[] = [
  { view: 'overview', label: 'Overview', icon: 'i-heroicons-heart' },
  { view: 'configuration', label: 'Configuration', icon: 'i-heroicons-adjustments-horizontal' },
  { view: 'applications', label: 'Applications', icon: 'i-heroicons-squares-2x2' },
  { view: 'activity', label: 'Activity & Grants', icon: 'i-heroicons-clock' },
  { view: 'issues', label: 'Issues', icon: 'i-heroicons-exclamation-triangle' },
  { view: 'diagnostics', label: 'Diagnostics', icon: 'i-heroicons-wrench-screwdriver' },
  { view: 'limits', label: 'Limits', icon: 'i-heroicons-gauge' },
  { view: 'audit', label: 'Audit', icon: 'i-heroicons-document-text' }
]

/**
 * Load the data for a given view. Called on view/filter changes; the composable
 * aborts the previous request and applies the generation guard.
 */
function loadView(view: OAuthAdminView) {
  switch (view) {
    case 'overview':
      return admin.loadOverview()
    case 'configuration':
      return admin.loadConfiguration()
    case 'applications':
      return admin.loadApplications()
    case 'activity':
      // Activity tab shows both attempts and grants; load both.
      admin.loadAttempts()
      return admin.loadGrants()
    case 'issues':
      return admin.loadIssues()
    case 'diagnostics':
      // The diagnostics control is action-driven; nothing to preload.
      return
    case 'limits':
      return admin.loadLimits()
    case 'audit':
      return admin.loadAudit()
  }
}

// Load whenever the selected view or the allowlisted filters change. The
// generation guard + abort ensure a superseded response is dropped.
watch(
  [selectedView, filters],
  () => {
    loadView(selectedView.value)
  },
  { deep: true }
)

onMounted(() => loadView(selectedView.value))

// Cancel outstanding requests and discard restricted data on teardown so no
// in-flight response can land after the page is gone (Requirement 17.6).
onBeforeUnmount(() => admin.discardRestricted())

function selectTab(view: OAuthAdminView) {
  admin.setView(view)
}

// Detail loaders wired to panel selection events.
function selectApplication(clientId: string) {
  admin.loadApplicationDetail(clientId)
}
function selectIssue(groupId: string) {
  admin.loadIssueDetail(groupId)
}
async function updateIssue(
  groupId: string,
  changes: { owner?: string, notes?: string, mitigation?: string, disposition?: string },
  expectedRevision: string,
  reason: string
) {
  // The composable applies the revision-checked, audited PATCH and reflects the
  // updated issue into the detail state on success.
  await admin.updateIssue(groupId, changes as Parameters<typeof admin.updateIssue>[1], expectedRevision, reason)
}
function filterApplications(clientId: string | undefined) {
  admin.setFilters({ clientId })
}

const activeIndex = computed(() => OAUTH_ADMIN_VIEWS.indexOf(selectedView.value))
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6 px-6 py-8">
    <header class="flex items-center gap-3">
      <div class="grid size-10 place-items-center rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
        <UIcon name="i-heroicons-key" class="size-5" />
      </div>
      <div>
        <h1 class="text-2xl font-bold text-gray-950 dark:text-white">OAuth &amp; Applications</h1>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Read-only observation of the deployment's OAuth provider: health, configuration, applications, activity, issues, and limits.
        </p>
      </div>
    </header>

    <!-- Route-query-driven tab bar. Keyboard-accessible: each tab is a button
         in a tablist; arrow keys move focus naturally between buttons. -->
    <nav
      class="flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700"
      role="tablist"
      aria-label="OAuth administration views"
    >
      <button
        v-for="tab in TABS"
        :key="tab.view"
        type="button"
        role="tab"
        :aria-selected="selectedView === tab.view"
        :tabindex="selectedView === tab.view ? 0 : -1"
        class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        :class="selectedView === tab.view
          ? 'border-indigo-500 text-indigo-600 dark:text-indigo-300'
          : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'"
        @click="selectTab(tab.view)"
      >
        <UIcon :name="tab.icon" class="size-4" />
        {{ tab.label }}
      </button>
    </nav>

    <div :key="activeIndex">
      <OAuthOverviewPanel
        v-if="selectedView === 'overview'"
        :state="overview"
        :empty="isEmpty(overview)"
        @retry="admin.loadOverview()"
      />

      <OAuthConfigurationPanel
        v-else-if="selectedView === 'configuration'"
        :state="configuration"
        :empty="isEmpty(configuration)"
        @retry="admin.loadConfiguration()"
      />

      <OAuthApplicationsPanel
        v-else-if="selectedView === 'applications'"
        :list="applications"
        :detail="applicationDetail"
        :list-empty="isEmpty(applications)"
        :client-id-filter="filters.clientId"
        @retry="admin.loadApplications()"
        @load-more="(cursor: string) => admin.loadApplications(cursor)"
        @select="selectApplication"
        @filter="filterApplications"
        @created="admin.loadApplications()"
      />

      <OAuthActivityPanel
        v-else-if="selectedView === 'activity'"
        :attempts="attempts"
        :grants="grants"
        :attempts-empty="isEmpty(attempts)"
        :grants-empty="isEmpty(grants)"
        @retry-attempts="admin.loadAttempts()"
        @retry-grants="admin.loadGrants()"
        @load-more-attempts="(cursor: string) => admin.loadAttempts(cursor)"
        @load-more-grants="(cursor: string) => admin.loadGrants(cursor)"
      />

      <OAuthIssuesPanel
        v-else-if="selectedView === 'issues'"
        :list="issues"
        :detail="issueDetail"
        :list-empty="isEmpty(issues)"
        :update-state="issueUpdate"
        @retry="admin.loadIssues()"
        @load-more="(cursor: string) => admin.loadIssues(cursor)"
        @select="selectIssue"
        @update="updateIssue"
      />

      <OAuthDiagnosticsPanel v-else-if="selectedView === 'diagnostics'" />

      <OAuthLimitsPanel
        v-else-if="selectedView === 'limits'"
        :state="limits"
        :empty="isEmpty(limits)"
        @retry="admin.loadLimits()"
      />

      <OAuthAuditPanel
        v-else-if="selectedView === 'audit'"
        :state="audit"
        :empty="isEmpty(audit)"
        @retry="admin.loadAudit()"
        @load-more="(cursor: string) => admin.loadAudit(cursor)"
      />
    </div>
  </div>
</template>
