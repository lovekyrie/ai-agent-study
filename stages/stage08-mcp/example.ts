import {
  MCPServer,
  MCPHTTPClient,
  createMCPTool,
  createMCPResource,
  createMCPPrompt,
} from './src/index.js'

// Example MCP Server with file system tools
function createFileServer(): MCPServer {
  const tools = [
    createMCPTool(
      'file_read',
      'Read contents of a file',
      { path: { type: 'string', description: 'File path to read' } },
      async ({ path }) => {
        // Simulated file read - in real use, would use fs
        return { content: `Content of ${path}`, lines: 10 }
      }
    ),
    createMCPTool(
      'file_write',
      'Write content to a file',
      {
        path: { type: 'string', description: 'File path to write' },
        content: { type: 'string', description: 'Content to write' },
      },
      async ({ path, content }) => {
        // Simulated file write
        return { success: true, path, bytesWritten: (content as string).length }
      }
    ),
    createMCPTool(
      'file_list',
      'List files in a directory',
      { path: { type: 'string', description: 'Directory path' } },
      async ({ path }) => {
        // Simulated directory listing
        return {
          files: [`${path}/file1.txt`, `${path}/file2.txt`],
          directories: [`${path}/subdir`],
        }
      }
    ),
  ]

  const resources = [
    createMCPResource(
      'file:///docs/README.md',
      'README',
      'Project README file',
      'text/markdown',
      '# Project README\n\nThis is the README content.'
    ),
    createMCPResource(
      'file:///docs/API.md',
      'API Documentation',
      'API documentation',
      'text/markdown',
      '# API Documentation\n\nAPI endpoints...'
    ),
  ]

  const prompts = [
    createMCPPrompt(
      'summarize',
      'Summarize a document',
      'Please summarize the following document:\n\n{{content}}',
      [{ name: 'content', description: 'Document content', required: true }]
    ),
    createMCPPrompt(
      'explain_code',
      'Explain how code works',
      'Explain the following code:\n\n```\n{{code}}\n```\n\nFocus on: {{focus}}',
      [
        { name: 'code', description: 'Code to explain', required: true },
        { name: 'focus', description: 'What to focus on', required: false },
      ]
    ),
  ]

  return new MCPServer({
    name: 'file-server',
    version: '1.0.0',
    tools,
    resources,
    prompts,
  })
}

async function main() {
  console.log('=== MCP Demo ===\n')

  // Create and use MCP Server
  console.log('--- MCP Server ---')
  const server = createFileServer()
  console.log('Server manifest:', JSON.stringify(server.getManifest(), null, 2))

  // List available tools
  console.log('\nAvailable tools:', server.listTools())

  // Call a tool
  console.log('\n--- Tool Call ---')
  const result = await server.handleToolCall('file_read', { path: '/docs/README.md' })
  console.log('file_read result:', result)

  // Get a resource
  console.log('\n--- Resource Access ---')
  const resource = server.getResource('file:///docs/README.md')
  console.log('Resource:', resource?.name, '-', resource?.mimeType)

  // Get a prompt
  console.log('\n--- Prompt Template ---')
  const prompt = server.getPrompt('summarize')
  const rendered = prompt?.template.replace('{{content}}', 'Sample document content...')
  console.log('Rendered prompt:', rendered)

  // SDK-backed MCP server object. In a real host, call server.connectStdio()
  // from a server entrypoint and connect to it with MCPClient.
  console.log('\n--- MCP SDK Server ---')
  const sdkServer = server.toSDKServer()
  console.log('SDK server connected:', sdkServer.isConnected())

  // MCP HTTP Client
  console.log('\n--- MCP HTTP Client ---')
  const httpClient = new MCPHTTPClient('http://localhost:3001', {
    'Authorization': 'Bearer token',
  })

  // In a real scenario, you would connect to an actual MCP HTTP server
  try {
    console.log('HTTP client configured for a running MCP-compatible HTTP server')
  } catch (error) {
    console.log('HTTP client ready (server not running)')
  }

  console.log('\n=== Demo Complete ===')
}

main().catch(console.error)
