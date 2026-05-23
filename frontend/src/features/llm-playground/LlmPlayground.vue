<script setup lang="ts">
import { onMounted } from 'vue'
import ChunkTimeline from './components/ChunkTimeline.vue'
import PromptPanel from './components/PromptPanel.vue'
import RequestSummary from './components/RequestSummary.vue'
import ResponsePanel from './components/ResponsePanel.vue'
import { useLlmPlayground } from './composables/useLlmPlayground'

const playground = useLlmPlayground()

onMounted(() => {
  void playground.loadHealth()
})
</script>

<template>
  <main class="playground">
    <div class="playground-header">
      <div>
        <h1 class="title">
          LLM 调试台
        </h1>
        <p class="subtitle">
          对比普通返回和流式返回，所有请求都通过后端 API 调用真实 LLM。
        </p>
      </div>
    </div>

    <div class="workspace">
      <PromptPanel
        :form="playground.form"
        :is-running="playground.isRunning.value"
        :can-submit="playground.canSubmit.value"
        @update-field="playground.updateField"
        @run-chat="playground.runChat"
        @run-stream="playground.runStream"
        @stop="playground.stop"
      />

      <div class="result-column">
        <RequestSummary
          :mode="playground.mode.value"
          :status="playground.status.value"
          :metadata="playground.metadata.value"
          :health="playground.health.value"
          :chunk-count="playground.chunks.value.length"
        />
        <ResponsePanel
          :content="playground.content.value"
          :status="playground.status.value"
          :error="playground.error.value"
        />
        <ChunkTimeline :chunks="playground.chunks.value" />
      </div>
    </div>
  </main>
</template>

<style scoped>
.playground {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 100vh;
  padding: 24px;
}

.playground-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
}

.title {
  margin: 0;
  color: var(--text-strong);
  font-size: 28px;
  font-weight: 800;
}

.subtitle {
  max-width: 720px;
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.5;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  gap: 18px;
  min-height: 0;
}

.result-column {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

@media (max-width: 980px) {
  .playground {
    padding: 16px;
  }

  .workspace {
    grid-template-columns: 1fr;
  }
}
</style>
