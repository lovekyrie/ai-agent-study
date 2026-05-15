import { describe, it, expect, beforeEach } from 'vitest'
import { MCPClient } from '../src/client.js'

describe('MCPClient', () => {
  let client: MCPClient

  beforeEach(() => {
    client = new MCPClient({ type: 'http', url: 'http://localhost:3000' })
  })

  it('should create a client', () => {
    expect(client).toBeInstanceOf(MCPClient)
  })

  it('should not be connected initially', () => {
    expect(client.isConnected()).toBe(false)
  })

  it('should return empty tools before connect', () => {
    expect(client.getTools()).toHaveLength(0)
  })

  it('should return empty resources before connect', () => {
    expect(client.getResources()).toHaveLength(0)
  })

  it('should return empty prompts before connect', () => {
    expect(client.getPrompts()).toHaveLength(0)
  })

  it('should throw when calling tool without connect', async () => {
    await expect(
      client.callTool({ name: 'test', arguments: {} })
    ).rejects.toThrow('not connected')
  })

  it('should throw when reading resource without connect', async () => {
    await expect(client.readResource('test://resource')).rejects.toThrow(
      'not connected'
    )
  })

  it('should return empty LLM format without tools', () => {
    expect(client.toLLMFormat()).toEqual([])
  })

  it('should create stdio client', () => {
    const stdioClient = new MCPClient({
      type: 'stdio',
      command: 'test-server',
    })
    expect(stdioClient).toBeInstanceOf(MCPClient)
  })
})