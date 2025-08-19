// Note: This is for custom ESLint config that will get appended to the default config.

// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs';

export default withNuxt(
  {
    rules: {
      // semi: ['error', 'always'],
      eqeqeq: ['error', 'always'], // If '==' is intended, use a "// eslint-disable-line eqeqeq" comment to disable the red underline
      quotes: ['error', 'single'],
      // indent: ['error', 2],
      'object-curly-spacing': ['error', 'always'],
      '@typescript-eslint/no-unsafe-function-type': 'off',
      'vue/require-default-prop': 'off',
    }
  }
  // Your custom configs here
);
