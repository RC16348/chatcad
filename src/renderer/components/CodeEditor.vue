<template>
  <div class="panel code-panel">
    <div class="panel-header">
      <div class="panel-title">
        <span class="icon">{ }</span>
        JSCAD 代码编辑器
      </div>
      <div class="code-actions">
        <span class="badge" v-if="isStreaming">⏳</span>
        <span class="badge badge-info" v-else>{{ lineCount }}L</span>
        <button class="btn btn-ghost" @click="copyCode" :disabled="isStreaming || !modelValue.trim()" title="复制">📋</button>
        <button class="btn btn-primary" @click="$emit('run')" :disabled="isStreaming || !modelValue.trim()" title="运行">▶</button>
      </div>
    </div>
    <div class="code-body" ref="editorContainer"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

// Vite 会自动将这些 worker 打包为独立文件
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

// 配置 Monaco Worker 加载
;(self as any).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker()
    }
    if (label === 'json') {
      return new jsonWorker()
    }
    return new editorWorker()
  }
}

import * as monaco from 'monaco-editor'

const props = defineProps<{
  modelValue: string
  isStreaming: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [val: string]
  run: []
  copied: []
}>()

const editorContainer = ref<HTMLDivElement | null>(null)
const lineCount = ref(1)

let editor: monaco.editor.IStandaloneCodeEditor | null = null
let lastStreamingCode = ''

// 定义 JSCAD 语法高亮
function defineJSCADLanguage() {
  monaco.languages.register({ id: 'jscad' })

  monaco.languages.setMonarchTokensProvider('jscad', {
    defaultToken: '',
    tokenPostfix: '.jscad',

    keywords: [
      'function', 'const', 'let', 'var', 'return', 'if', 'else', 'for', 'while',
      'do', 'switch', 'case', 'break', 'continue', 'new', 'this', 'typeof',
      'instanceof', 'void', 'delete', 'in', 'of', 'import', 'export', 'from',
      'true', 'false', 'null', 'undefined', 'module', 'require'
    ],

    jscadFunctions: [
      'cuboid', 'sphere', 'cylinder', 'cylinderElliptic', 'ellipsoid',
      'roundedCuboid', 'roundedCylinder', 'torus', 'polyhedron',
      'circle', 'square', 'polygon', 'ellipse', 'cube',
      'union', 'subtract', 'intersect', 'scission',
      'translate', 'rotate', 'scale', 'mirror', 'center',
      'centerX', 'centerY', 'centerZ', 'transform',
      'colorize', 'colorNameToRgb', 'hexToRgb', 'hslToRgb', 'rgbToHex',
      'expand', 'offset', 'hull', 'hullChain', 'chain_hull',
      'degToRad', 'radToDeg'
    ],

    typeKeywords: ['number', 'string', 'boolean', 'any', 'void'],

    brackets: [
      { open: '{', close: '}', token: 'delimiter.curly' },
      { open: '[', close: ']', token: 'delimiter.square' },
      { open: '(', close: ')', token: 'delimiter.parenthesis' },
    ],

    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*[^]*?\*\//, 'comment'],
        [/[{}()\[\]]/, '@brackets'],
        [/\d+\.?\d*/, 'number'],
        [/("[^"]*")|('[^']*')|(`[^`]*`)/, 'string'],
        [
          /[a-zA-Z_$][\w$]*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@jscadFunctions': 'function',
              '@typeKeywords': 'type',
              '@default': 'identifier'
            }
          }
        ],
        [/\s+/, 'white'],
      ],
    },
  })

  // 设置 JSCAD 语法为 JavaScript 超集
  monaco.languages.setLanguageConfiguration('jscad', {
    comments: {
      lineComment: '//',
      blockComment: ['/*', '*/'],
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: "'", close: "'" },
      { open: '"', close: '"' },
      { open: '`', close: '`' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: "'", close: "'" },
      { open: '"', close: '"' },
      { open: '`', close: '`' },
    ],
  })
}

function initEditor() {
  if (!editorContainer.value) return

  // 注册 JSCAD 语法
  try {
    defineJSCADLanguage()
  } catch (_) {
    // 可能已注册
  }

  // 定义深色主题
  monaco.editor.defineTheme('chatcad-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: '569CD6' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'identifier', foreground: '9CDCFE' },
    ],
    colors: {
      'editor.background': '#0b1220',
      'editor.foreground': '#e2e8f0',
      'editor.lineHighlightBackground': '#1a2540',
      'editor.selectionBackground': '#264f78',
      'editor.inactiveSelectionBackground': '#3a3d41',
      'editorCursor.foreground': '#60a5fa',
      'editorLineNumber.foreground': '#475569',
      'editorLineNumber.activeForeground': '#94a3b8',
      'editor.selectionHighlightBackground': '#add6ff26',
      'editorBracketMatch.background': '#0d3a58',
      'editorBracketMatch.border': '#3794ff',
      'editorGutter.background': '#0a1120',
      'editorWidget.background': '#1e293b',
      'editorWidget.border': '#334155',
      'editorSuggestWidget.background': '#1e293b',
      'editorSuggestWidget.border': '#334155',
      'editorSuggestWidget.selectedBackground': '#264f78',
      'focusBorder': '#3b82f6',
      'scrollbarSlider.background': '#33415580',
      'scrollbarSlider.hoverBackground': '#47556980',
      'scrollbarSlider.activeBackground': '#60a5fa80',
    },
  })

  editor = monaco.editor.create(editorContainer.value, {
    value: props.modelValue || '',
    language: 'jscad',
    theme: 'chatcad-dark',
    fontSize: 12,
    fontFamily: '"SF Mono", "JetBrains Mono", "Fira Code", Consolas, Menlo, monospace',
    lineHeight: 1.6,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    wordWrap: 'off',
    renderLineHighlight: 'line',
    cursorBlinking: 'smooth',
    cursorSmoothCaretAnimation: 'on',
    smoothScrolling: true,
    padding: { top: 12, bottom: 12 },
    folding: true,
    foldingHighlight: false,
    lineNumbersMinChars: 3,
    glyphMargin: false,
    renderIndentGuides: false,
    guides: { indentation: false },
    bracketPairColorization: { enabled: true },
    matchBrackets: 'never',
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    formatOnPaste: true,
  })

  // 监听编辑器内容变化：同步到父组件 + 更新行数
  editor.onDidChangeModelContent(() => {
    if (!editor) return
    const value = editor.getValue()
    lastStreamingCode = value
    lineCount.value = editor.getModel()?.getLineCount() || 1
    emit('update:modelValue', value)
  })

  // Ctrl+Enter / Cmd+Enter 运行
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
    emit('run')
  })
}

function handleFormatCode() {
  if (!editor) return
  // 简单的格式化：重新排列缩进
  editor.getAction('editor.action.formatDocument')?.run()?.catch(() => {
    // fallback: 没有格式化器，忽略
  })
}

function copyCode() {
  if (!editor) return
  const value = editor.getValue()
  if (!value) return
  navigator.clipboard?.writeText(value).catch(() => {
    const ta = document.createElement('textarea')
    ta.value = value
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  })
  emit('copied')
}

// 监听外部 modelValue 变化（如 AI 流式生成）
watch(
  () => props.modelValue,
  (newVal) => {
    if (!editor) return
    const currentVal = editor.getValue()
    // 只在内容真正变化时更新，避免光标跳转
    if (newVal !== currentVal) {
      lastStreamingCode = newVal
      editor.setValue(newVal)
    }
  }
)

// AI 流式生成时自动滚动到底部
watch(
  () => props.isStreaming,
  (streaming) => {
    if (streaming && editor) {
      // 使用 RAF 轮询新内容并滚动
      const scrollInterval = setInterval(() => {
        if (!editor || !props.isStreaming) {
          clearInterval(scrollInterval)
          return
        }
        const lineCount2 = editor.getModel()?.getLineCount() || 0
        editor.revealLineNearTop(lineCount2)
      }, 200)
    }
  }
)

onMounted(() => {
  nextTick(() => {
    initEditor()
  })
})

onBeforeUnmount(() => {
  if (editor) {
    editor.dispose()
    editor = null
  }
})
</script>

<style scoped>
.code-panel {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.code-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.code-body {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.code-body :deep(.monaco-editor .margin) {
  background: #0a1120 !important;
}

.code-body :deep(.monaco-editor .monaco-editor-background) {
  background: #0b1220 !important;
}
</style>
