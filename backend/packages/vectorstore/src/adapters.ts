import type { Collection, IEmbeddingFunction } from 'chromadb'
import type { CollectionStats, ICollection, SearchOptions, SearchResult, VectorDocument } from './types.js'
import { ChromaClient, IncludeEnum } from 'chromadb'
import { InMemoryCollection } from './memory.js'

export interface VectorStoreAdapter extends ICollection {
  upsert: (documents: VectorDocument[]) => Promise<void>
  deleteByFilter: (filter: Record<string, string | number | boolean>) => Promise<void>
}

export class InMemoryVectorStoreAdapter implements VectorStoreAdapter {
  constructor(private readonly collection = new InMemoryCollection()) {}

  async add(documents: VectorDocument[]): Promise<void> {
    await this.collection.add(documents)
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    await this.collection.add(documents)
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    return this.collection.search(query, options)
  }

  async delete(ids: string[]): Promise<void> {
    await this.collection.delete(ids)
  }

  async deleteByFilter(filter: Record<string, string | number | boolean>): Promise<void> {
    const results = await this.collection.search('', { topK: Number.MAX_SAFE_INTEGER, filter, minScore: 0 })
    await this.collection.delete(results.map(result => result.document.id))
  }

  async update(id: string, document: Partial<VectorDocument>): Promise<void> {
    await this.collection.update(id, document)
  }

  async stats(): Promise<CollectionStats> {
    return this.collection.stats()
  }
}

export interface ChromaVectorStoreOptions {
  collectionName: string
  path?: string
  tenant?: string
  database?: string
  embeddingFunction?: IEmbeddingFunction
}

export class ChromaVectorStore implements VectorStoreAdapter {
  private readonly client: ChromaClient
  private collection?: Collection

  constructor(private readonly options: ChromaVectorStoreOptions) {
    this.client = new ChromaClient({
      path: options.path,
      tenant: options.tenant,
      database: options.database,
    })
  }

  async add(documents: VectorDocument[]): Promise<void> {
    await this.upsert(documents)
  }

  async upsert(documents: VectorDocument[]): Promise<void> {
    if (documents.length === 0)
      return
    const collection = await this.getCollection()
    await collection.upsert({
      ids: documents.map(doc => doc.id),
      documents: documents.map(doc => doc.content),
      embeddings: documents.every(doc => doc.embedding) ? documents.map(doc => doc.embedding as number[]) : undefined,
      metadatas: documents.map(doc => doc.metadata ?? {}),
    })
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const collection = await this.getCollection()
    const response = await collection.query({
      queryTexts: query,
      nResults: options?.topK ?? 5,
      where: options?.filter,
      include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances],
    })
    const ids = response.ids[0] ?? []
    const documents = response.documents[0] ?? []
    const metadatas = response.metadatas[0] ?? []
    const distances = response.distances?.[0] ?? []

    return ids
      .map((id, index) => {
        const distance = distances[index] ?? 0
        return {
          document: {
            id,
            content: documents[index] ?? '',
            metadata: metadatas[index] ?? undefined,
          },
          score: 1 / (1 + Math.max(0, distance)),
        }
      })
      .filter(result => result.score >= (options?.minScore ?? 0))
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0)
      return
    const collection = await this.getCollection()
    await collection.delete({ ids })
  }

  async deleteByFilter(filter: Record<string, string | number | boolean>): Promise<void> {
    const collection = await this.getCollection()
    await collection.delete({ where: filter })
  }

  async update(id: string, document: Partial<VectorDocument>): Promise<void> {
    const collection = await this.getCollection()
    await collection.update({
      ids: id,
      documents: document.content,
      embeddings: document.embedding,
      metadatas: document.metadata,
    })
  }

  async stats(): Promise<CollectionStats> {
    const collection = await this.getCollection()
    return { name: this.options.collectionName, count: await collection.count() }
  }

  private async getCollection(): Promise<Collection> {
    this.collection ??= await this.client.getOrCreateCollection({
      name: this.options.collectionName,
      embeddingFunction: this.options.embeddingFunction,
    })
    return this.collection
  }
}
