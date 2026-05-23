<script setup lang="ts">
import type { RequestStatus } from '../types'
import { AlertCircle, LoaderCircle } from 'lucide-vue-next'

defineProps<{
  content: string
  status: RequestStatus
  error: string | null
}>()
</script>

<template>
  <section class="response-panel" aria-labelledby="response-title">
    <div class="panel-heading">
      <h2 id="response-title" class="panel-title">
        Response
      </h2>
      <div v-if="status === 'running'" class="status-pill">
        <LoaderCircle class="spin" :size="14" aria-hidden="true" />
        running
      </div>
    </div>

    <div v-if="error" class="error-box" role="alert">
      <AlertCircle :size="16" aria-hidden="true" />
      <span>{{ error }}</span>
    </div>

    <pre v-if="content" class="response-text">{{ content }}</pre>
    <div v-else class="empty-state">
      No response yet.
    </div>
  </section>
</template>

<style scoped>
.response-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  min-height: 260px;
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

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
}

.spin {
  animation: spin 1s linear infinite;
}

.error-box {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--danger-border);
  border-radius: 6px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 14px;
}

.response-text {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 16px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-raised);
  color: var(--text);
  font: 14px/1.6 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.empty-state {
  display: grid;
  flex: 1;
  min-height: 180px;
  place-items: center;
  border: 1px dashed var(--border-strong);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 14px;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
