<script setup lang="ts">
import type { PromptFormField, PromptFormState } from '../types'
import { Radio, Send, Square } from 'lucide-vue-next'

defineProps<{
  form: PromptFormState
  isRunning: boolean
  canSubmit: boolean
}>()

const emit = defineEmits<{
  updateField: [field: PromptFormField, value: string | number]
  runChat: []
  runStream: []
  stop: []
}>()

function readText(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value
}

function readNumber(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}
</script>

<template>
  <section class="prompt-panel" aria-labelledby="prompt-title">
    <div class="panel-heading">
      <h2 id="prompt-title" class="panel-title">
        Prompt
      </h2>
      <span class="panel-kicker">Server-side LLM call</span>
    </div>

    <label class="field">
      <span class="field-label">System prompt</span>
      <textarea
        class="textarea textarea-system"
        :value="form.systemPrompt"
        :disabled="isRunning"
        rows="4"
        @input="emit('updateField', 'systemPrompt', readText($event))"
      />
    </label>

    <label class="field field-main">
      <span class="field-label">User prompt</span>
      <textarea
        class="textarea textarea-user"
        :value="form.prompt"
        :disabled="isRunning"
        rows="10"
        @input="emit('updateField', 'prompt', readText($event))"
      />
    </label>

    <div class="controls-grid">
      <label class="field">
        <span class="field-label">Temperature</span>
        <input
          class="input"
          type="number"
          min="0"
          max="2"
          step="0.1"
          :value="form.temperature"
          :disabled="isRunning"
          @input="emit('updateField', 'temperature', readNumber($event))"
        >
      </label>

      <label class="field">
        <span class="field-label">Max tokens</span>
        <input
          class="input"
          type="number"
          min="1"
          max="200000"
          step="1"
          :value="form.maxTokens"
          :disabled="isRunning"
          @input="emit('updateField', 'maxTokens', readNumber($event))"
        >
      </label>
    </div>

    <div class="actions">
      <button class="button button-primary" type="button" :disabled="!canSubmit" @click="emit('runChat')">
        <Send :size="16" aria-hidden="true" />
        普通返回
      </button>
      <button class="button button-secondary" type="button" :disabled="!canSubmit" @click="emit('runStream')">
        <Radio :size="16" aria-hidden="true" />
        流式返回
      </button>
      <button class="button button-danger" type="button" :disabled="!isRunning" @click="emit('stop')">
        <Square :size="16" aria-hidden="true" />
        停止
      </button>
    </div>
  </section>
</template>

<style scoped>
.prompt-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.panel-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.panel-title {
  margin: 0;
  color: var(--text-strong);
  font-size: 18px;
  font-weight: 700;
}

.panel-kicker {
  color: var(--text-muted);
  font-size: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-main {
  min-height: 0;
}

.field-label {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
}

.textarea,
.input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-raised);
  color: var(--text);
  font: inherit;
  outline: none;
  transition: border-color 120ms ease, box-shadow 120ms ease;
}

.textarea {
  resize: vertical;
  padding: 12px;
  line-height: 1.5;
}

.textarea-system {
  min-height: 108px;
}

.textarea-user {
  min-height: 220px;
}

.input {
  height: 40px;
  padding: 0 10px;
}

.textarea:focus,
.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.textarea:disabled,
.input:disabled {
  cursor: not-allowed;
  opacity: 0.68;
}

.controls-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  border: 1px solid transparent;
  border-radius: 6px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.button-primary {
  background: var(--accent);
  color: white;
}

.button-secondary {
  border-color: var(--border-strong);
  background: var(--surface-raised);
  color: var(--text-strong);
}

.button-danger {
  border-color: var(--danger-border);
  background: var(--danger-soft);
  color: var(--danger);
}

@media (max-width: 720px) {
  .controls-grid,
  .actions {
    grid-template-columns: 1fr;
  }
}
</style>
