// 测试专用 fixture，保证各包测试用同一套合法 env，避免漂移

const longSecret = 'x'.repeat(32)

export const TEST_ENV: Record<string, string> = {
  OPENAI_API_KEY: 'test-key',
  DATABASE_URL: 'postgresql://localhost:5432/test',
  SECRET_KEY: longSecret,
  JWT_SECRET: longSecret,
}

export function applyTestEnv(env: Record<string, string> = TEST_ENV): void {
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value
  }
}

export function clearTestEnv(env: Record<string, string> = TEST_ENV): void {
  for (const key of Object.keys(env)) {
    delete process.env[key]
  }
}
