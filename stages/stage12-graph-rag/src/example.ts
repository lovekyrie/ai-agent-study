import { KnowledgeGraph, buildGraphContext } from './index.js'

const graph = new KnowledgeGraph()
graph.upsertEntity({ id: 'agent', type: 'concept', name: 'Agent' })
graph.upsertEntity({ id: 'rag', type: 'concept', name: 'RAG' })
graph.upsertEntity({ id: 'vector', type: 'tech', name: 'Vector DB' })
graph.upsertRelation({ from: 'agent', to: 'rag', type: 'uses' })
graph.upsertRelation({ from: 'rag', to: 'vector', type: 'retrieves_from' })

console.log(buildGraphContext(graph, 'agent', 'vector'))
