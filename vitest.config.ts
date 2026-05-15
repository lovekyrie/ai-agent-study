import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/tests/',
        '**/testing.ts',
      ],
      // 对齐 CLAUDE.md "覆盖率 > 80%" 要求
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    include: ['**/*.{test,spec}.{ts,tsx}'],
    // 必须用 glob，否则会覆盖默认值导致扫描进 node_modules
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**'],
  },
})