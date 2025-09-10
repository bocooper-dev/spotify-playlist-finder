// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // Your custom configs here
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-unused-vars': 'warn',
      'no-control-regex': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-extraneous-class': 'warn',
      'no-useless-escape': 'warn'
    }
  }
)
