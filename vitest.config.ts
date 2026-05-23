import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@ai-agent-study/config': new URL('./packages/config/src/index.ts', import.meta.url).pathname,
      '@ai-agent-study/logger': new URL('./packages/logger/src/index.ts', import.meta.url).pathname,
      '@ai-agent-study/llm-client': new URL('./packages/llm-client/src/index.ts', import.meta.url).pathname,
      '@ai-agent-study/mcp': new URL('./packages/mcp/src/index.ts', import.meta.url).pathname,
      '@ai-agent-study/memory': new URL('./packages/memory/src/index.ts', import.meta.url).pathname,
      '@ai-agent-study/observability': new URL('./packages/observability/src/index.ts', import.meta.url).pathname,
      '@ai-agent-study/prompt': new URL('./packages/prompt/src/index.ts', import.meta.url).pathname,
      '@ai-agent-study/retrieval': new URL('./packages/retrieval/src/index.ts', import.meta.url).pathname,
      '@ai-agent-study/server': new URL('./packages/server/src/index.ts', import.meta.url).pathname,
      '@ai-agent-study/tools': new URL('./packages/tools/src/index.ts', import.meta.url).pathname,
      '@ai-agent-study/vectorstore': new URL('./packages/vectorstore/src/index.ts', import.meta.url).pathname,
      '@ai-agent-study/workspace': new URL('./packages/workspace/src/index.ts', import.meta.url).pathname,
    },
  },
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
