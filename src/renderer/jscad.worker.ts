/**
 * JSCAD WebWorker
 * - 在后台线程执行用户 JSCAD 代码
 * - 使用 @jscad/modeling 生成几何体
 * - 提取顶点/面/法线/颜色数据返回给主线程
 * - 避免阻塞 UI 线程
 */

import * as modeling from '@jscad/modeling'

interface WorkerRequest {
  requestId: number
  code: string
  params: Record<string, number>
}

interface WorkerResponse {
  requestId: number
  success: boolean
  data?: {
    vertices: number[][]
    faces: number[][]
    normals?: number[][]
    colors?: number[][]
    meta?: { objects: number; polygons: number }
  }
  error?: string
  elapsed?: number
}

// 构造 JSCAD API 暴露给用户代码
function buildJSCADContext(): Record<string, any> {
  const primitives = modeling.primitives || {}
  const booleans = modeling.booleans || {}
  const transforms = modeling.transforms || {}
  const colors = modeling.colors || {}
  const expansions = modeling.expansions || {}
  const hulls = modeling.hulls || {}
  const utils = modeling.utils || {}
  const extrusions = modeling.extrusions || {}
  const text = modeling.text || {}
  const measurements = modeling.measurements || {}
  const geom2 = modeling.geom2 || {}
  const geom3 = modeling.geom3 || {}
  const polygons = modeling.polygons || {}
  const maths = modeling.maths || {}

  // cone 不在 primitives 中，用 cylinder 模拟：radiusTop=0
  const cone = (params: any = {}) => {
    const { radius = 1, height = 1, center, segments = 32 } = params
    return primitives.cylinder({ radius, height, radiusTop: 0, center, segments })
  }

  // stack: 将多个几何体垂直堆叠
  const stack = (...args: any[]) => {
    if (args.length === 0) return null
    let yOffset = 0
    const positioned: any[] = []
    for (let i = 0; i < args.length; i++) {
      const g = args[i]
      if (!g) continue
      // 测量几何体高度
      let h = 0
      try {
        const bb = measurements.measureAggregateBoundingBox(g)
        if (bb) h = bb[1][1] - bb[0][1] // maxY - minY
      } catch (_) { h = 1 }
      if (yOffset !== 0) {
        positioned.push(transforms.translate([0, yOffset, 0], g))
      } else {
        positioned.push(g)
      }
      yOffset += h
    }
    if (positioned.length === 1) return positioned[0]
    return booleans.union(positioned)
  }

  const text3d = (str: string, size = 20, depth = 5, spacing = 2) => {
    const chars = String(str).toUpperCase().split('')
    const charGeoms: any[] = []
    let xOffset = 0
    for (const ch of chars) {
      const result = text.vectorChar({ input: ch, xOffset, yOffset: 0, height: size })
      if (result && Array.isArray(result.segments)) {
        for (const seg of result.segments) {
          if (seg && seg.length >= 3) {
            const closed = [...seg.map((p: any) => [p[0], p[1]]), [seg[0][0], seg[0][1]]]
            const poly = primitives.polygon({ points: closed })
            charGeoms.push(extrusions.extrudeLinear({ height: depth }, poly))
          } else if (seg && seg.length === 2) {
            const dx = seg[1][0] - seg[0][0]; const dy = seg[1][1] - seg[0][1]
            const len = Math.sqrt(dx * dx + dy * dy)
            if (len > 0) {
              const halfThick = size * 0.06
              const perpX = -dy / len * halfThick; const perpY = dx / len * halfThick
              const pts = [
                [seg[0][0] + perpX, seg[0][1] + perpY],
                [seg[0][0] - perpX, seg[0][1] - perpY],
                [seg[1][0] - perpX, seg[1][1] - perpY],
                [seg[1][0] + perpX, seg[1][1] + perpY],
              ]
              charGeoms.push(extrusions.extrudeLinear({ height: depth }, primitives.polygon({ points: pts })))
            }
          }
        }
        xOffset += result.width + (spacing * size / 21)
      }
    }
    if (charGeoms.length === 0) return null
    if (charGeoms.length === 1) return charGeoms[0]
    return booleans.union(charGeoms)
  }

  return {
    // primitives
    cube: primitives.cube,
    cuboid: primitives.cuboid,
    sphere: primitives.sphere,
    cylinder: primitives.cylinder,
    cylinderElliptic: primitives.cylinderElliptic,
    ellipsoid: primitives.ellipsoid,
    roundedCuboid: primitives.roundedCuboid,
    roundedCylinder: primitives.roundedCylinder,
    torus: primitives.torus,
    polyhedron: primitives.polyhedron,
    cone,
    circle: primitives.circle,
    square: primitives.square,
    polygon: primitives.polygon,
    ellipse: primitives.ellipse,
    arc: primitives.arc,
    line: primitives.line,
    rectangle: primitives.rectangle,
    star: primitives.star,
    triangle: primitives.triangle,
    geodesicSphere: primitives.geodesicSphere,

    // booleans
    union: booleans.union,
    subtract: booleans.subtract,
    intersect: booleans.intersect,
    scission: booleans.scission,

    // transforms
    translate: transforms.translate,
    rotate: transforms.rotate,
    scale: transforms.scale,
    mirror: transforms.mirror,
    center: transforms.center,
    centerX: transforms.centerX,
    centerY: transforms.centerY,
    centerZ: transforms.centerZ,
    transform: transforms.transform,
    rotateX: (angle: number, g: any) => transforms.rotate([angle, 0, 0], g),
    rotateY: (angle: number, g: any) => transforms.rotate([0, angle, 0], g),
    rotateZ: (angle: number, g: any) => transforms.rotate([0, 0, angle], g),

    // colors
    colorize: colors.colorize,
    colorNameToRgb: colors.colorNameToRgb,
    hexToRgb: colors.hexToRgb,
    hslToRgb: colors.hslToRgb,
    rgbToHex: colors.rgbToHex,

    // expansions
    expand: expansions.expand,
    offset: expansions.offset,

    // hulls
    hull: hulls.hull,
    hullChain: hulls.hullChain,
    chain_hull: hulls.hullChain,

    // extrusions
    extrudeLinear: extrusions.extrudeLinear,
    extrudeRotate: extrusions.extrudeRotate,
    extrudeFromSlices: extrusions.extrudeFromSlices,
    extrudeHelical: extrusions.extrudeHelical,
    extrudeRectangular: extrusions.extrudeRectangular,
    project: extrusions.project,

    // text
    text3d,
    vectorChar: text.vectorChar,
    vectorText: text.vectorText,

    // utils
    degToRad: utils.degToRad,
    radToDeg: utils.radToDeg,

    // custom helpers
    stack,

    // measurements
    measureBoundingBox: measurements.measureBoundingBox,
    measureAggregateBoundingBox: measurements.measureAggregateBoundingBox,
    measureVolume: measurements.measureVolume,
    measureArea: measurements.measureArea,

    // full jscad namespace
    jscad: {
      modeling,
      primitives,
      booleans,
      transforms,
      colors,
      expansions,
      hulls,
      utils,
      extrusions,
      text,
      measurements,
      geom2,
      geom3,
      polygons,
      maths,
    },
  }
}

// 规范化几何体数组
function normalizeGeometries(output: any): any[] {
  if (output == null) return []
  if (Array.isArray(output)) return output.flatMap(normalizeGeometries)
  return [output]
}

// 从 geom3 中提取 polygon
interface ExtractedPolygon {
  vertices: number[][]
  color?: number[]
}

function extractPolygons(geometry: any): ExtractedPolygon[] {
  if (!geometry) return []
  const polys: ExtractedPolygon[] = []

  const color: number[] | undefined = Array.isArray(geometry.color) ? geometry.color.slice() : undefined

  if (Array.isArray(geometry.polygons)) {
    for (const p of geometry.polygons) {
      if (p && Array.isArray(p.vertices)) {
        polys.push({
          vertices: p.vertices.map((v: number[]) => [Number(v[0]), Number(v[1]), Number(v[2])]),
          color: Array.isArray(p.color) ? p.color.slice() : color,
        })
      }
    }
    return polys
  }

  // geom2: 尝试 extrude
  try {
    const extrusions = (modeling as any).extrusions
    if (extrusions?.linear) {
      const g3 = extrusions.linear({ height: 1 }, geometry)
      if (g3 && Array.isArray(g3.polygons)) {
        for (const p of g3.polygons) {
          if (p && Array.isArray(p.vertices)) {
            polys.push({
              vertices: p.vertices.map((v: number[]) => [Number(v[0]), Number(v[1]), Number(v[2])]),
              color: Array.isArray(p.color) ? p.color.slice() : color,
            })
          }
        }
      }
    }
  } catch (_) {
    // ignore
  }
  return polys
}

// 将 polygon 列表转为 mesh 数据
function polygonsToMesh(polys: ExtractedPolygon[]) {
  const vertexMap = new Map<string, number>()
  const vertices: number[][] = []
  const faces: number[][] = []
  const colors: number[][] = []
  const normals: number[][] = []

  const addVertex = (pt: number[]): number => {
    const key = `${pt[0].toFixed(6)},${pt[1].toFixed(6)},${pt[2].toFixed(6)}`
    if (vertexMap.has(key)) return vertexMap.get(key)!
    const idx = vertices.length
    vertexMap.set(key, idx)
    vertices.push([pt[0], pt[1], pt[2]])
    return idx
  }

  const computeNormal = (a: number[], b: number[], c: number[]): number[] => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
    return [nx / len, ny / len, nz / len]
  }

  let totalPolys = 0
  for (const poly of polys) {
    const pts = poly.vertices
    if (pts.length < 3) continue
    totalPolys++

    const n = computeNormal(pts[0], pts[1], pts[2])

    for (let i = 1; i < pts.length - 1; i++) {
      const i0 = addVertex(pts[0])
      const i1 = addVertex(pts[i])
      const i2 = addVertex(pts[i + 1])
      faces.push([i0, i1, i2])
      normals.push(n)
      colors.push(poly.color ? [...poly.color] : [1, 1, 1, 1])
    }
  }

  return {
    vertices,
    faces,
    normals,
    colors,
    meta: { objects: polys.length, polygons: totalPolys },
  }
}

// 代码预处理：清理 markdown 标记，修复常见问题
function preprocessCode(code: string): string {
  let c = code
  // 清理 markdown 代码块标记
  c = c.replace(/```(?:javascript|js)?\s*\n?/gi, '')
  c = c.replace(/```\s*$/gm, '')
  c = c.replace(/`{3}/g, '')
  // 移除 require('@jscad/modeling') 或 import 语句
  c = c.replace(/require\s*\(\s*['"]@jscad\/modeling['"]\s*\)\s*;?/g, '')
  c = c.replace(/(?:import\s+(?:\w+\s*,?\s*)?(?:\{[^}]*\}\s*from\s*)?['"]@jscad\/modeling['"]\s*;?)/g, '')
  // 补全可能的截断
  const openBraces = (c.match(/\{/g) || []).length
  const closeBraces = (c.match(/\}/g) || []).length
  if (openBraces > closeBraces) {
    c += '\n' + '}'.repeat(openBraces - closeBraces)
  }
  return c.trim()
}

// 控制台 polyfill 用于 Worker
const workerConsole = {
  log: (...args: any[]) => { /* muted in worker */ },
  warn: (...args: any[]) => { /* muted in worker */ },
  error: (...args: any[]) => { /* muted in worker */ },
}

// 执行用户 JSCAD 代码
function executeJSCAD(code: string, params: Record<string, number>): any {
  const sandboxApi = buildJSCADContext()
  const { cleanedCode, wrappedCode } = prepareCode(code)

  // 构建统一执行器
  const execBody = `
    const module = { exports: {} };
    const exports = module.exports;

    ${wrappedCode}

    const mainFn = typeof module.exports === 'function'
      ? module.exports
      : typeof module.exports.main === 'function'
        ? module.exports.main
        : typeof main === 'function' ? main : null;

    if (typeof mainFn !== 'function') {
      throw new Error('代码必须导出 main(params) 函数');
    }
    return mainFn;
  `

  try {
    const apiKeys = [...Object.keys(sandboxApi), 'console']
    const apiValues = [...Object.values(sandboxApi), workerConsole]
    const mainFn = new Function(...apiKeys, execBody)(...apiValues)
    return mainFn(params)
  } catch (e: any) {
    throw new Error(e.message || String(e))
  }
}

function prepareCode(code: string): { cleanedCode: string; wrappedCode: string } {
  let cleanedCode = preprocessCode(code)
  let wrappedCode = cleanedCode

  // ES module export 转 CommonJS
  if (/export\s+(default|function|const|\{)/.test(wrappedCode)) {
    wrappedCode = wrappedCode
      .replace(/export\s+default\s+/g, 'module.exports = ')
      .replace(/export\s+function\s+(\w+)/g, 'module.exports.$1 = function $1')
      .replace(/export\s+const\s+(\w+)/g, 'module.exports.$1 = $1')
      .replace(/export\s+\{([^}]+)\}/g, 'module.exports = { $1 }')
  }

  return { cleanedCode, wrappedCode }
}

// ==================== Worker 消息处理 ====================

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { requestId, code, params } = e.data

  const startTime = performance.now()

  try {
    const result = executeJSCAD(code, params || {})
    const geometries = normalizeGeometries(result)

    if (geometries.length === 0) {
      const response: WorkerResponse = {
        requestId,
        success: false,
        error: 'main(params) 未返回任何几何体',
        elapsed: performance.now() - startTime,
      }
      self.postMessage(response)
      return
    }

    const allPolys: ExtractedPolygon[] = []
    for (const geo of geometries) {
      const ps = extractPolygons(geo)
      allPolys.push(...ps)
    }

    if (allPolys.length === 0) {
      const response: WorkerResponse = {
        requestId,
        success: false,
        error: '几何体中没有 polygon 数据',
        elapsed: performance.now() - startTime,
      }
      self.postMessage(response)
      return
    }

    const mesh = polygonsToMesh(allPolys)

    const response: WorkerResponse = {
      requestId,
      success: true,
      data: mesh,
      elapsed: performance.now() - startTime,
    }

    self.postMessage(response)
  } catch (err: any) {
    const response: WorkerResponse = {
      requestId,
      success: false,
      error: err?.message || String(err),
      elapsed: performance.now() - startTime,
    }
    self.postMessage(response)
  }
}
