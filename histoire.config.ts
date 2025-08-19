import { defineConfig } from 'histoire'
import { HstNuxt } from '@histoire/plugin-nuxt'
import { HstVue } from '@histoire/plugin-vue'

export default defineConfig({
  plugins: [
    HstNuxt(),
    HstVue(),
  ],
  setupFile: './histoire.setup.ts',
  tree: {
    groups: [
      {
        id: 'dashboard',
        title: 'Dashboard',
      },
      {
        id: 'components',
        title: 'Components',
      },
      {
        id: 'test',
        title: 'Test Components',
      },
    ],
  },
  theme: {
    title: 'AWS Dashboard Components',
  },
  vite: {
    server: {
      port: 6006,
    },
  },
})