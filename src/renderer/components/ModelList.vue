<template>
  <div class="panel model-list-panel">
    <div class="panel-header">
      <div class="panel-title">
        <span class="icon">📁</span>
        我的模型
      </div>
      <div class="list-actions">
        <span class="badge badge-info" v-if="models.length">{{ models.length }} 个</span>
        <button class="btn btn-ghost" style="padding: 4px 10px" @click="$emit('refresh')">
          <span class="icon">↻</span>
        </button>
      </div>
    </div>
    <div class="panel-body list-body">
      <div v-if="!models.length" class="empty-state">
        <div class="empty-icon">📦</div>
        <div class="empty-title">暂无保存的模型</div>
        <div class="empty-hint">
          在上方编辑代码后点击「保存模型」，<br />
          或让 AI 生成新的模型。
        </div>
      </div>

      <div v-else class="models-list">
        <div v-for="m in models" :key="m.id" class="model-item fade-in">
          <div class="model-info" @click="$emit('load', m)">
            <div class="model-icon">⬢</div>
            <div class="model-text">
              <div class="model-name">{{ m.name }}</div>
              <div class="model-time">{{ formatDate(m.createdAt) }}</div>
            </div>
          </div>
          <div class="model-actions">
            <button class="btn-icon" title="加载" @click="$emit('load', m)">
              <span>📂</span>
            </button>
            <button class="btn-icon danger" title="删除" @click="$emit('delete', m)">
              <span>🗑</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatDate } from '../utils/params'

defineProps<{
  models: any[]
}>()

defineEmits<{
  load: [model: any]
  delete: [model: any]
  refresh: []
}>()
</script>

<style scoped>
.model-list-panel {
  min-height: 0;
}

.list-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.list-body {
  padding: 14px;
  overflow-y: auto;
}

.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 10px;
  color: var(--text-muted);
}

.empty-icon {
  font-size: 26px;
  opacity: 0.5;
}

.empty-title {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
}

.empty-hint {
  font-size: 10px;
  line-height: 1.7;
}

.models-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: all 0.15s ease;
}

.model-item:hover {
  border-color: var(--accent);
  background: linear-gradient(to right, rgba(59, 130, 246, 0.08), transparent);
  transform: translateX(2px);
}

.model-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  min-width: 0;
}

.model-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(167, 139, 250, 0.2));
  color: var(--accent-light);
  font-size: 9px;
  flex-shrink: 0;
}

.model-text {
  min-width: 0;
  flex: 1;
}

.model-name {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-time {
  font-size: 9px;
  color: var(--text-muted);
  margin-top: 2px;
}

.model-actions {
  display: flex;
  gap: 4px;
}

.btn-icon {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.btn-icon:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-icon.danger:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}
</style>
