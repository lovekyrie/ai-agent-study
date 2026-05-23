import { serve } from '@hono/node-server'
import { createApiApp } from './app.js'
import { readApiConfig } from './config.js'

const config = readApiConfig()
const app = createApiApp({ config })

serve({
  fetch: app.fetch,
  port: config.port,
})

process.stdout.write(`API server listening on http://localhost:${config.port}\n`)
