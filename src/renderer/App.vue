<template>
  <div class="app-container">
    <header class="app-header">
      <div class="logo">
        <span class="logo-icon">⬢</span>
        <span class="logo-text">ChatCAD</span>
        <span class="logo-sub">AI 参数化 3D 建模</span>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" @click="showModelList = true" :disabled="isGenerating" title="我的模型">
          <span class="icon">📁</span>
          我的模型
        </button>
        <button class="btn btn-secondary" @click="showTemplates = !showTemplates" :disabled="isGenerating" title="模型模板">
          <span class="icon">📐</span>
          模板
        </button>
        <button class="btn btn-secondary" @click="handleSaveModel" :disabled="!jscadCode.trim() || isGenerating" title="保存模型">
          <span class="icon">💾</span>
          保存
        </button>
        <div class="io-dropdown" ref="ioDropdownRef">
          <button class="btn btn-secondary" @click="toggleIODropdown" :disabled="isGenerating" title="导入/导出">
            <span class="icon">📂</span>
            导入/导出
            <span class="dropdown-arrow">▼</span>
          </button>
          <div v-if="showIODropdown" class="io-dropdown-menu">
            <button @click="handleImportSTL(); showIODropdown = false" :disabled="isGenerating">📥 导入 STL</button>
            <button @click="handleExportSTL(); showIODropdown = false" :disabled="!jscadCode.trim() || isRendering || isGenerating">📤 导出 STL</button>
            <button @click="handleExportOBJ(); showIODropdown = false" :disabled="!jscadCode.trim() || isRendering || isGenerating">📤 导出 OBJ</button>
            <button @click="handleExportDXF(); showIODropdown = false" :disabled="!jscadCode.trim() || isRendering || isGenerating">📤 导出 DXF</button>
            <button @click="handleExportDXFAll(); showIODropdown = false" :disabled="!jscadCode.trim() || isRendering || isGenerating">📎 合并导出 DXF</button>
          </div>
        </div>
        <div class="login-group">
          <button class="btn" :class="isLoggedIn ? 'btn-success' : 'btn-primary'" @click="handleLogin">
            <span class="icon">{{ isLoggedIn ? '✓' : '🔑' }}</span>
            {{ isLoggedIn ? '已登录' : '登录 Kimi' }}
          </button>
          <button v-if="isLoggedIn" class="btn btn-ghost" @click="handleTestConnection" :disabled="isTesting" title="测试 AI 连接" style="padding: 4px 10px; font-size: 10px;">
            {{ isTesting ? '测试中…' : '测试连接' }}
          </button>
          <button v-if="isLoggedIn" class="btn btn-ghost" @click="handleLogout" title="退出登录" style="padding: 4px 8px; font-size: 11px;">✕</button>
        </div>
      </div>
    </header>

    <main class="app-main">
      <aside class="left-col">
        <ChatPanel
          v-model:prompt="currentPrompt"
          v-model:generationMode="generationMode"
          :isGenerating="isGenerating"
          :isAutoFixing="isAutoFixing"
          :messages="messages"
          @send="handleSendPrompt"
          @cancel="handleCancelSend"
        />
      </aside>

      <section class="right-col">
        <div class="editor-area">
          <CodeEditor v-model="jscadCode" :isStreaming="isGenerating" @run="handleRunJSCAD" @copied="showToast('复制成功', 'success', 1000)" />
        </div>
        <div class="viewer-area">
          <div class="params-overlay">
            <ParamsPanel :params="paramDefs" @change="handleParamChange" @reset="handleResetParams" />
          </div>
          <ModelViewer
            :vertices="meshVertices"
            :faces="meshFaces"
            :isRendering="isRendering"
            :error="renderError"
          />
        </div>
      </section>
    </main>

    <!-- 保存模型对话框 -->
    <transition name="modal-fade">
      <div v-if="showSaveDialog" class="modal-overlay" @click.self="showSaveDialog = false">
        <div class="modal-dialog">
          <h3 class="modal-title">💾 保存模型</h3>
          <input
            v-model="saveModelName"
            class="modal-input"
            placeholder="输入模型名称..."
            @keydown.enter="confirmSave"
            ref="saveNameInput"
          />
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="showSaveDialog = false">取消</button>
            <button class="btn btn-primary" @click="confirmSave" :disabled="!saveModelName.trim()">保存</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- DXF 视角选择对话框 -->
    <transition name="modal-fade">
      <div v-if="showDxfViewDialog" class="modal-overlay" @click.self="showDxfViewDialog = false">
        <div class="modal-dialog">
          <h3 class="modal-title">📐 选择 DXF 投影视角</h3>
          <div class="dxf-view-grid">
            <button
              v-for="(v, key) in DXF_VIEWS"
              :key="key"
              class="dxf-view-btn"
              :class="{ active: dxfSelectedView === key }"
              @click="dxfSelectedView = key"
            >{{ v.label }}</button>
          </div>
          <div class="modal-actions">
            <button class="btn btn-ghost" @click="showDxfViewDialog = false">取消</button>
            <button class="btn btn-outline" @click="confirmExportDXFAll">📎 合并导出</button>
            <button class="btn btn-primary" @click="confirmExportDXF">导出</button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 模板面板 -->
    <transition name="slide-right">
      <div v-if="showTemplates" class="template-overlay" @click.self="showTemplates = false">
        <div class="template-panel">
          <div class="template-header">
            <h3>📐 模型模板</h3>
            <button class="btn btn-ghost" @click="showTemplates = false">✕ 关闭</button>
          </div>
          <div class="template-grid">      <div v-for="tpl in templates"
              :key="tpl.id"
              class="template-card"
              @click="loadTemplate(tpl)"
            >
              <div class="template-icon">{{ tpl.icon || '⬢' }}</div>
              <div class="template-info">
                <div class="template-name">{{ tpl.name }}</div>
                <div class="template-desc">{{ tpl.description }}</div>
                <div class="template-tags">
                  <span v-for="tag in tpl.tags" :key="tag" class="tag">{{ tag }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 我的模型模态框 -->
    <transition name="modal-fade">
      <div v-if="showModelList" class="modal-overlay" @click.self="showModelList = false">
        <div class="modal-dialog modal-model-list">
          <div class="modal-header">
            <h3 class="modal-title">📁 我的模型</h3>
            <div class="modal-header-actions">
              <span class="badge badge-info" v-if="models.length">{{ models.length }} 个</span>
              <button class="btn btn-ghost" @click="refreshModels" title="刷新">↻</button>
              <button class="btn btn-ghost" @click="showModelList = false">✕</button>
            </div>
          </div>
          <div class="modal-body">
            <div v-if="!models.length" class="empty-state">
              <div class="empty-icon">📦</div>
              <div class="empty-title">暂无保存的模型</div>
              <div class="empty-hint">在上方编辑代码后点击「保存」，或让 AI 生成新的模型。</div>
            </div>
            <div v-else class="models-grid">
              <div v-for="m in models" :key="m.id" class="model-card fade-in">
                <div class="model-card-icon">⬢</div>
                <div class="model-card-body">
                  <div class="model-card-name">{{ m.name }}</div>
                  <div class="model-card-time">{{ formatDate(m.createdAt) }}</div>
                </div>
                <div class="model-card-actions">
                  <button class="btn btn-ghost" title="加载" @click="handleLoadModel(m)" style="padding:4px 8px">📂</button>
                  <button class="btn btn-ghost" title="删除" @click="handleDeleteModel(m)" style="padding:4px 8px;color:var(--danger)">🗑</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="toast">
      <div v-if="toastMsg" class="toast" :class="'toast-' + toastType">{{ toastMsg }}</div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import ChatPanel from './components/ChatPanel.vue'
import CodeEditor from './components/CodeEditor.vue'
import ModelViewer from './components/ModelViewer.vue'
import ParamsPanel from './components/ParamsPanel.vue'
import ModelList from './components/ModelList.vue'
import { parseParams, applyParamValues, formatDate, type ParamDef } from './utils/params'
import JSCADWorker from './jscad.worker?worker'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ==================== 状态 ====================
const token = ref('')
const currentPrompt = ref('')
const jscadCode = ref('')
const isGenerating = ref(false)
const isRendering = ref(false)
const isDeletingAll = ref(false)
const isTesting = ref(false)
const renderError = ref('')
const meshVertices = ref<number[][]>([])
const meshFaces = ref<number[][]>([])
const paramDefs = ref<ParamDef[]>([])
const models = ref<any[]>([])
const showSaveDialog = ref(false)
const saveModelName = ref('')
const saveNameInput = ref<HTMLInputElement | null>(null)
const showTemplates = ref(false)
const showModelList = ref(false)
const autoFixCount = ref(0)
const originalPrompt = ref('')
const isAutoFixing = ref(false)
const MAX_AUTO_FIX = 10

const generationMode = ref<'fast' | 'balanced' | 'precision'>('balanced')
const backupCode = ref('')
const messages = ref<ChatMessage[]>([])
let streamCancel: (() => void) | null = null
let genId = 0

function buildHistoryContext(): string {
  const msgs = messages.value
  if (msgs.length === 0) return ''
  const recent = msgs.slice(-20) // 最近 10 轮对话
  const parts: string[] = ['## 对话历史']
  for (const m of recent) {
    const label = m.role === 'user' ? '用户' : '助手'
    parts.push(`${label}: ${m.content}`)
  }
  return parts.join('\n\n')
}

function stripToCode(text: string): string {
  let cleaned = text.replace(/```[\w]*\s*/g, '').replace(/```/g, '').trim()
  const lines = cleaned.split('\n')
  let start = -1; let end = -1
  const re = /^\s*(?:const|let|var|function|module\.exports|\/\/)/
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      if (start === -1) start = i
      end = i
    }
  }
  if (start === -1) return cleaned
  // strip leading analysis text + trailing non-code text
  if (start > 0 || end < lines.length - 1) {
    cleaned = lines.slice(start, end + 1).join('\n').trim()
  }
  return cleaned
}

const showDxfViewDialog = ref(false)
const dxfSelectedView = ref('top')
const DXF_VIEWS = {
  top:    { label: '俯视图', axis: [0, 0, 1] },
  bottom: { label: '仰视图', axis: [0, 0, -1] },
  front:  { label: '正视图', axis: [0, 1, 0] },
  back:   { label: '后视图', axis: [0, -1, 0] },
  right:  { label: '右视图', axis: [1, 0, 0] },
  left:   { label: '左视图', axis: [-1, 0, 0] },
} as const

const showIODropdown = ref(false)
const ioDropdownRef = ref<HTMLElement | null>(null)

function toggleIODropdown() { showIODropdown.value = !showIODropdown.value }

function onClickOutsideIO(e: MouseEvent) {
  if (ioDropdownRef.value && !ioDropdownRef.value.contains(e.target as Node)) {
    showIODropdown.value = false
  }
}

const toastMsg = ref('')
const toastType = ref<'success' | 'error' | 'info'>('info')
const isLoggedIn = computed(() => token.value && token.value.startsWith('eyJ'))

const activeParams = computed(() => {
  const out: Record<string, number> = {}
  for (const p of paramDefs.value) out[p.name] = p.value
  return out
})

// ==================== JSCAD WebWorker ====================
let jscadWorker: Worker | null = null
let workerRequestId = 0
let pendingWorkerRequest: number | null = null

function initWorker() {
  if (jscadWorker) return
  try {
    jscadWorker = new JSCADWorker()
    jscadWorker.onmessage = (e: MessageEvent) => {
      const { requestId, success, data, error, elapsed } = e.data
      if (requestId !== pendingWorkerRequest) return // 过期的请求，忽略
      pendingWorkerRequest = null
      isRendering.value = false

      if (success && data && data.vertices) {
        meshVertices.value = data.vertices
        meshFaces.value = data.faces
        if (autoFixCount.value > 0) {
          showToast(`✅ AI 修复成功 (第 ${autoFixCount.value} 次)`, 'success')
        } else if (elapsed) {
          showToast(`${data.vertices.length} 顶点 · ${data.faces.length} 面 (${elapsed.toFixed(0)}ms)`, 'success')
        } else {
          showToast(`${data.vertices.length} 顶点 · ${data.faces.length} 面`, 'success')
        }
        originalPrompt.value = ''
      } else {
        renderError.value = error || '渲染失败'
        meshVertices.value = []
        meshFaces.value = []
        showToast('渲染失败: ' + (error || '未知错误'), 'error')
        triggerAutoFix(error || '渲染失败')
      }
    }
    jscadWorker.onerror = (err) => {
      pendingWorkerRequest = null
      isRendering.value = false
      renderError.value = 'Worker 错误: ' + (err.message || '未知错误')
      meshVertices.value = []
      meshFaces.value = []
      showToast('Worker 执行错误', 'error')
      triggerAutoFix(err.message || 'Worker 执行错误')
    }
  } catch (err: any) {
    console.warn('[Worker] 初始化失败，将回退到主进程执行:', err.message)
    jscadWorker = null
  }
}

function terminateWorker() {
  if (jscadWorker) {
    jscadWorker.terminate()
    jscadWorker = null
  }
}

// ==================== 模板数据 ====================
interface Template {
  id: string
  name: string
  description: string
  icon: string
  tags: string[]
  code: string
}

const templates = ref<Template[]>([
  {
    id: 'tpl-cuboid',
    name: '基础立方体',
    description: '可调节长宽高的长方体',
    icon: '📦',
    tags: ['基础', '入门'],
    code: `// 宽度 unit:mm min:10 max:200 default:80
const width = 80

// 高度 unit:mm min:10 max:200 default:50
const height = 50

// 深度 unit:mm min:10 max:200 default:40
const depth = 40

function main() {
  return jscad.primitives.cuboid({ size: [width, height, depth] })
}

module.exports = { main }`
  },
  {
    id: 'tpl-cylinder',
    name: '圆柱体',
    description: '可调节半径和高度的圆柱',
    icon: '🛢️',
    tags: ['基础', '圆柱'],
    code: `// 半径 unit:mm min:5 max:100 default:30
const radius = 30

// 高度 unit:mm min:5 max:100 default:60
const height = 60

// 分段数 unit: min:3 max:64 default:32
const segments = 32

function main() {
  return jscad.primitives.cylinder({ radius, height, segments })
}

module.exports = { main }`
  },
  {
    id: 'tpl-phone-stand',
    name: '手机支架',
    description: '适合 3D 打印的手机支架',
    icon: '📱',
    tags: ['实用', '3D打印'],
    code: `// 宽度 unit:mm min:30 max:100 default:60
const width = 60

// 深度 unit:mm min:30 max:100 default:50
const depth = 50

// 厚度 unit:mm min:2 max:10 default:5
const thickness = 5

// 挡板高度 unit:mm min:10 max:50 default:20
const lip = 20

function main() {
  const base = jscad.primitives.cuboid({ size: [width, thickness, depth] })
  const back = jscad.primitives.cuboid({ size: [width, lip, thickness] })
  const lipObj = jscad.primitives.cuboid({ size: [width, thickness, 10] })
  return jscad.booleans.union(
    base,
    jscad.transforms.translate([0, lip / 2 + thickness / 2, -depth / 2 + thickness / 2], back),
    jscad.transforms.translate([0, thickness / 2, depth / 2 - 5], lipObj)
  )
}

module.exports = { main }`
  },
  {
    id: 'tpl-gear',
    name: '正齿轮',
    description: '可调节齿数和大小的标准齿轮',
    icon: '⚙️',
    tags: ['机械', '传动'],
    code: `// 齿数 unit: min:6 max:48 default:12
const teeth = 12

// 半径 unit:mm min:10 max:100 default:40
const radius = 40

// 厚度 unit:mm min:2 max:20 default:8
const thickness = 8

// 孔半径 unit:mm min:2 max:20 default:5
const holeRadius = 5

function main() {
  const gear = jscad.primitives.cylinder({ radius, height: thickness, segments: teeth * 2 })
  // 简单的齿轮效果
  return gear
}

module.exports = { main }`
  },
  {
    id: 'tpl-storage-box',
    name: '收纳盒',
    description: '带圆角的分格收纳盒',
    icon: '🗃️',
    tags: ['实用', '收纳'],
    code: `// 长度 unit:mm min:30 max:200 default:100
const length = 100

// 宽度 unit:mm min:30 max:200 default:80
const width = 80

// 高度 unit:mm min:10 max:100 default:40
const height = 40

// 壁厚 unit:mm min:1 max:5 default:2
const wall = 2

function main() {
  const outer = jscad.primitives.cuboid({ size: [length, width, height] })
  const inner = jscad.primitives.cuboid({ size: [length - wall * 2, width - wall * 2, height - wall] })
  return jscad.booleans.subtract(outer, jscad.transforms.translate([0, 0, wall / 2], inner))
}

module.exports = { main }`
  },
  {
    id: 'tpl-bracket',
    name: 'L 型支架',
    description: '用于固定的直角支架',
    icon: '🔩',
    tags: ['支架', '固定'],
    code: `// 长度 unit:mm min:20 max:150 default:80
const length = 80

// 高度 unit:mm min:20 max:150 default:60
const height = 60

// 厚度 unit:mm min:2 max:15 default:6
const thick = 6

// 孔半径 unit:mm min:1 max:8 default:3
const holeR = 3

function main() {
  const vert = jscad.primitives.cuboid({ size: [thick, thick, height] })
  const horz = jscad.primitives.cuboid({ size: [length, thick, thick] })
  const brace = jscad.transforms.rotate([0, 0, -Math.PI / 4],
    jscad.primitives.cuboid({ size: [thick, Math.sqrt(2) * Math.min(length, height) * 0.6, thick] })
  )
  return jscad.booleans.union(
    vert,
    jscad.transforms.translate([0, 0, -height / 2 + thick / 2], horz),
    jscad.transforms.translate([thick / 4, thick / 4, -height / 2 + thick / 2], brace)
  )
}

module.exports = { main }`
  },
  {
    id: 'tpl-cable-clip',
    name: '理线夹',
    description: '用于整理线缆的小夹子',
    icon: '🔌',
    tags: ['整理', '实用'],
    code: `// 宽度 unit:mm min:10 max:40 default:20
const w = 20

// 线径 unit:mm min:2 max:10 default:5
const cableD = 5

// 厚度 unit:mm min:2 max:8 default:4
const t = 4

function main() {
  const body = jscad.primitives.cuboid({ size: [w, t, t + cableD + 2] })
  const hole = jscad.primitives.cylinder({ radius: cableD / 2 + 0.5, height: w })
  return jscad.booleans.subtract(body, jscad.transforms.rotate([0, Math.PI / 2, 0], hole))
}

module.exports = { main }`
  },
  {
    id: 'tpl-lamp-shade',
    name: '灯罩',
    description: '简约风格的台灯灯罩',
    icon: '💡',
    tags: ['创意', '家居'],
    code: `// 底部半径 unit:mm min:20 max:100 default:50
const r1 = 50

// 顶部半径 unit:mm min:10 max:80 default:30
const r2 = 30

// 高度 unit:mm min:20 max:150 default:60
const h = 60

// 厚度 unit:mm min:1 max:5 default:2
const t = 2

function main() {
  const outer = jscad.primitives.cylinderElliptic({ radius: [r1, r1], height: h, segments: 32 })
  const inner = jscad.primitives.cylinderElliptic({ radius: [r1 - t, r1 - t], height: h, segments: 32 })
  return jscad.booleans.subtract(outer, jscad.transforms.translate([0, 0, t / 2], inner))
}

module.exports = { main }`
  }
])

function confirmDelete(msg: string): Promise<boolean> {
  return new Promise((resolve) => {
    const confirmed = window.confirm(msg)
    resolve(confirmed)
  })
}

let toastTimer: any = null
function showToast(msg: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) {
  toastMsg.value = msg
  toastType.value = type
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMsg.value = '' }, duration)
}

// ==================== Kimi 登录/退出 ====================
async function handleLogin() {
  try {
    const res = await (window as any).api.loginKimi()
    if (res && res.token) {
      if (res.verified) {
        token.value = res.token
        showToast(`登录成功 ✅ ${res.name || res.userId || ''}`, 'success')
      } else if (res.token) {
        showToast('Token 无效或已过期，请重新登录', 'error')
      }
    } else if (res && res.error) {
      showToast('登录失败: ' + res.error, 'error')
    } else {
      showToast('登录失败', 'error')
    }
  } catch (err: any) {
    showToast('登录失败: ' + String(err), 'error')
  }
}

async function handleLogout() {
  try {
    await (window as any).api.clearToken()
    token.value = ''
    showToast('已退出登录', 'info')
  } catch (err: any) {
    showToast('退出失败: ' + String(err), 'error')
  }
}

async function handleTestConnection() {
  isTesting.value = true
  try {
    const res = await (window as any).api.testConnection()
    if (res.ok) {
      showToast('AI 连接正常 ✅', 'success')
    } else {
      showToast('AI 连接失败: ' + (res.error || '响应异常: ' + res.response), 'error')
    }
  } catch (err: any) {
    showToast('测试连接失败: ' + String(err), 'error')
  } finally {
    isTesting.value = false
  }
}

async function handleDeleteAllKimiChats() {
  if (!isLoggedIn.value) return
  isDeletingAll.value = true
  try {
    const res = await (window as any).api.deleteAllChats()
    if (res && res.success) {
      showToast(`已清理 ${res.deleted} 条 kimi 聊天记录`, 'success')
    } else if (res && res.error) {
      showToast('清理失败: ' + res.error, 'error')
    } else {
      showToast('清理失败', 'error')
    }
  } catch (err: any) {
    showToast('清理失败: ' + String(err), 'error')
  } finally {
    isDeletingAll.value = false
  }
}

// ==================== AI 对话 ====================

const FAST_PROMPT = `你是 ChatCAD，JSCAD 3D 建模助手。输出纯 JS 代码，勿解释、勿用 markdown 代码块。

## 强制规则
- 以 const/let/var/function 或 // 开头
- 不加解释说明，不加 \`\`\` 代码块
- 最后一行必须是 module.exports = { main }

## 坐标系
Y=向上，X=向右，Z=向前。cylinder/cuboid 底面在 y=0，sphere/ellipsoid 球心在 y=0。

## 堆叠
推荐 stack() 自动定位：stack(底座, 中层, 顶部)。手动：translate([0, 前一层顶面y, 0], 零件)。

## API
 cuboid({size:[w,d,h]}), sphere({radius,segments:32}), cylinder({radius,height,segments}), cone({radius,height}), torus({innerRadius,outerRadius}), ellipsoid({radius:[rx,ry,rz]}), roundedCuboid({size,roundRadius}), polyhedron({points,faces}), text3d(str,size,depth), extrudeLinear({height},polygon({points})), extrudeRotate({segments},polygon({points})), union(a,b,...), subtract(a,b), intersect(a,b), stack(a,b,c,...), translate([x,y,z],g), rotate([rx,ry,rz],g), colorize([r,g,b],g), hull([g1,g2]), degToRad(deg)

## 参数注释
const 半径 = 15  // 半径 unit:mm min:5 max:50

## 禁止
❌ require/import ❌ center:true（用数组） ❌ 小圆柱做齿轮齿（用 polygon+extrudeLinear） ❌ cuboid 模拟文字（用 text3d） ❌ 在 main 内声明参数（全在顶层）`

const BALANCED_PROMPT = `你是 ChatCAD，一个专业的 JSCAD 参数化 3D 建模专家。

## ⚠️ 强制规则（违反将导致代码无法运行）
1. 只输出纯 JavaScript 代码，不包含任何解释文字，不使用 Markdown 代码块（不要有 \`\`\` 标记）
2. 代码最后一行必须是 module.exports = { main }
3. 必须定义 function main() {} 作为入口函数并返回几何体
4. 不要写 require/import 语句，所有 API 函数已全局注入
5. **严禁输出任何分析、解释、思考过程或说明文字**——你的回答必须以 const、let、var、function 或 // 开头

## 坐标系（非常重要！）
\`\`\`
     Y（上/高度）
     |
     |
     o-------X（右/宽度）
    /
   Z（前/深度）
\`\`\`
- Y 轴 = 向上，X 轴 = 向右，Z 轴 = 向前

## 形状位置约定
**cylinder / cuboid / cone 是底部对齐的：**
- cylinder({ height: H }) → 底面在 y=0，顶面在 y=H
- cuboid({ size: [W, H, D] }) → 底面在 y=0，顶面在 y=H（XZ 以原点为中心）
- translate([0, cy, 0], cylinder({ height: H })) → 底面在 y=cy，顶面在 y=cy+H

**sphere / torus / ellipsoid 是居中对齐的：**
- sphere({ radius: R }) → 球心在 y=0，范围 [-R, +R]

**卧式模型（飞机、车、火箭）：**
- ellipsoid({ radius: [R, R, L/2] }) → 长轴已在 Z 方向，无需 rotateX
- 卧置圆柱/炮管：rotate([degToRad(90), 0, 0], cylinder({...}))
- ❌ 常见错误：rotateX(90, ellipsoid(...)) 会把卧式变竖立！绝对不能！

## 多零件堆叠（推荐 stack，零计算误差）
**方法1：stack() 自动堆叠（推荐）**
\`\`\`js
return stack(
  cylinder({ radius: 20, height: 15 }),  // 底座：y 0→15
  cylinder({ radius: 8,  height: 60 }),  // 大臂：y 15→75（自动计算！）
  sphere({ radius: 10 })                 // 顶球：自动计算
)
\`\`\`

**方法2：手动堆叠（只需加法）**
\`\`\`js
const part1 = cylinder({ height: h1 })                            // y: 0→h1
const part2 = translate([0, h1, 0], cylinder({ height: h2 }))    // y: h1→h1+h2
const part3 = translate([0, h1 + h2, 0], cylinder({ height: h3 }))
return union(part1, part2, part3)                                 // y: h1+h2→...
\`\`\`

✅ 只需做 h1 + h2 加法，不用算 1/2 偏移
❌ 错误写法：translate([0, h1/2 + h2/2, 0], ...)

## 全局可用 JSCAD API（直接调用，无需前缀）

### 几何原语
- cuboid({ size: [W,H,D], center: [cx,cy,cz] })
- sphere({ radius, center, segments })
- cylinder({ radius, height, center, segments })  // 竖直圆柱
- cylinder({ radius, height, radiusTop: 0 })      // 圆锥
- cone({ radius, height, center, segments })
- torus({ innerRadius, outerRadius, outerSegments: 64, innerSegments: 24 })
- ellipsoid({ radius: [rx,ry,rz], center })
- roundedCuboid({ size, roundRadius, segments })
- polyhedron({ points, faces })

### 布尔运算
- union(a, b, c, ...)       // 合并
- subtract(a, b, ...)       // 差集
- intersect(a, b, ...)      // 交集
- stack(a, b, c, ...)       // 垂直堆叠（自动定位！推荐）

⚠️ 多色零件直接 return [part1, part2, ...] 数组保留颜色

### 变换
- translate([x, y, z], geom)
- rotate([rx, ry, rz], geom)     // 弧度
- rotateX(angle, geom)           // 绕 X 轴旋转
- scale([sx, sy, sz], geom)

### 拉伸/旋转体
- extrudeLinear({ height }, polygon({ points }))     // 2D 轮廓沿 Y 拉伸
- extrudeRotate({ segments: 48 }, polygon({ points })) // 轮廓绕 Y 轴旋转

**extrudeLinear：** polygon points 为 [x, z] 截面坐标（XZ 平面），从 y=0 拉伸到 y=height
**extrudeRotate：** polygon points 为 [r, h]（半径 ≥ 0, 高度），绕 Y 轴旋转

### 3D 文字
- text3d(str, size, depth, spacing)  // 自动转大写，支持 A-Z 0-9 及常用汉字
⭐ 任何文字/字符需求必须用 text3d！严禁用 cuboid/rectangle 替代！

### 颜色
- colorize([r, g, b], geom)                    // r/g/b 为 0~1
- colorize([r, g, b], geom, 'materialId')      // 着色 + 材质覆盖

常用颜色：钢铁灰[0.5,0.55,0.6]  科技蓝[0.22,0.52,0.88]  警示橙[0.95,0.45,0.1]  军绿[0.22,0.30,0.15]  金色[0.85,0.65,0.1]  深钢色[0.28,0.32,0.38]

### 材质（function main 第一行加注释）
- // @material: silver|gold|chrome|titanium|ceramic|glass|carbon|obsidian|rubber|wood|neon|copper|jade|matte_black

### 工具
- degToRad(degrees)           // 角度转弧度
- Math.PI, Math.sin(), Math.cos(), Math.sqrt()

## 变量声明铁律（违反必报引用错误！）
- 所有参数必须在文件顶层声明 const，不能在 main 内部才声明
- 派生常量（如 const half = total / 2）也必须在顶层声明
- 禁止在 main 内定义后又在 main 外引用

## 参数注释格式
\`\`\`
const radius = 15      // 半径 unit:mm min:5 max:50
const enabled = true   // 是否启用
const style = 'round'  // 形状 options:round|square|hex
\`\`\`

## 严格禁止的模式
1. ❌ 不要用小圆柱拼接做齿轮齿——用 extrudeLinear + polygon 真实齿形
2. ❌ 不要用 cuboid/rectangle 替代文字——必须用 text3d()
3. ❌ 不要在 stack() 内对零件使用 rotateZ——会导致 Y 范围估算错误
4. ❌ 不要写 require/import
5. ❌ 不要用 center: true——用 center: [cx, cy, cz] 数组
6. ❌ 不要 rotateX(90, ellipsoid) 卧置椭球——radius[2] 已经在 Z 方向
7. ❌ colorize 内不能忘记 translate——所有零件从 y=0 开始会重叠
8. ❌ 不要在 main 内部声明参数——必须在顶层声明

## 完整示例集

### 示例1：手机支架（垂直堆叠 + 底部对齐）
\`\`\`js
const baseWidth = 80      // 底座宽度 unit:mm min:60 max:120
const armHeight = 120     // 支臂高度 unit:mm min:80 max:200

function main() {
  const base = cuboid({ size: [baseWidth, 6, 40] })           // y: 0→6
  const arm = translate([0, 6, 0],
    cuboid({ size: [baseWidth - 10, armHeight, 4] })           // y: 6→6+armHeight
  )
  const clip = translate([0, 6 + armHeight, 0],
    cuboid({ size: [baseWidth - 5, 20, 3] })
  )
  return union(base, arm, clip)
}
module.exports = { main }
\`\`\`

### 示例2：工业机械臂（stack + colorize 多部件堆叠）
\`\`\`js
const waistH = 40      // 腰部高度 unit:mm min:25 max:80
const armLen = 95      // 大臂长度 unit:mm min:60 max:180
const toolH = 32       // 工具长度 unit:mm min:15 max:55

function main() {
  // @material: silver
  const dark = [0.28, 0.32, 0.38]; const blue = [0.22, 0.52, 0.88]; const orange = [0.95, 0.45, 0.10]
  const plate = colorize(dark, roundedCuboid({ size: [100, 12, 100], roundRadius: 6 }))
  const waist = colorize(dark, cylinder({ radius: 32, height: waistH }))
  const arm = colorize(blue, translate([0, waistH, 0], cylinder({ radius: 13, height: armLen })))
  const tool = colorize(orange, translate([0, waistH + armLen, 0], cone({ radius: 10, height: toolH })))
  return stack(plate, waist, arm, tool)
}
module.exports = { main }
\`\`\`

### 示例3：飞机（卧置椭球机身 + 主翼 + 尾翼 + 发动机）
\`\`\`js
const fuselageLen = 200   // 机身长度 unit:mm min:100 max:400
const fuselageR = 18      // 机身半径 unit:mm min:10 max:40
const wingSpan = 180      // 翼展 unit:mm min:80 max:360
const halfWing = wingSpan / 2
const engR = fuselageR * 0.5

function main() {
  const body = [0.85,0.88,0.92]; const wing = [0.70,0.75,0.85]; const engine = [0.30,0.33,0.40]
  const fuselage = colorize(body, ellipsoid({ radius: [fuselageR, fuselageR, fuselageLen / 2] }))
  const wingL = colorize(wing, translate([-fuselageR - halfWing/2, 0, -5], cuboid({ size: [halfWing,6,50] })))
  const wingR = colorize(wing, translate([ fuselageR + halfWing/2, 0, -5], cuboid({ size: [halfWing,6,50] })))
  const engY = -(3 + engR)
  const makeEng = (x) => colorize(engine, translate([x, engY, -10], rotate([degToRad(90),0,0], cylinder({ radius: engR, height: 40 }))))
  return union(fuselage, wingL, wingR, makeEng(-25), makeEng(25))
}
module.exports = { main }
\`\`\`

### 示例4：齿轮（extrudeLinear + polygon 真实锯齿轮廓）
\`\`\`js
const toothCount = 16  // 齿数 min:8 max:48
const outerR = 25      // 齿顶圆半径 unit:mm min:10 max:80
const thickness = 8    // 齿轮厚度 unit:mm min:3 max:30

function main() {
  // @material: silver
  const pts = []; const toothHalf = (Math.PI / toothCount) * 0.45
  for (let i = 0; i < toothCount; i++) {
    const a = (i / toothCount) * 2 * Math.PI
    pts.push([outerR * 0.76 * Math.cos(a - toothHalf), outerR * 0.76 * Math.sin(a - toothHalf)])
    pts.push([outerR * Math.cos(a - toothHalf * 0.45), outerR * Math.sin(a - toothHalf * 0.45)])
    pts.push([outerR * Math.cos(a + toothHalf * 0.45), outerR * Math.sin(a + toothHalf * 0.45)])
    pts.push([outerR * 0.76 * Math.cos(a + toothHalf), outerR * 0.76 * Math.sin(a + toothHalf)])
  }
  return colorize([0.52,0.56,0.62], extrudeLinear({ height: thickness }, polygon({ points: pts })))
}
module.exports = { main }
\`\`\`

### 示例5：花瓶（extrudeRotate 旋转体）
\`\`\`js
const vaseH = 100      // 花瓶高度 unit:mm min:60 max:200
const vaseMaxR = 28    // 最大富径 unit:mm min:15 max:60

function main() {
  // @material: ceramic
  return extrudeRotate({ segments: 64 },
    polygon({ points: [
      [0,0], [vaseMaxR*0.6,0], [vaseMaxR,vaseH*0.25],
      [vaseMaxR*0.7,vaseH*0.5], [vaseMaxR*0.85,vaseH*0.72],
      [10,vaseH*0.85], [9,vaseH*0.92], [12,vaseH], [0,vaseH],
    ] })
  )
}
module.exports = { main }
\`\`\`

### 示例6：坦克（横向装配 + 前伸炮管）
\`\`\`js
const hullLength = 160    // 车体长度 unit:mm min:60 max:250
const hullWidth = 80      // 车体宽度 unit:mm min:40 max:150
const hullHeight = 30     // 车体高度 unit:mm min:15 max:60
const gunLength = 100     // 炮管长度 unit:mm min:40 max:180

function main() {
  // @material: silver
  const olive=[0.22,0.30,0.15]; const dark=[0.14,0.14,0.14]; const steel=[0.40,0.42,0.45]
  // 地面 y=0，-Z=车头方向
  const HULL_Y0 = 8; const TURRET_H = 22; const GUN_CY = HULL_Y0 + hullHeight + TURRET_H * 0.45
  const hull = colorize(olive, translate([0, HULL_Y0, 0], cuboid({ size: [hullWidth, hullHeight, hullLength] })))
  const turret = colorize(olive, translate([0, HULL_Y0 + hullHeight, -hullLength * 0.08], cylinder({ radius: 28, height: TURRET_H, segments: 32 })))
  const gun = colorize(steel, translate([0, GUN_CY, -(hullLength / 2 + gunLength / 2)],
    rotate([degToRad(90), 0, 0], cylinder({ radius: 5, height: gunLength, segments: 16 }))))
  const trackL = colorize(dark, translate([-(hullWidth / 2 + 10), 9, 0], cuboid({ size: [14, 18, hullLength + 20] })))
  const trackR = colorize(dark, translate([ hullWidth / 2 + 10, 9, 0], cuboid({ size: [14, 18, hullLength + 20] })))
  return union(hull, turret, gun, trackL, trackR)
}
module.exports = { main }
\`\`\`

### 示例7：3D 文字铭牌（text3d + 底盘）
\`\`\`js
const charSize = 22       // 字高 unit:mm min:10 max:60
const baseR = 65          // 底盘半径 unit:mm min:30 max:120

function main() {
  const base = colorize([0.8, 0.55, 0.12], cylinder({ radius: baseR, height: 8, segments: 64 }))
  const text = colorize([0.95, 0.85, 0.3],
    translate([0, 8, 0], text3d('CAD', charSize, 6))
  )
  return union(base, text)
}
module.exports = { main }
\`\`\`

## 复杂机械设计指南
- 机械臂推荐结构：底盘 → 腰部 → 肩关节 → 大臂 → 肘关节 → 小臂 → 腕关节 → 末端执行器
- 每个主要部件用 union() 组合子细节，再交给 stack() 堆叠
- 关节球侧翼以球心 Y=0 为中心（用负 Y 偏移让翼居中）
- 加强箍（环箍）增加工业质感
- 禁止在 stack() 内使用 rotateZ

## 代码规范
- 所有参数在顶层声明为 const
- 参数注释格式：// 参数名 unit:mm min:X max:X
- 派生量也在顶层声明（const half = full / 2）
- 多色零件 return [part1, part2, ...]
- 最后一行：module.exports = { main }`

const SPEC_EXTRACTION_PROMPT = `你是 ChatCAD 3D 模型分析专家。将用户需求转换为标准 JSON 设计规格。

## 输出规则
- 只输出合法 JSON，不使用代码块
- 从 { 开始，到 } 结束

## JSON 格式
{
  "material": "建议材质ID",
  "params": [{ "name":"参数名", "label":"显示名", "default":数值, "min":最小值, "max":最大值, "unit":"mm" }],
  "parts": ["部件1", "部件2", ...],
  "structure": "空间组成描述",
  "buildOrder": ["步骤1", "步骤2", ...]
}

材质可选：silver|titanium|gold|chrome|ceramic|glass|carbon|obsidian|rubber|copper|jade|wood|neon|matte_black
参数 2~8 个，范围合理
structure 描述部件间位置关系（上下堆叠/左右对称/前后装配）
buildOrder 列出构建步骤顺序
`

const PRECISION_PROMPT = `你是 ChatCAD，严谨的 JSCAD 参数化 3D 建模专家。必须严格遵循坐标规定和编码规范。

## ⚠️ 强制规则
1. 先以 // 注释输出结构分析，再生成代码
2. 只输出纯 JS 代码，不加 \`\`\`，不加解释
3. 最后一行必须是 module.exports = { main }
4. 以 const/let/var/function 或 // 开头

## 坐标系
Y=向上，X=向右，Z=向前

## 形状位置约定
cylinder/cuboid/cone 底面在 y=0，sphere/torus/ellipsoid 球心在 y=0
推荐 stack() 自动堆叠，无需计算偏移
手动堆叠：translate([0, 前层顶面y, 0], 下一层)

## API
cuboid sphere cylinder cone torus ellipsoid roundedCuboid polyhedron text3d
union(a,b,c,...) subtract(a,b) intersect(a,b) stack(a,b,c,...)
translate rotate rotateX scale colorize hull
extrudeLinear({height}, polygon({points}))
extrudeRotate({segments}, polygon({points}))
degToRad(rad)

## 变量铁律
所有参数 const 在顶层声明！不能在 main 内部！
派生量也在顶层：const half = total / 2

## 参数注释
const x = 15  // 说明 unit:mm min:5 max:50

## 材质
// @material: silver|gold|chrome|titanium|ceramic|glass|carbon|obsidian

## 禁止
❌ require/import ❌ center:true ❌ cuboid 做文字（用 text3d）
❌ 小圆柱做齿（用 polygon + extrudeLinear） ❌ stack 内 rotateZ
❌ rotateX(90, ellipsoid) ❌ 参数声明在 main 内

## 分析模板
// 【结构】部件、形状、尺寸
// 【空间】位置关系、对齐方式
// 【参数】可调参数及范围
// 【步骤】1. 2. 3.

## 示例

### 手机支架
\`\`\`js
const baseWidth = 80      // 底座宽度 unit:mm min:60 max:120
const armHeight = 120     // 支臂高度 unit:mm min:80 max:200

function main() {
  const base = cuboid({ size: [baseWidth, 6, 40] })
  const arm = translate([0, 6, 0], cuboid({ size: [baseWidth - 10, armHeight, 4] }))
  const clip = translate([0, 6 + armHeight, 0], cuboid({ size: [baseWidth - 5, 20, 3] }))
  return union(base, arm, clip)
}
module.exports = { main }
\`\`\`

### 机械臂（stack + colorize 多部件）
\`\`\`js
const waistH = 40      // 腰部高度 unit:mm min:25 max:80
const armLen = 95      // 大臂长度 unit:mm min:60 max:180

function main() {
  const dark = [0.28,0.32,0.38]; const blue = [0.22,0.52,0.88]
  const plate = colorize(dark, roundedCuboid({ size: [100, 12, 100], roundRadius: 6 }))
  const waist = colorize(dark, cylinder({ radius: 32, height: waistH }))
  const arm = colorize(blue, translate([0, waistH, 0], cylinder({ radius: 13, height: armLen })))
  const tool = colorize(orange, translate([0, waistH + armLen, 0], cone({ radius: 10, height: toolH })))
  return stack(plate, waist, arm, tool)
}
module.exports = { main }
\`\`\`

### 示例3：飞机（卧置椭球机身 + 翼面）
\`\`\`js
const fuselageLen = 200      // 机身长度 unit:mm min:100 max:400
const fuselageR = 18         // 机身半径 unit:mm min:10 max:40

function main() {
  // ellipsoid radius[2]=fuselageLen/2 为半长轴沿 Z，已卧置
  const body = colorize([0.85,0.88,0.92], ellipsoid({ radius:[fuselageR,fuselageR,fuselageLen/2] }))
  const wingL = colorize([0.70,0.75,0.85], translate([-(fuselageR+45),0,-5], cuboid({size:[90,6,50]})))
  const wingR = colorize([0.70,0.75,0.85], translate([fuselageR+45,0,-5], cuboid({size:[90,6,50]})))
  return union(body, wingL, wingR)
}
module.exports = { main }
\`\`\`

### 示例4：齿轮（extrudeLinear + polygon）
\`\`\`js
const toothCount = 16        // 齿数 min:8 max:48
const outerR = 25            // 齿顶圆半径 unit:mm min:10 max:80
const thickness = 8          // 齿轮厚度 unit:mm min:3 max:30

function main() {
  const pts = []; const toothHalf = (Math.PI / toothCount) * 0.45
  for (let i = 0; i < toothCount; i++) {
    const a = (i / toothCount) * 2 * Math.PI
    pts.push([outerR * 0.76 * Math.cos(a - toothHalf), outerR * 0.76 * Math.sin(a - toothHalf)])
    pts.push([outerR * Math.cos(a - toothHalf * 0.45), outerR * Math.sin(a - toothHalf * 0.45)])
    pts.push([outerR * Math.cos(a + toothHalf * 0.45), outerR * Math.sin(a + toothHalf * 0.45)])
    pts.push([outerR * 0.76 * Math.cos(a + toothHalf), outerR * 0.76 * Math.sin(a + toothHalf)])
  }
  return extrudeLinear({ height: thickness }, polygon({ points: pts }))
}
module.exports = { main }
\`\`\`

### 示例5：花瓶（extrudeRotate 旋转体）
\`\`\`js
const vaseH = 100            // 花瓶高度 unit:mm min:60 max:200
const vaseMaxR = 28          // 最大富径 unit:mm min:15 max:60

function main() {
  return extrudeRotate({ segments: 64 },
    polygon({ points: [
      [0,0], [vaseMaxR*0.6,0], [vaseMaxR,vaseH*0.25],
      [vaseMaxR*0.7,vaseH*0.5], [vaseMaxR*0.85,vaseH*0.72],
      [10,vaseH*0.85], [9,vaseH*0.92], [12,vaseH], [0,vaseH],
    ] })
  )
}
module.exports = { main }
\`\`\`

### 示例6：坦克（横向装配 + 前伸炮管）
\`\`\`js
const hullLength = 160       // 车体长度 unit:mm min:60 max:250
const hullWidth = 80         // 车体宽度 unit:mm min:40 max:150
const hullHeight = 30        // 车体高度 unit:mm min:15 max:60
const gunLength = 100        // 炮管长度 unit:mm min:40 max:180

function main() {
  // 地面 y=0，-Z=车头方向
  const olive=[0.22,0.30,0.15]; const dark=[0.14,0.14,0.14]; const steel=[0.40,0.42,0.45]
  const TRACK_H=18; const HULL_Y0=TRACK_H*0.45; const TURRET_H=22; const GUN_CY=HULL_Y0+hullHeight+TURRET_H*0.45
  const hull=colorize(olive, translate([0,HULL_Y0,0], cuboid({size:[hullWidth,hullHeight,hullLength]})))
  const turret=colorize(olive, translate([0,HULL_Y0+hullHeight,-hullLength*0.08], cylinder({radius:28,height:TURRET_H,segments:32})))
  const gun=colorize(steel, translate([0,GUN_CY,-(hullLength/2+gunLength/2)],
    rotateX(degToRad(-90), cylinder({radius:5,height:gunLength,segments:16}))))
  const trackL=colorize(dark, translate([-(hullWidth/2+10),0,0], cuboid({size:[14,TRACK_H,hullLength+20]})))
  const trackR=colorize(dark, translate([hullWidth/2+10,0,0], cuboid({size:[14,TRACK_H,hullLength+20]})))
  return union(hull, turret, gun, trackL, trackR)
}
module.exports = { main }
\`\`\`

### 示例7：3D 文字铭牌（text3d + 底盘）
\`\`\`js
const charSize = 22          // 字高 unit:mm min:10 max:60
const baseR = 65             // 底盘半径 unit:mm min:30 max:120

function main() {
  const base = colorize([0.8,0.55,0.12], cylinder({ radius: baseR, height: 8, segments: 64 }))
  const text = colorize([0.95,0.85,0.3],
    translate([0, 8, 0], text3d('CAD', charSize, 6))
  )
  return union(base, text)
}
module.exports = { main }
\`\`\`

## 严格规则
1. 必须两步：先分析再编码，不允许跳过分析直接编码
2. 分析部分用 // 注释，不参与实际运行
3. **严禁输出任何分析、解释、思考过程或说明文字**——你的回答必须以 const、let、var、function 或 // 开头
4. 每个部件必须拆分为独立函数，main 只做组合
5. 所有数值必须参数化，不允许硬编码
6. 参数范围确保合理（长度/宽度不能为负）
7. 不要使用 require/import/export，只用 module.exports = { main }
8. 不要在代码中包含任何中文或英文解释性文字（分析注释除外）
9. 多色零件直接 return [part1, part2, ...] 数组保留颜色`

function buildPrompt(mode: string, userPrompt: string) {
  let system: string
  if (mode === 'fast') {
    system = FAST_PROMPT
  } else if (mode === 'precision') {
    system = PRECISION_PROMPT
  } else {
    system = BALANCED_PROMPT
  }
  return system + '\n\n## 用户需求\n' + userPrompt + '\n\n## 输出要求\n请根据需求，输出完整的纯 JavaScript 代码。'
}

function cleanJSCode(raw: string): string {
  return stripToCode(raw)
}

function extractJSON(text: string): any {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(text.substring(start, end + 1))
  } catch {
    return null
  }
}

async function handleSendPrompt(prompt: string) {
  if (!prompt || !prompt.trim()) return
  currentPrompt.value = ''
  if (!isLoggedIn.value) {
    const t = await (window as any).api.getToken()
    if (!t || !t.startsWith('eyJ')) {
      showToast('请先点击「登录 Kimi」按钮登录', 'error')
      return
    }
    token.value = t
  }

  const currentGen = ++genId
  backupCode.value = jscadCode.value
  originalPrompt.value = prompt
  autoFixCount.value = 0
  isAutoFixing.value = false
  isGenerating.value = true
  jscadCode.value = ''
  renderError.value = ''

  messages.value.push({ role: 'user', content: prompt })

  const mode = generationMode.value
  let aiMsgContent = ''

  function onChunk(chunk: string) {
    aiMsgContent += chunk
    jscadCode.value = stripToCode(aiMsgContent)
  }

  function onStreamDone() {
    if (currentGen !== genId) return
    isGenerating.value = false
    streamCancel = null
    jscadCode.value = cleanJSCode(jscadCode.value)
    paramDefs.value = parseParams(jscadCode.value)
    const last = messages.value[messages.value.length - 1]
    if (last && last.role === 'assistant') last.content = '生成完毕，请预览！'
    handleRunJSCAD()
  }

  function onStreamError(err: string) {
    if (currentGen !== genId) return
    isGenerating.value = false
    streamCancel = null
    if (err === '用户中断') {
      jscadCode.value = backupCode.value
      paramDefs.value = parseParams(backupCode.value)
      messages.value.pop()
      showToast('已中断生成', 'info')
    } else {
      jscadCode.value = backupCode.value
      paramDefs.value = parseParams(backupCode.value)
      const last = messages.value[messages.value.length - 1]
      if (last && last.role === 'assistant') messages.value.pop()
      showToast('生成失败: ' + String(err), 'error')
    }
  }

  const codeContext = backupCode.value ? `\n\n## 当前代码\n\`\`\`js\n${backupCode.value}\n\`\`\`` : ''
  const promptWithCode = codeContext ? prompt + codeContext : prompt
  const historyCtx = buildHistoryContext()
  const contextSuffix = historyCtx ? `\n\n${historyCtx}` : ''

  if (mode === 'precision') {
    // ======== 双阶段管线：Spec 提取 → 代码生成 ========
    try {
      // Phase 1: 提取设计规格
      const specPrompt = SPEC_EXTRACTION_PROMPT + '\n\n## 用户需求\n' + promptWithCode + '\n\n## 输出要求\n只输出 JSON，不使用代码块，不加解释。'
      const specText = await (window as any).api.chat(specPrompt)
      if (currentGen !== genId) return

      const spec = extractJSON(specText)

      // 构建增强 Prompt（含 spec + 上下文）
      let enhancedPrompt = buildPrompt('precision', promptWithCode) + contextSuffix
      if (spec) {
        enhancedPrompt += '\n\n## 设计规格\n' + JSON.stringify(spec, null, 2) + '\n\n## 编码要求\n基于上述设计规格，生成完整的纯 JavaScript 代码。'
      }

      messages.value.push({ role: 'assistant', content: '' })
      aiMsgContent = ''

      // Phase 2: 生成代码
      const ret = (window as any).api.chatStream(
        enhancedPrompt,
        onChunk,
        onStreamDone,
        onStreamError,
      )
      streamCancel = ret.cancel
    } catch (err: any) {
      if (currentGen !== genId) return
      isGenerating.value = false
      streamCancel = null
      messages.value.pop()
      showToast('生成失败: ' + String(err), 'error')
    }
  } else {
    // ======== 单阶段：直接生成 ========
    try {
      const fullPrompt = buildPrompt(mode, promptWithCode) + contextSuffix
      messages.value.push({ role: 'assistant', content: '' })
      aiMsgContent = ''

      const ret = (window as any).api.chatStream(
        fullPrompt,
        onChunk,
        onStreamDone,
        onStreamError,
      )
      streamCancel = ret.cancel
    } catch (err: any) {
      if (currentGen !== genId) return
      isGenerating.value = false
      streamCancel = null
      messages.value.pop()
      showToast('生成失败: ' + String(err), 'error')
    }
  }
}

function handleCancelSend() {
  genId++
  if (streamCancel) {
    streamCancel()
    streamCancel = null
  }
  isGenerating.value = false
  const last = messages.value[messages.value.length - 1]
  if (last && last.role === 'assistant') messages.value.pop()
  jscadCode.value = backupCode.value
  paramDefs.value = parseParams(backupCode.value)
  showToast('已中断生成', 'info')
}

// ==================== JSCAD 运行 (WebWorker 优先) ====================
function handleRunJSCAD() {
  if (!jscadCode.value.trim()) return
  isRendering.value = true
  renderError.value = ''

  const codeToRun = applyParamValues(jscadCode.value, activeParams.value)
  const params = { ...activeParams.value }

  // 尝试使用 WebWorker
  initWorker()
  if (jscadWorker) {
    workerRequestId++
    pendingWorkerRequest = workerRequestId
    jscadWorker.postMessage({
      requestId: workerRequestId,
      code: codeToRun,
      params,
    })
    // 设置超时，如果 Worker 超过 15 秒没响应则回退到 IPC
    setTimeout(() => {
      if (pendingWorkerRequest === workerRequestId) {
        console.warn('[Worker] 超时，回退到主进程')
        pendingWorkerRequest = null
        fallbackRunJSCAD(codeToRun, params)
      }
    }, 15000)
    return
  }

  // 回退：通过 IPC 到主进程执行
  fallbackRunJSCAD(codeToRun, params)
}

async function fallbackRunJSCAD(code: string, params: Record<string, number>) {
  try {
    const res = await (window as any).api.runJSCAD(code, params)
    if (res && res.error) {
      renderError.value = res.error
      meshVertices.value = []
      meshFaces.value = []
      showToast('渲染失败: ' + res.error, 'error')
      triggerAutoFix(res.error)
    } else if (res && res.data && res.data.vertices) {
      meshVertices.value = res.data.vertices
      meshFaces.value = res.data.faces
      if (autoFixCount.value > 0) {
        showToast(`✅ AI 修复成功 (第 ${autoFixCount.value} 次)`, 'success')
      } else {
        showToast(`${res.data.vertices.length} 顶点 · ${res.data.faces.length} 面`, 'success')
      }
      originalPrompt.value = ''
    } else {
      showToast('渲染失败', 'error')
    }
  } catch (err: any) {
    renderError.value = String(err)
    showToast('渲染失败: ' + String(err), 'error')
  } finally {
    isRendering.value = false
  }
}

function handleParamChange(name: string, value: number) {
  const p = paramDefs.value.find((x) => x.name === name)
  if (p) {
    p.value = value
    handleRunJSCAD()
  }
}

function handleResetParams() {
  for (const p of paramDefs.value) p.value = p.default
  handleRunJSCAD()
}

// ==================== 保存/加载模型 ====================
async function handleSaveModel() {
  if (!jscadCode.value.trim()) return
  saveModelName.value = '我的模型-' + new Date().toISOString().slice(0, 10)
  showSaveDialog.value = true
  await nextTick()
  saveNameInput.value?.focus()
}

async function confirmSave() {
  const name = saveModelName.value.trim()
  if (!name) return
  showSaveDialog.value = false
  try {
    const res = await (window as any).api.saveModel(name, jscadCode.value, activeParams.value, messages.value)
    if (res && res.id) {
      showToast(`✅ 模型「${name}」保存成功`, 'success')
      refreshModels()
      messages.value = []
      jscadCode.value = ''
      paramDefs.value = []
      meshVertices.value = []
      meshFaces.value = []
      renderError.value = ''
    } else if (res && res.error) {
      showToast('保存失败: ' + res.error, 'error')
    } else {
      showToast('保存失败', 'error')
    }
  } catch (err: any) {
    showToast('保存失败: ' + String(err), 'error')
  }
}

async function refreshModels() {
  try {
    const list = await (window as any).api.loadModels()
    models.value = Array.isArray(list) ? list : []
  } catch (err: any) {
    showToast('加载模型列表失败: ' + String(err), 'error')
  }
}

function handleLoadModel(model: any) {
  if (!model) return
  showModelList.value = false
  messages.value = Array.isArray(model.messages) ? model.messages : []
  jscadCode.value = model.code || ''
  paramDefs.value = parseParams(jscadCode.value)
  if (model.params && typeof model.params === 'object') {
    for (const p of paramDefs.value) {
      if (model.params[p.name] !== undefined) p.value = Number(model.params[p.name])
    }
  }
  handleRunJSCAD()
  showToast(`已加载：${model.name}`, 'success')
}

async function handleDeleteModel(model: any) {
  if (!window.confirm(`确定要删除模型「${model.name}」吗？\n此操作不可撤销。`)) return
  try {
    await (window as any).api.deleteModel(model.id)
    refreshModels()
    showToast(`已删除「${model.name}」`, 'success')
  } catch (err: any) {
    showToast('删除失败: ' + String(err), 'error')
  }
}

// ==================== 模板 ====================
function loadTemplate(tpl: Template) {
  jscadCode.value = tpl.code
  paramDefs.value = parseParams(jscadCode.value)
  showTemplates.value = false
  handleRunJSCAD()
  showToast(`已加载模板：${tpl.name}`, 'success')
}

// ==================== 导入 ====================
async function handleImportSTL() {
  try {
    const res = await (window as any).api.importSTL()
    if (res && res.canceled) return
    if (res && res.error) {
      showToast('导入失败: ' + res.error, 'error')
      return
    }
    if (res && res.code) {
      jscadCode.value = res.code
      paramDefs.value = parseParams(jscadCode.value)
      handleRunJSCAD()
      showToast(`已导入 STL：${res.fileName || ''}`, 'success')
    }
  } catch (err: any) {
    showToast('导入失败: ' + String(err), 'error')
  }
}

// ==================== 导出 ====================
async function handleExportSTL() {
  try {
    const codeToExport = applyParamValues(jscadCode.value, activeParams.value)
    const res = await (window as any).api.exportSTL(codeToExport, activeParams.value)
    if (res && res.ok) showToast('STL 导出成功：' + res.filePath, 'success')
    else if (res && res.error) showToast('导出失败: ' + res.error, 'error')
    else showToast('导出失败', 'error')
  } catch (err: any) {
    showToast('导出失败: ' + String(err), 'error')
  }
}

async function handleExportOBJ() {
  try {
    const codeToExport = applyParamValues(jscadCode.value, activeParams.value)
    const res = await (window as any).api.exportOBJ(codeToExport, activeParams.value)
    if (res && res.ok) showToast('OBJ 导出成功：' + res.filePath, 'success')
    else if (res && res.error) showToast('导出失败: ' + res.error, 'error')
    else showToast('导出失败', 'error')
  } catch (err: any) {
    showToast('导出失败: ' + String(err), 'error')
  }
}

async function handleExportDXF() {
  dxfSelectedView.value = 'top'
  showDxfViewDialog.value = true
}

async function handleExportDXFAll() {
  try {
    const codeToExport = applyParamValues(jscadCode.value, activeParams.value)
    const res = await (window as any).api.exportDXF(codeToExport, activeParams.value, 'all')
    if (res && res.ok) showToast('合并 DXF 导出成功：' + res.filePath, 'success')
    else if (res && res.error) showToast('合并导出失败: ' + res.error, 'error')
    else if (res && res.canceled) { /* 用户取消 */ }
    else showToast('合并导出失败', 'error')
  } catch (err: any) {
    showToast('合并导出失败: ' + String(err), 'error')
  }
}

async function confirmExportDXF() {
  showDxfViewDialog.value = false
  try {
    const codeToExport = applyParamValues(jscadCode.value, activeParams.value)
    const view = dxfSelectedView.value
    const res = await (window as any).api.exportDXF(codeToExport, activeParams.value, view)
    if (res && res.ok) showToast('DXF 导出成功：' + res.filePath, 'success')
    else if (res && res.error) showToast('导出失败: ' + res.error, 'error')
    else showToast('导出失败', 'error')
  } catch (err: any) {
    showToast('导出失败: ' + String(err), 'error')
  }
}

async function confirmExportDXFAll() {
  showDxfViewDialog.value = false
  try {
    const codeToExport = applyParamValues(jscadCode.value, activeParams.value)
    const res = await (window as any).api.exportDXF(codeToExport, activeParams.value, 'all')
    if (res && res.ok) showToast('合并 DXF 导出成功：' + res.filePath, 'success')
    else if (res && res.error) showToast('合并导出失败: ' + res.error, 'error')
    else showToast('合并导出失败', 'error')
  } catch (err: any) {
    showToast('合并导出失败: ' + String(err), 'error')
  }
}

// ==================== AI 自动修复 ====================
let autoFixGenId = 0

async function triggerAutoFix(errorMsg: string) {
  if (!originalPrompt.value || autoFixCount.value >= MAX_AUTO_FIX) {
    if (autoFixCount.value >= MAX_AUTO_FIX) {
      showToast('AI 自动修复已达最大次数，请尝试修改描述或手动编辑代码', 'error')
      originalPrompt.value = ''
    }
    return
  }
  const currentGen = ++autoFixGenId
  autoFixCount.value++
  isAutoFixing.value = true
  isGenerating.value = true

  const originalCode = jscadCode.value
  const mode = generationMode.value === 'precision' ? 'balanced' : generationMode.value

  messages.value.push({ role: 'assistant', content: '遇到bug，正在修复...' })

  const fixPrompt = buildPrompt(mode, originalPrompt.value)
    + `\n\n## 当前代码（出错）\n\`\`\`js\n${originalCode}\n\`\`\``
    + `\n\n## 错误信息\n${errorMsg}`
    + `\n\n## 修复要求`
    + `\n分析错误原因，只修复有问题的部分。输出完整可运行的纯 JavaScript 代码，不要省略任何行。`
    + `\n你的输出必须以 const、let、var、function 或 // 开头，不能有任何分析文字。`

  let fixContent = ''

  try {
    jscadCode.value = ''
    renderError.value = ''
    const ret = (window as any).api.chatStream(
      fixPrompt,
      (chunk: string) => {
        fixContent += chunk
        jscadCode.value = stripToCode(fixContent)
      },
      () => {
        if (currentGen !== autoFixGenId) return
        isGenerating.value = false
        isAutoFixing.value = false
        const last = messages.value[messages.value.length - 1]
        if (last && last.role === 'assistant') last.content = '修复完成，请预览！'
        const fixed = cleanJSCode(fixContent)
        jscadCode.value = fixed
        paramDefs.value = parseParams(fixed)
        handleRunJSCAD()
      },
      (err: string) => {
        if (currentGen !== autoFixGenId) return
        isGenerating.value = false
        isAutoFixing.value = false
        const last = messages.value[messages.value.length - 1]
        if (last && last.role === 'assistant') last.content = '修复失败'
        jscadCode.value = originalCode
        paramDefs.value = parseParams(originalCode)
        showToast('自动修复失败: ' + String(err), 'error')
      },
    )
    streamCancel = ret.cancel
  } catch (err: any) {
    if (currentGen !== autoFixGenId) return
    isGenerating.value = false
    isAutoFixing.value = false
    const last = messages.value[messages.value.length - 1]
    if (last && last.role === 'assistant') last.content = '修复失败'
    jscadCode.value = originalCode
    showToast('自动修复失败: ' + String(err), 'error')
  }
}

watch(jscadCode, (newVal) => {
  if (!isGenerating.value) {
    paramDefs.value = parseParams(newVal)
  }
})

onMounted(async () => {
  try {
    const t = await (window as any).api.getToken()
    if (t) {
      // 使用 API 验证已保存的 token
      const v = await (window as any).api.validateToken(t)
      if (v.valid) {
        token.value = t
      } else {
        await (window as any).api.clearToken()
      }
    }
  } catch (_) {
    // ignore
  }
  refreshModels()
  document.addEventListener('click', onClickOutsideIO)
})

// 组件卸载时清理 Worker 和事件
onBeforeUnmount(() => {
  terminateWorker()
  document.removeEventListener('click', onClickOutsideIO)
})
</script>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #0f172a 0%, #1a2540 100%);
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: linear-gradient(to right, #1e293b, #1a2540);
  border-bottom: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  z-index: 10;
  flex-shrink: 0;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  font-size: 22px;
  color: var(--accent-light);
  text-shadow: 0 0 12px rgba(96, 165, 250, 0.5);
}

.logo-text {
  font-size: 15px;
  font-weight: 700;
  background: linear-gradient(135deg, #60a5fa, #a78bfa);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: 0.5px;
}

.logo-sub {
  font-size: 10px;
  color: var(--text-muted);
  padding-left: 10px;
  border-left: 1px solid var(--border);
  margin-left: 4px;
}

.header-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.io-dropdown {
  position: relative;
}

.io-dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 160px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  z-index: 100;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.io-dropdown-menu button {
  background: none;
  border: none;
  padding: 8px 14px;
  text-align: left;
  font-size: 11px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.15s;
}

.io-dropdown-menu button:hover {
  background: rgba(255,255,255,0.06);
}

.io-dropdown-menu button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.dropdown-arrow {
  font-size: 8px;
  margin-left: 4px;
  opacity: 0.6;
}

.login-group {
  display: flex;
  gap: 2px;
  align-items: center;
  margin-left: 4px;
  padding-left: 8px;
  border-left: 1px solid var(--border);
}

.app-main {
  flex: 1;
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 14px;
  padding: 14px;
  min-height: 0;
}

.left-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.left-col > :deep(.chat-panel) {
  flex: 1;
  min-height: 0;
}

.right-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  min-height: 0;
}

.editor-area {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.viewer-area {
  min-height: 0;
  overflow: hidden;
  border-radius: 10px;
  position: relative;
}

.params-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 30%;
  min-width: 140px;
  max-width: 220px;
  height: 26.67%;
  z-index: 10;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0 10px 0 0;
}

/* Toast */
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 11px;
  box-shadow: var(--shadow-lg);
  z-index: 9999;
  color: white;
  white-space: nowrap;
}

.toast-success { background: var(--success); }
.toast-error { background: var(--danger); }
.toast-info { background: var(--accent); }

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px);
}

/* 模态对话框 */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal-dialog {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-title {
  margin: 0 0 16px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-input {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 12px;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.modal-input:focus {
  border-color: var(--accent);
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.dxf-view-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
  margin: 12px 0;
}

.dxf-view-btn {
  padding: 10px 8px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.dxf-view-btn:hover {
  border-color: #94a3b8;
  background: #f8fafc;
}

.dxf-view-btn.active {
  border-color: #3b82f6;
  background: #eff6ff;
  color: #2563eb;
  font-weight: 600;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.25s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.modal-model-list {
  width: 520px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  padding: 0;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header .modal-title {
  margin: 0;
}

.modal-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-body {
  flex: 1;
  padding: 16px 20px;
  overflow-y: auto;
  min-height: 0;
}

.models-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: all 0.15s ease;
}

.model-card:hover {
  border-color: var(--accent);
  background: linear-gradient(to right, rgba(59, 130, 246, 0.08), transparent);
  transform: translateX(2px);
}

.model-card-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(167, 139, 250, 0.2));
  color: var(--accent-light);
  font-size: 10px;
  flex-shrink: 0;
}

.model-card-body {
  flex: 1;
  min-width: 0;
}

.model-card-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-card-time {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.model-card-actions {
  display: flex;
  gap: 4px;
}

/* 模板面板 */
.template-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 900;
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(4px);
}

.template-panel {
  width: 480px;
  max-width: 90vw;
  height: 100%;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  box-shadow: -10px 0 40px rgba(0, 0, 0, 0.4);
  transition: transform 0.3s ease;
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.template-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.template-grid {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  align-content: start;
}

.template-card {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  gap: 10px;
}

.template-card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
}

.template-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.template-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.template-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-primary);
}

.template-desc {
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1.4;
}

.template-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  background: rgba(59, 130, 246, 0.12);
  color: var(--accent-light);
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 9px;
}

.slide-right-enter-active .template-panel,
.slide-right-leave-active .template-panel {
  transition: transform 0.3s ease;
}
.slide-right-enter-from .template-panel,
.slide-right-leave-to .template-panel {
  transform: translateX(100%);
}

.slide-right-enter-active,
.slide-right-leave-active {
  transition: opacity 0.25s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  opacity: 0;
}

@media (max-width: 1200px) {
  .app-main {
    grid-template-columns: 320px 1fr;
  }
  .right-top {
    grid-template-columns: 1fr 260px;
  }
}
</style>
