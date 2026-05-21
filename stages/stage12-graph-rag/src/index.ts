export interface Entity {
  id: string
  type: string
  name: string
  properties?: Record<string, string | number | boolean>
}

export interface Relation {
  from: string
  to: string
  type: string
  evidence?: string
}

export interface GraphPath {
  entities: Entity[]
  relations: Relation[]
}

export class KnowledgeGraph {
  private readonly entities = new Map<string, Entity>()
  private readonly relations: Relation[] = []

  upsertEntity(entity: Entity): void {
    this.entities.set(entity.id, { ...this.entities.get(entity.id), ...entity })
  }

  upsertRelation(relation: Relation): void {
    if (!this.entities.has(relation.from)) throw new Error(`Missing source entity ${relation.from}`)
    if (!this.entities.has(relation.to)) throw new Error(`Missing target entity ${relation.to}`)
    const exists = this.relations.some((item) => item.from === relation.from && item.to === relation.to && item.type === relation.type)
    if (!exists) this.relations.push(relation)
  }

  neighbors(entityId: string): Entity[] {
    const ids = new Set(
      this.relations
        .filter((relation) => relation.from === entityId || relation.to === entityId)
        .map((relation) => relation.from === entityId ? relation.to : relation.from)
    )
    return Array.from(ids).map((id) => this.entities.get(id)).filter((entity): entity is Entity => Boolean(entity))
  }

  findPaths(from: string, to: string, maxDepth = 3): GraphPath[] {
    const results: GraphPath[] = []
    const visit = (current: string, target: string, visited: string[], relations: Relation[]) => {
      if (visited.length > maxDepth + 1) return
      if (current === target) {
        const entities = visited.map((id) => this.entities.get(id)).filter((entity): entity is Entity => Boolean(entity))
        results.push({ entities, relations })
        return
      }
      for (const relation of this.relations.filter((item) => item.from === current)) {
        if (visited.includes(relation.to)) continue
        visit(relation.to, target, [...visited, relation.to], [...relations, relation])
      }
    }
    visit(from, to, [from], [])
    return results
  }
}

export function buildGraphContext(graph: KnowledgeGraph, from: string, to: string): string {
  const paths = graph.findPaths(from, to)
  if (paths.length === 0) return 'No graph path found.'
  return paths
    .map((path) => path.relations.map((relation, index) => {
      const source = path.entities[index]
      const target = path.entities[index + 1]
      return `${source.name} -[${relation.type}]-> ${target.name}`
    }).join(' | '))
    .join('\n')
}
