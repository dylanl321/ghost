<template>
  <UApp>
    <UContainer class="py-8">
      <div class="space-y-8">
        <header>
          <h1 class="text-3xl font-bold">Component Documentation</h1>
          <p class="text-muted mt-2">
            Interactive showcase of all Nuxt UI components used in this project
          </p>
        </header>

        <!-- AccountCard Variants -->
        <section class="space-y-4">
          <h2 class="text-2xl font-semibold">Account Cards</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div v-for="(account, index) in sampleAccounts" :key="index">
              <h3 class="text-sm font-medium mb-2 text-muted">{{ account.title }}</h3>
              <AccountCard :account="account.data" />
            </div>
          </div>
        </section>

        <!-- DashboardCard Variants -->
        <section class="space-y-4">
          <h2 class="text-2xl font-semibold">Dashboard Cards</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <h3 class="text-sm font-medium mb-2 text-muted">Default</h3>
              <DashboardCard title="Revenue Overview">
                <p>This is the card content with charts and stats.</p>
              </DashboardCard>
            </div>
            
            <div>
              <h3 class="text-sm font-medium mb-2 text-muted">Elevated</h3>
              <DashboardCard title="Elevated Card" variant="elevated">
                <div class="text-3xl font-bold">$12,345</div>
                <div class="text-muted">Total Revenue</div>
              </DashboardCard>
            </div>
            
            <div>
              <h3 class="text-sm font-medium mb-2 text-muted">Loading</h3>
              <DashboardCard title="Loading State" :loading="true">
                <div class="space-y-2">
                  <div class="h-4 bg-neutral-200 rounded animate-pulse"></div>
                  <div class="h-4 bg-neutral-200 rounded animate-pulse w-3/4"></div>
                </div>
              </DashboardCard>
            </div>
          </div>
        </section>

        <!-- MetricDisplay Variants -->
        <section class="space-y-4">
          <h2 class="text-2xl font-semibold">Metric Displays</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div v-for="metric in sampleMetrics" :key="metric.label">
              <MetricDisplay v-bind="metric" />
            </div>
          </div>
        </section>

        <!-- Usage Examples -->
        <section class="space-y-4">
          <h2 class="text-2xl font-semibold">Usage Examples</h2>
          <div class="bg-neutral-50 p-6 rounded-lg space-y-4">
            <h3 class="font-semibold">AccountCard</h3>
            <pre class="text-sm bg-white p-4 rounded border overflow-x-auto"><code>&lt;AccountCard :account="accountData" /&gt;

// where accountData has structure:
{
  name: string
  accountId: string
  accountStatus: 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
  govCloudPairedAccountId?: string
  email?: string
}</code></pre>
          </div>
          
          <div class="bg-neutral-50 p-6 rounded-lg space-y-4">
            <h3 class="font-semibold">DashboardCard</h3>
            <pre class="text-sm bg-white p-4 rounded border overflow-x-auto"><code>&lt;DashboardCard 
  title="Card Title"
  variant="elevated"
  :loading="false"
&gt;
  &lt;!-- Card content --&gt;
&lt;/DashboardCard&gt;</code></pre>
          </div>
        </section>
      </div>
    </UContainer>
  </UApp>
</template>

<script setup lang="ts">
// Sample data for demonstration
const sampleAccounts = [
  {
    title: "Active Account",
    data: {
      name: "Production Environment",
      accountId: "123456789012",
      accountStatus: "ACTIVE" as const,
      email: "admin@example.com"
    }
  },
  {
    title: "GovCloud Paired",
    data: {
      name: "Government Services",
      accountId: "210987654321",
      accountStatus: "ACTIVE" as const,
      govCloudPairedAccountId: "123456789012",
      email: "gov@example.com"
    }
  },
  {
    title: "Suspended Account",
    data: {
      name: "Development Account",
      accountId: "555666777888",
      accountStatus: "SUSPENDED" as const,
      email: "dev@example.com"
    }
  }
]

const sampleMetrics = [
  {
    label: "Total Accounts",
    value: "127",
    trend: "up" as const,
    trendValue: "+12%",
    icon: "users"
  },
  {
    label: "Monthly Cost",
    value: "$45,678",
    trend: "down" as const,
    trendValue: "-5%",
    icon: "currency-dollar"
  },
  {
    label: "Active Services",
    value: "89",
    trend: "up" as const,
    trendValue: "+3",
    icon: "server"
  },
  {
    label: "Alerts",
    value: "3",
    trend: "neutral" as const,
    icon: "exclamation-triangle"
  }
]
</script>