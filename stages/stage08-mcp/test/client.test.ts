import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MCPClient, MCPHTTPClient } from '../src/client.js'

/* ─────────────────── MCPClient (SDK-backed) ─────────────────── */
describe('MCPClient', () => {
  it('throws when calling listTools before connect', async () => {
    const client = new MCPClient({ serverName: 'test', transport: 'stdio', command: 'echo' })
    await expect(client.listTools()).rejects.toThrow('Not connected')
  })

  it('throws when calling callTool before connect', async () => {
    const client = new MCPClient({ serverName: 'test', transport: 'http', url: 'http://localhost:9999' })
    await expect(client.callTool('foo', {})).rejects.toThrow('Not connected')
  })

  it('throws on invalid transport config (stdio without command)', async () => {
    const client = new MCPClient({ serverName: 'test', transport: 'stdio' })
    await expect(client.connect()).rejects.toThrow()
  })

  it('reports isConnected=false initially', () => {
    const client = new MCPClient({ serverName: 'test', transport: 'stdio', command: 'echo' })
    expect(client.isConnected()).toBe(false)
  })
})

/* ─────────────────── MCPHTTPClient (fetch-based) ─────────────────── */
describe('MCPHTTPClient', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function jsonResponse(data: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => data,
    } as unknown as Response
  }

  it('listTools fetches /tools', async () => {
    const tools = [{ name: 'read', description: 'Read file', inputSchema: {} }]
    mockFetch.mockResolvedValueOnce(jsonResponse(tools))

    const client = new MCPHTTPClient('http://localhost:3000/')
    const result = await client.listTools()

    expect(result).toEqual(tools)
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/tools', { headers: {} })
  })

  it('callTool posts to /tools/call', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ result: 'ok' }))

    const client = new MCPHTTPClient('http://localhost:3000')
    const result = await client.callTool('write', { path: '/tmp/a.txt', content: 'hi' })

    expect(result).toEqual({ result: 'ok' })
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'write', params: { path: '/tmp/a.txt', content: 'hi' } }),
    })
  })

  it('listResources fetches /resources', async () => {
    const resources = [{ uri: 'file:///a.txt', name: 'a.txt', description: 'File A' }]
    mockFetch.mockResolvedValueOnce(jsonResponse(resources))

    const client = new MCPHTTPClient('http://localhost:3000')
    const result = await client.listResources()

    expect(result).toEqual(resources)
  })

  it('readResource encodes URI in query param', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ content: 'hello', mimeType: 'text/plain' }))

    const client = new MCPHTTPClient('http://localhost:3000')
    await client.readResource('file:///tmp/test.txt')

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toContain('/resources/read?uri=')
    expect(url).toContain(encodeURIComponent('file:///tmp/test.txt'))
  })

  it('getPrompt posts to /prompts/get', async () => {
    const promptResult = { messages: [{ role: 'user', content: 'Hello world' }] }
    mockFetch.mockResolvedValueOnce(jsonResponse(promptResult))

    const client = new MCPHTTPClient('http://localhost:3000')
    const result = await client.getPrompt('greet', { name: 'World' })

    expect(result).toEqual(promptResult)
    expect(mockFetch).toHaveBeenCalledWith('http://localhost:3000/prompts/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'greet', args: { name: 'World' } }),
    })
  })

  it('throws on HTTP error status', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(null, 500))

    const client = new MCPHTTPClient('http://localhost:3000')
    await expect(client.listTools()).rejects.toThrow('HTTP 500')
  })

  it('passes custom headers', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]))

    const client = new MCPHTTPClient('http://localhost:3000', { Authorization: 'Bearer token' })
    await client.listTools()

    const callHeaders = (mockFetch.mock.calls[0][1] as any).headers
    expect(callHeaders.Authorization).toBe('Bearer token')
  })

  it('strips trailing slash from baseUrl', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]))

    const client = new MCPHTTPClient('http://localhost:3000/')
    await client.listPrompts()

    const url = mockFetch.mock.calls[0][0] as string
    expect(url).toBe('http://localhost:3000/prompts')
  })
})
