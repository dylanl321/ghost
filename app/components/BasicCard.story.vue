<template>
  <Story title="Basic Card" group="components">
    <Variant title="Default">
      <BasicCard title="Default Card">
        <p>This is a basic card component built with plain Vue and CSS.</p>
        <p>No external dependencies - works perfectly in Histoire!</p>
      </BasicCard>
    </Variant>

    <Variant title="Elevated">
      <BasicCard title="Elevated Card" variant="elevated">
        <p>This card has a subtle shadow for depth.</p>
        <div class="stats">
          <div class="stat">
            <div class="stat-label">Revenue</div>
            <div class="stat-value">$12,345</div>
          </div>
        </div>
      </BasicCard>
    </Variant>

    <Variant title="Bordered">
      <BasicCard title="Bordered Card" variant="bordered">
        <p>This card has a clean border instead of shadows.</p>
      </BasicCard>
    </Variant>

    <Variant title="Loading State">
      <BasicCard title="Loading..." :loading="true">
        <div class="loading-content">
          <div class="loading-line"></div>
          <div class="loading-line short"></div>
        </div>
      </BasicCard>
    </Variant>

    <Variant title="With Footer">
      <BasicCard title="Card with Footer">
        <p>This card demonstrates the footer slot.</p>
        <template #footer>
          <div class="footer-content">
            <span>Last updated: 5 min ago</span>
            <button class="btn-link">Refresh</button>
          </div>
        </template>
      </BasicCard>
    </Variant>

    <template #controls>
      <HstText v-model="title" title="Title" />
      <HstSelect
        v-model="variant"
        title="Variant"
        :options="[
          { value: 'default', label: 'Default' },
          { value: 'elevated', label: 'Elevated' },
          { value: 'bordered', label: 'Bordered' },
        ]"
      />
      <HstCheckbox v-model="loading" title="Loading" />
    </template>
  </Story>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import BasicCard from './BasicCard.vue'

// Controls
const title = ref('Interactive Card')
const variant = ref('default')
const loading = ref(false)
</script>

<style scoped>
.stats {
  margin-top: 1rem;
}

.stat {
  text-align: center;
}

.stat-label {
  font-size: 0.875rem;
  color: #6b7280;
  margin-bottom: 0.25rem;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #059669;
}

.loading-content {
  space-y: 0.5rem;
}

.loading-line {
  height: 1rem;
  background: #f3f4f6;
  border-radius: 4px;
  animation: pulse 1.5s ease-in-out infinite;
  margin-bottom: 0.5rem;
}

.loading-line.short {
  width: 60%;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
}

.btn-link {
  background: none;
  border: none;
  color: #059669;
  cursor: pointer;
  text-decoration: underline;
}

.btn-link:hover {
  color: #047857;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>