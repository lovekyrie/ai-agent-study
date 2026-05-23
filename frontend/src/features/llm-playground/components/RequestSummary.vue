<script setup lang="ts">
import type { PlaygroundMode, RequestStatus, ResponseMetadata } from '../types'

defineProps<{
  mode: PlaygroundMode
  status: RequestStatus
  metadata: ResponseMetadata | null
  health: { model: string, hasApiKey: boolean } | null
  chunkCount: number
}>()
</script>

<template>
  <section class="summary" aria-label="Request summary">
    <div class="summary-item">
      <span class="summary-label">Mode</span>
      <strong class="summary-value">{{ mode }}</strong>
    </div>
    <div class="summary-item">
      <span class="summary-label">Status</span>
      <strong class="summary-value">{{ status }}</strong>
    </div>
    <div class="summary-item">
      <span class="summary-label">Model</span>
      <strong class="summary-value">{{ metadata?.model || health?.model || 'unknown' }}</strong>
    </div>
    <div class="summary-item">
      <span class="summary-label">API key</span>
      <strong class="summary-value">{{ health?.hasApiKey ? 'configured' : 'missing' }}</strong>
    </div>
    <div class="summary-item">
      <span class="summary-label">Elapsed</span>
      <strong class="summary-value">{{ metadata ? `${metadata.elapsedMs} ms` : '-' }}</strong>
    </div>
    <div class="summary-item">
      <span class="summary-label">Chunks</span>
      <strong class="summary-value">{{ chunkCount }}</strong>
    </div>
    <div class="summary-item summary-wide">
      <span class="summary-label">Usage</span>
      <strong class="summary-value">
        <template v-if="metadata?.usage">
          {{ metadata.usage.promptTokens }} / {{ metadata.usage.completionTokens }} / {{ metadata.usage.totalTokens }}
        </template>
        <template v-else>-</template>
      </strong>
    </div>
  </section>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.summary-item {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.summary-wide {
  grid-column: span 3;
}

.summary-label {
  display: block;
  margin-bottom: 4px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}

.summary-value {
  display: block;
  overflow: hidden;
  color: var(--text-strong);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary-wide {
    grid-column: span 2;
  }
}
</style>
