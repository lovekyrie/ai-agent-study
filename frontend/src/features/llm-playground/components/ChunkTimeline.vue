<script setup lang="ts">
import type { ChunkLogItem } from '../types'

defineProps<{
  chunks: ChunkLogItem[]
}>()
</script>

<template>
  <section class="timeline" aria-labelledby="timeline-title">
    <div class="panel-heading">
      <h2 id="timeline-title" class="panel-title">
        Chunk timeline
      </h2>
      <span class="count">{{ chunks.length }}</span>
    </div>

    <div v-if="chunks.length" class="chunk-list">
      <article v-for="chunk in chunks" :key="chunk.index" class="chunk-row">
        <div class="chunk-meta">
          <span>#{{ chunk.index }}</span>
          <span>+{{ chunk.offsetMs }} ms</span>
          <span>{{ chunk.accumulatedChars }} chars</span>
        </div>
        <pre class="chunk-delta">{{ chunk.delta }}</pre>
      </article>
    </div>
    <div v-else class="empty-state">
      Stream chunks appear here.
    </div>
  </section>
</template>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 220px;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-title {
  margin: 0;
  color: var(--text-strong);
  font-size: 18px;
  font-weight: 700;
}

.count {
  min-width: 28px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.chunk-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 280px;
  overflow: auto;
}

.chunk-row {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-raised);
}

.chunk-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.chunk-delta {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--text);
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  text-overflow: ellipsis;
  white-space: pre-wrap;
  word-break: break-word;
}

.empty-state {
  display: grid;
  flex: 1;
  min-height: 160px;
  place-items: center;
  border: 1px dashed var(--border-strong);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 14px;
}

@media (max-width: 720px) {
  .chunk-row {
    grid-template-columns: 1fr;
  }
}
</style>
