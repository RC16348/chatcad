<template>
  <div class="panel chat-panel">
    <div class="panel-header">
      <div class="panel-title">
        <span class="icon">💬</span>
        AI 对话
      </div>
      <span class="badge" :class="isGenerating ? 'badge-info' : 'badge-success'">
        {{ isGenerating ? '生成中...' : '就绪' }}
      </span>
    </div>
    <div class="panel-body chat-body">
      <div class="chat-history" ref="historyRef">
        <div class="chat-msg system-msg">
          <div class="msg-avatar">🤖</div>
          <div class="msg-content">
            你好！我是 ChatCAD 助手。告诉我你想设计什么，我会为你生成参数化的
            JSCAD 代码。试试下面的示例：
          </div>
        </div>
        <div v-if="!props.messages.length" class="suggestions">
          <button
            v-for="(s, idx) in suggestions"
            :key="idx"
            class="suggestion-btn"
            @click="insertSuggestion(s)"
          >
            {{ s }}
          </button>
        </div>
        <div v-for="(msg, i) in props.messages" :key="i" class="chat-msg" :class="msg.role === 'user' ? 'user-msg' : 'ai-msg'">
          <div class="msg-avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
          <div class="msg-content">{{ msg.content }}</div>
        </div>
      </div>
      <div class="chat-input-area">
        <textarea
          v-model="inputValue"
          class="chat-input"
          :placeholder="inputPlaceholder"
          :disabled="isGenerating"
          rows="1"
          @keydown.enter.prevent="handleSend"
          @keydown.enter.ctrl="handleSend"
          @keydown.enter.meta="handleSend"
        ></textarea>
        <div class="input-footer">
          <span class="hint">按 Enter 发送 · Shift+Enter 换行</span>
          <div class="input-footer-actions">
            <button v-if="isGenerating" class="btn btn-danger send-btn" @click="$emit('cancel')">
              <span class="icon">⏹</span>
              停止
            </button>
            <button v-else class="btn btn-primary send-btn" :disabled="!canSend" @click="handleSend">
              <span class="icon">➤</span>
              生成 CAD
            </button>
          </div>
        </div>
        <div class="chat-mode-bar">
          <button
            v-for="m in modeOptions" :key="m.key"
            class="mode-chip"
            :class="{ active: props.generationMode === m.key }"
            @click="emit('update:generationMode', m.key)"
            :title="m.tip"
          >{{ m.label }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps<{
  prompt: string
  isGenerating: boolean
  isAutoFixing: boolean
  generationMode: string
  messages: { role: string; content: string }[]
}>()

const emit = defineEmits<{
  'update:prompt': [val: string]
  'update:generationMode': [val: string]
  send: [val: string]
  cancel: []
}>()

const modeOptions = [
  { key: 'fast', label: '⚡快速', tip: '精简提示词，适合简单模型和快速验证' },
  { key: 'balanced', label: '⚖平衡', tip: '完整提示词+示例，日常使用推荐' },
  { key: 'precision', label: '🎯精准', tip: '双阶段管线：先分析规格再生成，适合复杂模型' },
]

const historyRef = ref<HTMLElement | null>(null)
const inputValue = ref(props.prompt)
const suggestions = [
  '设计一个边长 50mm 的立方体',
  '生成一个带孔的齿轮',
  '创建一个用于桌面的手机支架',
  '制作一个可 3D 打印的收纳盒'
]

const canSend = computed(() => inputValue.value.trim().length > 0 && !props.isGenerating)
const inputPlaceholder = computed(() =>
  props.isGenerating ? 'AI 正在生成代码，请稍候...' : '描述你想要的 3D 模型...'
)

watch(
  () => props.prompt,
  (v) => {
    if (v !== inputValue.value) inputValue.value = v
  }
)

watch(() => props.messages.length, async () => {
  await nextTick()
  if (historyRef.value) historyRef.value.scrollTop = historyRef.value.scrollHeight
})

function insertSuggestion(s: string) {
  if (props.isGenerating) return
  inputValue.value = s
}

function handleSend() {
  if (!canSend.value) return
  const val = inputValue.value.trim()
  emit('update:prompt', val)
  emit('send', val)
  inputValue.value = ''
}
</script>

<style scoped>
.chat-panel {
  min-height: 0;
}

.chat-body {
  display: flex;
  flex-direction: column;
  padding: 14px;
  gap: 12px;
}

.chat-history {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
}

.chat-msg {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
}

.user-msg {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.ai-msg {
  background: var(--bg-primary);
  border: 1px solid var(--border);
}

.system-msg .msg-avatar {
  font-size: 12px;
  flex-shrink: 0;
}

.msg-content {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 0;
}

.suggestion-btn {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 10px;
  border: 1px solid transparent;
  transition: all 0.2s ease;
}

.suggestion-btn:hover {
  background: var(--accent);
  color: white;
  border-color: var(--accent);
  transform: translateY(-1px);
}

.chat-input-area {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 0.2s;
}

.chat-input-area:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.chat-input {
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 11px;
  resize: none;
  line-height: 1.5;
  font-family: inherit;
}

.chat-input::placeholder {
  color: var(--text-muted);
}

.input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px 10px;
}

.input-footer-actions {
  display: flex;
  gap: 6px;
}

.hint {
  font-size: 9px;
  color: var(--text-muted);
}

.send-btn {
  padding: 8px 18px;
}

.chat-mode-bar {
  display: flex;
  gap: 4px;
  padding: 6px 0 0;
}

.mode-chip {
  flex: 1;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  color: var(--text-muted);
  font-size: 10px;
  padding: 5px 0;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: center;
}

.mode-chip:hover {
  background: rgba(255,255,255,0.08);
  color: var(--text-primary);
}

.mode-chip.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
</style>
