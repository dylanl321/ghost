<template>
  <div class="space-y-6 p-6 max-w-[1600px] mx-auto">
    <!-- Header -->
    <UCard>
      <div class="text-center p-6">
        <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-3">
          Support & Help
        </h1>
        <p class="text-lg text-gray-600 dark:text-gray-400">
          Get help with GHOST features, documentation, and support
        </p>
      </div>
    </UCard>

    <!-- Main Actions Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Documentation -->
      <UCard
        class="cursor-pointer"
        @click="navigateTo('/support/docs')"
      >
        <div class="p-6">
          <div class="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
            <Icon name="i-heroicons-book-open" class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Documentation
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Guides and tutorials for using GHOST features
          </p>
          <UButton color="emerald" variant="soft" size="sm">
            Browse Docs
          </UButton>
        </div>
      </UCard>

      <!-- Roles & Permissions -->
      <UCard
        class="cursor-pointer"
        @click="navigateTo('/support/roles')"
      >
        <div class="p-6">
          <div class="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center mb-4">
            <Icon name="i-heroicons-shield-check" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Roles & Permissions
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Understand your access level and permissions
          </p>
          <UButton color="purple" variant="soft" size="sm">
            View Roles
          </UButton>
        </div>
      </UCard>

      <!-- AWS Access -->
      <UCard
        class="cursor-pointer"
        @click="navigateTo('/support/aws-access')"
      >
        <div class="p-6">
          <div class="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-4">
            <Icon name="i-heroicons-key" class="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Request AWS Access
          </h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Request access to AWS accounts
          </p>
          <UButton color="emerald" variant="soft" size="sm">
            Request Access
          </UButton>
        </div>
      </UCard>
      </div>

      <!-- Popular Articles -->
      <div class="mb-12">
        <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Popular Articles
        </h2>
        <div class="space-y-3">
          <UCard
            v-for="article in popularArticles"
            :key="article.id"
            class="hover:shadow-md transition-shadow cursor-pointer"
            @click="navigateTo(article.link)"
          >
            <div class="p-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                  <Icon :name="article.icon" class="w-5 h-5" :class="article.color" />
                  <div>
                    <h4 class="font-medium text-gray-900 dark:text-white">
                      {{ article.title }}
                    </h4>
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                      {{ article.description }}
                    </p>
                  </div>
                </div>
                <Icon name="i-heroicons-chevron-right" class="w-5 h-5 text-gray-400" />
              </div>
            </div>
          </UCard>
        </div>
      </div>

      <!-- Contact Support -->
      <UCard class="bg-blue-50 dark:bg-blue-900/20">
        <div class="p-8 text-center">
          <Icon name="i-heroicons-chat-bubble-left-right" class="w-12 h-12 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
          <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Need More Help?
          </h3>
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            Can't find what you're looking for? Submit a support ticket or chat with our team.
          </p>
          <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <UButton
              color="blue"
              size="lg"
              @click="openServiceNow"
            >
              <Icon name="i-heroicons-ticket" class="w-4 h-4 mr-2" />
              Submit Support Ticket
            </UButton>
            <UButton
              color="gray"
              variant="soft"
              size="lg"
              @click="openTeamsChat"
            >
              <Icon name="i-heroicons-chat-bubble-left-ellipsis" class="w-4 h-4 mr-2" />
              Teams Chat
            </UButton>
          </div>
        </div>
      </UCard>
  </div>
</template>

<script setup lang="ts">
// Page meta
definePageMeta({
  title: 'Support & Help',
  description: 'Get help with GHOST and AWS services'
})

// Popular articles
const popularArticles = [
  {
    id: 'cost-dashboard',
    title: 'Using the Cost Dashboard',
    description: 'Learn how to track costs, use filters, and share reports',
    icon: 'i-heroicons-currency-dollar',
    color: 'text-blue-600 dark:text-blue-400',
    link: '/support/docs#cost-dashboard-guide'
  },
  {
    id: 'reports-guide',
    title: 'Creating and Scheduling Reports',
    description: 'Generate shareable reports and automate recurring schedules',
    icon: 'i-heroicons-document-chart-bar',
    color: 'text-emerald-600 dark:text-emerald-400',
    link: '/support/docs#reports-guide'
  },
  {
    id: 'universal-search',
    title: 'Using Universal Search',
    description: 'Find accounts, users, and resources quickly',
    icon: 'i-heroicons-magnifying-glass',
    color: 'text-purple-600 dark:text-purple-400',
    link: '/support/docs#universal-search'
  },
  {
    id: 'favorites-guide',
    title: 'Using Favorites',
    description: 'Save and organize your most-used accounts',
    icon: 'i-heroicons-star',
    color: 'text-green-600 dark:text-green-400',
    link: '/support/docs#favorites-guide'
  },
  {
    id: 'org-chart-guide',
    title: 'Organization Chart Guide',
    description: 'Navigate your AWS account hierarchy',
    icon: 'i-heroicons-chart-bar',
    color: 'text-orange-600 dark:text-orange-400',
    link: '/support/docs#org-chart-guide'
  },
  {
    id: 'account-users-export-guide',
    title: 'Exporting an Account User List',
    description: 'Export users and roles for your SSP access list',
    icon: 'i-heroicons-arrow-down-tray',
    color: 'text-teal-600 dark:text-teal-400',
    link: '/support/docs#account-users-export-guide'
  },
  {
    id: 'swagger-ui-guide',
    title: 'Swagger UI for API Testing',
    description: 'Interactive API testing and exploration',
    icon: 'i-heroicons-code-bracket',
    color: 'text-indigo-600 dark:text-indigo-400',
    link: '/support/docs#swagger-ui-guide'
  }
]

// Methods
const openServiceNow = () => {
  window.open('https://gdms.servicenowservices.com/', '_blank', 'noopener,noreferrer')
}

const openTeamsChat = () => {
  window.open('https://teams.microsoft.com/l/channel/19%3a7IisJL1KQL-rJj6VkSC3KshUyMz1ZMzlqTA2FfnuBEk1%40thread.tacv2/General?groupId=4c1c8dcd-30d1-4b80-8aa7-02e2a9b6bf6d&tenantId=7c5a26cf-ddf0-400c-9703-4070b4e3a54d', '_blank', 'noopener,noreferrer')
}
</script>
