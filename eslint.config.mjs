import antfu from '@antfu/eslint-config'

export default antfu({
  typescript: true,
  ignores: [
    'node_modules',
    'dist',
    'build',
    'coverage',
    '**/README.md',
  ],
  rules: {
    'node/prefer-global/process': 'off',
    'node/prefer-global/buffer': 'off',
    'e18e/prefer-static-regex': 'off',
    'no-cond-assign': 'off',
    'unicorn/no-new-array': 'off',
    'regexp/no-unused-capturing-group': 'off',
    'regexp/no-super-linear-backtracking': 'off',
    'regexp/no-dupe-disjunctions': 'off',
    'no-new': 'off',
    'no-unsafe-finally': 'off',
  },
}, {
  files: ['**/*.test.ts', '**/*.spec.ts', '**/test/**/*.ts'],
  rules: {
    'no-console': 'off',
    'antfu/no-top-level-await': 'off',
    'ts/no-explicit-any': 'off',
    'unused-imports/no-unused-vars': 'off',
    'style/max-statements-per-line': 'off',
  },
}, {
  files: ['**/example.ts', '**/example*.ts'],
  rules: {
    'no-console': 'off',
    'antfu/no-top-level-await': 'off',
    'unused-imports/no-unused-vars': 'off',
  },
})
