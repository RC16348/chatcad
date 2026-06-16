<template>
  <div class="panel params-panel">
    <div class="params-header">
      <span class="params-header-icon">⚙</span>
      参数
      <button
        v-if="params.length"
        class="btn-ghost-tiny"
        @click="$emit('reset')"
      >重置</button>
    </div>
    <div v-if="!params.length" class="params-empty">
      <div class="params-empty-text">无可调参数</div>
    </div>
    <div v-else class="params-list">
      <div v-for="p in params" :key="p.name" class="param-row">
        <span class="param-label">{{ p.label }}</span>
        <input
          type="number"
          :min="p.min"
          :max="p.max"
          :step="getStep(p)"
          :value="p.value"
          @change="handleNumber(p, $event)"
          class="param-input"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ParamDef } from '../utils/params'

defineProps<{
  params: ParamDef[]
}>()

const emit = defineEmits<{
  change: [name: string, value: number]
  reset: []
}>()

function getStep(p: ParamDef): number {
  const range = p.max - p.min
  if (range <= 10) return 0.1
  if (range <= 100) return 1
  return 1
}

function handleNumber(p: ParamDef, e: Event) {
  let val = parseFloat((e.target as HTMLInputElement).value)
  if (isNaN(val)) return
  val = Math.min(p.max, Math.max(p.min, val))
  emit('change', p.name, val)
}
</script>

<style scoped>
.params-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.params-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.params-header-icon {
  font-size: 11px;
}

.btn-ghost-tiny {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 4px;
}

.btn-ghost-tiny:hover {
  background: rgba(255,255,255,0.08);
  color: var(--text-primary);
}

.params-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.params-empty-text {
  font-size: 10px;
  color: var(--text-muted);
}

.params-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  overflow-y: auto;
  min-height: 0;
}

.params-list::-webkit-scrollbar {
  width: 3px;
}

.params-list::-webkit-scrollbar-track {
  background: transparent;
}

.params-list::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.12);
  border-radius: 2px;
}

.param-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.param-label {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.param-input {
  width: 44px;
  flex-shrink: 0;
  padding: 3px 4px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 10px;
  font-family: "SF Mono", Consolas, monospace;
  text-align: center;
  transition: border-color 0.15s;
}

.param-input:focus {
  border-color: var(--accent);
  outline: none;
}
</style>
