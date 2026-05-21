import { describe, expect, it } from 'vitest'
import { KnowledgeGraph, buildGraphContext } from '../src/index.js'

describe('stage12 GraphRAG', () => {
  it('finds relationship paths for graph context', () => {
    const graph = new KnowledgeGraph()
    graph.upsertEntity({ id: 'a', type: 'person', name: 'Alice' })
    graph.upsertEntity({ id: 'b', type: 'project', name: 'RAG Platform' })
    graph.upsertEntity({ id: 'c', type: 'database', name: 'Neo4j' })
    graph.upsertRelation({ from: 'a', to: 'b', type: 'owns' })
    graph.upsertRelation({ from: 'b', to: 'c', type: 'uses' })

    expect(graph.neighbors('b').map((entity) => entity.name).sort()).toEqual(['Alice', 'Neo4j'])
    expect(buildGraphContext(graph, 'a', 'c')).toContain('Alice -[owns]-> RAG Platform')
  })
})
