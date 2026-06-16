<template>
  <div class="panel viewer-panel">
    <div class="panel-header">
      <div class="panel-title">
        <span class="icon">🎨</span>
        3D 预览
      </div>
      <div class="viewer-actions">
        <span class="badge badge-info" v-if="vertices.length">
          {{ vertices.length }}v · {{ faces.length }}f
        </span>
        <span class="badge" v-else-if="!isRendering">∅</span>
        <div class="view-mode-group">
          <button
            v-for="m in viewModes" :key="m.key"
            class="mode-tab"
            :class="{ active: viewMode === m.key }"
            @click="setViewMode(m.key)"
            :title="m.label"
          >{{ m.icon }}</button>
        </div>
        <button class="btn btn-ghost" @click="resetCamera" title="重置视角">⟲</button>
        <button class="btn btn-ghost" @click="toggleAutoRotate" :title="autoRotate ? '停止旋转' : '自动旋转'">{{ autoRotate ? '⏸' : '▶' }}</button>
      </div>
    </div>
    <div class="viewer-body" ref="containerRef">
      <canvas ref="canvasRef" class="three-canvas"></canvas>
      <div v-if="isRendering" class="viewer-overlay">
        <div class="viewer-spinner">
          <span class="spinner" style="width: 28px; height: 28px; border-width: 3px"></span>
          <span>正在渲染 3D 模型...</span>
        </div>
      </div>
      <div v-else-if="error" class="viewer-overlay error">
        <div class="error-icon">⚠</div>
        <div>渲染错误</div>
        <div class="error-text">{{ error }}</div>
      </div>
      <div v-else-if="!vertices.length" class="viewer-overlay empty">
        <div class="empty-icon">⬢</div>
        <div>运行 JSCAD 代码以显示 3D 模型</div>
        <div class="empty-hint">在左侧生成代码，点击「运行预览」</div>
      </div>
      <div class="viewer-hint">
        <span>🖱 左键旋转 · 滚轮缩放 · 右键平移</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const props = defineProps<{
  vertices: number[][]
  faces: number[][]
  isRendering: boolean
  error: string
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)

const scene = shallowRef<THREE.Scene | null>(null)
const camera = shallowRef<THREE.PerspectiveCamera | null>(null)
const renderer = shallowRef<THREE.WebGLRenderer | null>(null)
const controls = shallowRef<OrbitControls | null>(null)
const meshGroup = shallowRef<THREE.Group | null>(null)

const viewMode = ref<'solid' | 'wireframe' | 'mixed' | 'vertex'>('solid')
const viewModes = [
  { key: 'solid', label: '实体', icon: '▣' },
  { key: 'wireframe', label: '线框', icon: '▢' },
  { key: 'mixed', label: '混合', icon: '◈' },
  { key: 'vertex', label: '顶点', icon: '⬩' },
]
const autoRotate = ref(true)
let rafId = 0
let resizeObs: ResizeObserver | null = null
let currentMesh: THREE.Mesh | null = null
let currentEdges: THREE.LineSegments | null = null
let currentPoints: THREE.Points | null = null

function initThree() {
  if (!containerRef.value || !canvasRef.value) return
  const container = containerRef.value
  const canvas = canvasRef.value

  const s = new THREE.Scene()
  s.background = new THREE.Color('#0f172a')
  s.fog = new THREE.Fog('#0f172a', 200, 800)
  scene.value = s

  const w = container.clientWidth
  const h = container.clientHeight
  const cam = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000)
  cam.position.set(120, 100, 140)
  camera.value = cam

  const r = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
  })
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  r.setSize(w, h, false)
  r.shadowMap.enabled = true
  r.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.value = r

  const ctl = new OrbitControls(cam, canvas)
  ctl.enableDamping = true
  ctl.dampingFactor = 0.08
  ctl.minDistance = 10
  ctl.maxDistance = 1000
  ctl.autoRotate = autoRotate.value
  ctl.autoRotateSpeed = 1.0
  controls.value = ctl

  const ambient = new THREE.AmbientLight(0xffffff, 0.45)
  s.add(ambient)

  const dir = new THREE.DirectionalLight(0xffffff, 0.85)
  dir.position.set(150, 200, 100)
  dir.castShadow = true
  dir.shadow.mapSize.set(1024, 1024)
  s.add(dir)

  const dir2 = new THREE.DirectionalLight(0x60a5fa, 0.35)
  dir2.position.set(-100, 80, -120)
  s.add(dir2)

  const gridHelper = new THREE.GridHelper(400, 20, '#334155', '#1e293b')
  ;(gridHelper.material as THREE.Material).transparent = true
  ;(gridHelper.material as THREE.Material).opacity = 0.6
  s.add(gridHelper)

  const axesHelper = new THREE.AxesHelper(40)
  s.add(axesHelper)

  const group = new THREE.Group()
  s.add(group)
  meshGroup.value = group

  animate()

  resizeObs = new ResizeObserver(() => {
    handleResize()
  })
  resizeObs.observe(container)
  window.addEventListener('resize', handleResize)
}

function handleResize() {
  if (!containerRef.value || !renderer.value || !camera.value) return
  const w = containerRef.value.clientWidth
  const h = containerRef.value.clientHeight
  renderer.value.setSize(w, h, false)
  camera.value.aspect = w / h
  camera.value.updateProjectionMatrix()
}

function animate() {
  rafId = requestAnimationFrame(animate)
  if (controls.value) controls.value.update()
  if (renderer.value && scene.value && camera.value) {
    renderer.value.render(scene.value, camera.value)
  }
}

function clearGroup() {
  if (!meshGroup.value) return
  for (const c of meshGroup.value.children) {
    (c as any).geometry?.dispose?.()
    const mats = Array.isArray((c as any).material) ? (c as any).material : [(c as any).material]
    for (const m of mats) m?.dispose?.()
  }
  while (meshGroup.value.children.length) meshGroup.value.remove(meshGroup.value.children[0])
  currentMesh = null; currentEdges = null; currentPoints = null
}

function buildMesh() {
  clearGroup()
  if (!meshGroup.value || !scene.value) return

  const verts = props.vertices
  const faces = props.faces
  if (!verts.length || !faces.length) return

  const positions: number[] = []
  for (const f of faces) {
    if (f.length >= 3) {
      for (let i = 0; i < 3; i++) {
        const v = verts[f[i]]
        if (v) positions.push(v[0], v[1], v[2])
      }
    }
  }

  const geom = new THREE.BufferGeometry()
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geom.computeVertexNormals()
  geom.computeBoundingBox()

  const isMixed = viewMode.value === 'mixed'
  const isVertex = viewMode.value === 'vertex'
  const isWire = viewMode.value === 'wireframe'

  if (!isVertex) {
    const wireframeOnly = isWire
    const mat = new THREE.MeshStandardMaterial({
      color: 0x60a5fa,
      metalness: 0.25,
      roughness: 0.55,
      flatShading: false,
      wireframe: wireframeOnly,
      transparent: isMixed ? true : false,
      opacity: isMixed ? 0.5 : 1,
    })
    const mesh = new THREE.Mesh(geom, mat)
    mesh.castShadow = !isWire
    mesh.receiveShadow = !isWire
    meshGroup.value.add(mesh)
    currentMesh = mesh
  }

  if (isWire || isMixed) {
    const edges = new THREE.EdgesGeometry(geom, 20)
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x93c5fd })
    const line = new THREE.LineSegments(edges, edgeMat)
    meshGroup.value.add(line)
    currentEdges = line
  }

  if (isVertex) {
    const ptMat = new THREE.PointsMaterial({ color: 0x60a5fa, size: 1.5, sizeAttenuation: true })
    const pts = new THREE.Points(geom, ptMat)
    meshGroup.value.add(pts)
    currentPoints = pts
  }

  const bbox = geom.boundingBox
  if (bbox && camera.value && controls.value) {
    const center = new THREE.Vector3()
    bbox.getCenter(center)
    const size = new THREE.Vector3()
    bbox.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    const dist = Math.max(maxDim * 2.2, 60)
    camera.value.position.set(center.x + dist * 0.7, center.y + dist * 0.6, center.z + dist * 0.9)
    controls.value.target.copy(center)
    controls.value.update()
  }
}

function resetCamera() {
  if (!camera.value || !controls.value) return
  camera.value.position.set(120, 100, 140)
  controls.value.target.set(0, 0, 0)
  controls.value.update()
}

function setViewMode(mode: string) {
  viewMode.value = mode as any
  buildMesh()
}

function toggleAutoRotate() {
  autoRotate.value = !autoRotate.value
  if (controls.value) controls.value.autoRotate = autoRotate.value
}

watch(
  () => [props.vertices, props.faces],
  () => { buildMesh() },
  { deep: true }
)

watch(viewMode, () => { buildMesh() })

onMounted(() => {
  initThree()
  buildMesh()
})

onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  if (resizeObs) resizeObs.disconnect()
  window.removeEventListener('resize', handleResize)
  controls.value?.dispose()
  renderer.value?.dispose()
})
</script>

<style scoped>
.viewer-panel {
  min-height: 0;
  height: 100%;
}

.viewer-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.view-mode-group {
  display: flex;
  gap: 1px;
  background: rgba(15,23,42,0.5);
  border-radius: 4px;
  padding: 2px;
}

.mode-tab {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  padding: 2px 5px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1;
}

.mode-tab:hover {
  color: var(--text-primary);
}

.mode-tab.active {
  background: var(--accent);
  color: #fff;
}

.viewer-body {
  flex: 1 1 auto;
  position: relative;
  background: #0b1220;
  overflow: hidden;
  min-height: 0;
  height: 0; /* 让 flex 子项正确收缩 */
}

.three-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.viewer-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: rgba(15, 23, 42, 0.7);
  color: var(--text-secondary);
  font-size: 11px;
  pointer-events: none;
}

.viewer-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  color: var(--accent-light);
}

.viewer-overlay.error {
  background: rgba(239, 68, 68, 0.12);
}

.error-icon {
  font-size: 30px;
  color: var(--danger);
}

.error-text {
  font-size: 10px;
  color: var(--text-muted);
  max-width: 360px;
  text-align: center;
}

.viewer-overlay.empty .empty-icon {
  font-size: 44px;
  color: var(--accent);
  opacity: 0.4;
  animation: pulse 2s ease-in-out infinite;
}

.empty-hint {
  font-size: 10px;
  color: var(--text-muted);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.05);
  }
}

.viewer-hint {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 9px;
  color: var(--text-muted);
  background: rgba(15, 23, 42, 0.75);
  padding: 4px 12px;
  border-radius: 12px;
  border: 1px solid var(--border);
  pointer-events: none;
  z-index: 5;
}
</style>
