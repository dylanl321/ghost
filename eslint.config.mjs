// Note: This is for custom ESLint config that will get appended to the default config.

// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      eqeqeq: ['error', 'always'], // If '==' is intended, use a "// eslint-disable-line eqeqeq" comment to disable the red underline
      'object-curly-spacing': ['error', 'always'],
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      'vue/require-default-prop': 'off',
      'vue/first-attribute-linebreak': 'off',
      'no-console': 'warn'
    }
  }
  // Your custom configs here
)
