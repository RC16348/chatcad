/**
 * JSCAD 代码执行器 (纯 Node)
 * - 使用 Node vm 模块在沙箱中执行用户代码
 * - 注入 @jscad/modeling primitives / booleans / transforms / colors / expansions / hulls API
 * - 代码必须导出 main(params) 函数，返回一个几何体或几何体数组
 * - 将几何体转换为 Three.js 可理解的格式 (vertices, faces, normals, colors)
 * - 支持导出 STL / OBJ
 */

import * as vm from 'vm'
import * as modeling from '@jscad/modeling'
import * as stlSerializer from '@jscad/stl-serializer'
import * as objSerializer from '@jscad/obj-serializer'

export interface JSCADRunResult {
  data?: {
    vertices: number[][]
    faces: number[][]
    normals?: number[][]
    colors?: number[][]
    meta?: { objects: number; polygons: number }
  }
  error?: string
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

  const cone = (params: any = {}) => {
    const { radius = 1, height = 1, center, segments = 32 } = params
    return primitives.cylinder({ radius, height, radiusTop: 0, center, segments })
  }

  const stack = (...args: any[]) => {
    if (args.length === 0) return null
    let yOffset = 0
    const positioned: any[] = []
    for (let i = 0; i < args.length; i++) {
      const g = args[i]
      if (!g) continue
      let h = 0
      try {
        const bb = measurements.measureAggregateBoundingBox(g)
        if (bb) h = bb[1][1] - bb[0][1]
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

    union: booleans.union,
    subtract: booleans.subtract,
    intersect: booleans.intersect,
    scission: booleans.scission,

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

    colorize: colors.colorize,
    colorNameToRgb: colors.colorNameToRgb,
    hexToRgb: colors.hexToRgb,
    hslToRgb: colors.hslToRgb,
    rgbToHex: colors.rgbToHex,

    expand: expansions.expand,
    offset: expansions.offset,

    hull: hulls.hull,
    hullChain: hulls.hullChain,
    chain_hull: hulls.hullChain,

    extrudeLinear: extrusions.extrudeLinear,
    extrudeRotate: extrusions.extrudeRotate,
    extrudeFromSlices: extrusions.extrudeFromSlices,
    extrudeHelical: extrusions.extrudeHelical,
    extrudeRectangular: extrusions.extrudeRectangular,
    project: extrusions.project,

    text3d,
    vectorChar: text.vectorChar,
    vectorText: text.vectorText,

    degToRad: utils.degToRad,
    radToDeg: utils.radToDeg,

    stack,

    measureBoundingBox: measurements.measureBoundingBox,
    measureAggregateBoundingBox: measurements.measureAggregateBoundingBox,
    measureVolume: measurements.measureVolume,
    measureArea: measurements.measureArea,

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

// 把用户代码包装成 CommonJS 风格，使得 module.exports / exports / require 可用
// 由于我们直接在 vm 里运行，需手动构造一个 "module" 对象
function compileUserCode(code: string): { main: (params: any) => any } {
  const sandboxApi = buildJSCADContext()

  // 提供一个简单的 require: 只允许 @jscad/modeling 及子路径
  const makeRequire = () => (id: string): any => {
    if (id === '@jscad/modeling') return modeling
    if (id.startsWith('@jscad/modeling/')) {
      const sub = id.slice('@jscad/modeling/'.length)
      return (modeling as any)[sub]
    }
    throw new Error(`不允许 require('${id}') - 只能使用 @jscad/modeling`)
  }

  const moduleObj: any = { exports: {} }
  const exportsObj: any = moduleObj.exports

  const contextObj: any = {
    console,
    Buffer,
    Math,
    Date,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    Error,
    TypeError,
    RangeError,
    Infinity,
    NaN,
    undefined,
    // 扁平 API
    ...sandboxApi,
    module: moduleObj,
    exports: exportsObj,
    require: makeRequire(),
    __dirname: '',
    __filename: 'jscad-script.js',
  }
  contextObj.global = contextObj
  contextObj.globalThis = contextObj

  vm.createContext(contextObj)

  // 用户代码末尾: 如果用户使用了 module.exports.main / exports.main 则直接使用
  // 如果用户顶层定义了 const main = ... 也应该通过 CommonJS 方式捕获
  const wrappedCode = `
(function (module, exports, require, __dirname, __filename) {
  ${code}

  // 兼容: 如果顶层定义了 const main / function main，把它挂到 exports.main 上
  if (typeof main === 'function' && typeof module.exports !== 'function') {
    if (!module.exports.main) module.exports.main = main;
  }
  // 如果 module.exports 本身就是一个函数，则视为 main
})(module, exports, require, __dirname, __filename);
`

  vm.runInContext(wrappedCode, contextObj, {
    filename: 'jscad-script.js',
    timeout: 10000,
    displayErrors: true,
  })

  const modOut = moduleObj.exports
  const mainFn: any =
    typeof modOut === 'function' ? modOut : typeof modOut.main === 'function' ? modOut.main : undefined

  if (!mainFn) {
    throw new Error('JSCAD 代码必须导出 main(params) 函数 (module.exports.main = ... 或 exports.main = ...)')
  }

  return { main: mainFn }
}

// 规范化几何体数组 (接受单个或多个)
function normalizeGeometries(output: any): any[] {
  if (output == null) return []
  if (Array.isArray(output)) return output.flatMap(normalizeGeometries)
  return [output]
}

// 从 geom3 中提取 polygon (顶点 + 颜色)
interface ExtractedPolygon {
  vertices: number[][]
  color?: number[]
}

function extractPolygons(geometry: any): ExtractedPolygon[] {
  if (!geometry) return []
  const polys: ExtractedPolygon[] = []

  // 通用颜色
  const color: number[] | undefined = Array.isArray(geometry.color) ? geometry.color.slice() : undefined

  // geom3: { polygons: [ { vertices: [[x,y,z], ...] }, ... ] }
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

  // geom2 / 其它: 尝试转换到 geom3 再提取
  try {
    const g3 = (modeling as any).geom2ToGeom3
      ? (modeling as any).geom2ToGeom3(geometry)
      : (modeling as any).extrusions?.linear({ height: 1 }, geometry)
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
  } catch (e) {
    // 忽略转换错误
  }
  return polys
}

// 将 polygon 列表转为 vertices / faces / normals / colors
function polygonsToMesh(polys: ExtractedPolygon[]): NonNullable<JSCADRunResult['data']> {
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

    // 扇形三角化
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

// ==================== Public API ====================

export async function runJSCAD(code: string, params: Record<string, any> = {}): Promise<JSCADRunResult> {
  try {
    const { main } = compileUserCode(String(code || ''))
    const result = main(params || {})
    const geometries = normalizeGeometries(result)

    if (geometries.length === 0) {
      return { error: 'main(params) 未返回任何几何体' }
    }

    const allPolys: ExtractedPolygon[] = []
    for (const geo of geometries) {
      const ps = extractPolygons(geo)
      allPolys.push(...ps)
    }

    if (allPolys.length === 0) {
      return { error: '几何体中没有 polygon 数据' }
    }

    return { data: polygonsToMesh(allPolys) }
  } catch (err: any) {
    return { error: `JSCAD 执行错误: ${err?.message || String(err)}` }
  }
}

export async function exportSTL(code: string, params: Record<string, any> = {}): Promise<{ blob?: Buffer; error?: string }> {
  try {
    const { main } = compileUserCode(String(code || ''))
    const result = main(params || {})
    const geometries = normalizeGeometries(result)
    if (geometries.length === 0) return { error: 'main(params) 未返回任何几何体' }

    const raw: any = stlSerializer.serialize({ binary: true }, geometries)
    // raw 通常是 an array of TypedArray/Buffer chunks
    const chunks: Buffer[] = Array.isArray(raw)
      ? raw.map(c => (Buffer.isBuffer(c) ? c : Buffer.from(c as any)))
      : [Buffer.from(raw as any)]
    return { blob: Buffer.concat(chunks) }
  } catch (err: any) {
    return { error: `STL 导出错误: ${err?.message || String(err)}` }
  }
}

export async function exportOBJ(code: string, params: Record<string, any> = {}): Promise<{ blob?: Buffer; error?: string }> {
  try {
    const { main } = compileUserCode(String(code || ''))
    const result = main(params || {})
    const geometries = normalizeGeometries(result)
    if (geometries.length === 0) return { error: 'main(params) 未返回任何几何体' }

    const raw: any = objSerializer.serialize({}, geometries)
    const chunks: Buffer[] = Array.isArray(raw)
      ? raw.map(c => (Buffer.isBuffer(c) ? c : Buffer.from(c as any)))
      : [Buffer.from(raw as any)]
    return { blob: Buffer.concat(chunks) }
  } catch (err: any) {
    return { error: `OBJ 导出错误: ${err?.message || String(err)}` }
  }
}

const DXF_AXIS: Record<string, [number, number, number]> = {
  top:    [0, 0, 1],
  bottom: [0, 0, -1],
  front:  [0, 1, 0],
  back:   [0, -1, 0],
  right:  [1, 0, 0],
  left:   [-1, 0, 0],
}

function projectToOutlines(geo: any, axis: [number, number, number]): number[][][] {
  const geom2 = modeling.geometries.geom2
  const projected = modeling.extrusions.project({ axis, origin: [0, 0, 0] }, geo)
  if (!projected || !geom2.isA(projected)) return []
  const outlines = geom2.toOutlines(projected)
  return outlines.filter(o => o.length >= 3)
}

function computeBBox(outlines: number[][][]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const poly of outlines) {
    for (const [x, y] of poly) {
      if (x < minX) minX = x; if (y < minY) minY = y
      if (x > maxX) maxX = x; if (y > maxY) maxY = y
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

export async function exportDXF(code: string, params: Record<string, any> = {}, view = 'top'): Promise<{ blob?: Buffer; error?: string }> {
  try {
    const { main } = compileUserCode(String(code || ''))
    const result = main(params || {})
    const geometries = normalizeGeometries(result)
    if (geometries.length === 0) return { error: 'main(params) 未返回任何几何体' }

    if (view === 'all') {
      return exportAllViewsDXF(geometries)
    }

    // 单一视角导出
    const allOutlines: number[][][] = []
    for (const geo of geometries) {
      try {
        const axis = DXF_AXIS[view] || [0, 0, 1]
        const outlines = projectToOutlines(geo, axis)
        allOutlines.push(...outlines)
      } catch (_) {}
    }
    if (allOutlines.length === 0) return { error: '无法从模型中提取 2D 轮廓' }

    const Drawing = require('dxf-writer')
    const d = new Drawing()
    d.setUnits('Millimeters')
    for (const outline of allOutlines) d.drawPolyline(outline, true)
    return { blob: Buffer.from(d.toDxfString(), 'utf8') }
  } catch (err: any) {
    return { error: `DXF 导出错误: ${err?.message || String(err)}` }
  }
}

function exportAllViewsDXF(geometries: any[]): { blob?: Buffer; error?: string } {
  const LABELS: [string, [number, number, number]][] = [
    ['俯视图 TOP',    [0, 0, 1]],
    ['仰视图 BOTTOM', [0, 0, -1]],
    ['正视图 FRONT',  [0, 1, 0]],
    ['后视图 BACK',   [0, -1, 0]],
    ['右视图 RIGHT',  [1, 0, 0]],
    ['左视图 LEFT',   [-1, 0, 0]],
  ]

  const Drawing = require('dxf-writer')
  const d = new Drawing()
  d.setUnits('Millimeters')

  const cols = 3
  const padX = 15       // 水平内边距
  const padY = 8        // 垂直内边距
  const gapX = 40       // 列间距
  const gapY = 40       // 行间距
  const labelH = 5      // 标签字高（小字）
  const labelOffset = 4 // 标签偏移（左下角）

  // 计算每个视图的包围盒
  type ViewData = { outlines: number[][][]; bbox: ReturnType<typeof computeBBox> }
  const viewData: ViewData[] = []
  for (const [_label, axis] of LABELS) {
    const outlines: number[][][] = []
    for (const geo of geometries) {
      try { outlines.push(...projectToOutlines(geo, axis)) } catch (_) {}
    }
    const bbox = outlines.length > 0
      ? computeBBox(outlines)
      : { minX: 0, minY: 0, maxX: 10, maxY: 10, width: 10, height: 10 }
    viewData.push({ outlines, bbox })
  }

  // 统一 cell 尺寸
  const maxW = Math.max(...viewData.map(v => v.bbox.width), 10)
  const maxH = Math.max(...viewData.map(v => v.bbox.height), 10)
  const cellW = maxW + padX * 2
  const cellH = maxH + padY * 2

  // 计算整体布局宽度
  const totalW = cols * cellW + (cols - 1) * gapX

  // 第一行起始 Y（留出顶部边距）
  const startY = -gapY / 2

  for (let i = 0; i < viewData.length; i++) {
    const { outlines, bbox } = viewData[i]
    if (outlines.length === 0) continue

    const col = i % cols
    const row = Math.floor(i / cols)

    // cell 左上角坐标（以整体中心为原点）
    const cellLeft = -totalW / 2 + col * (cellW + gapX)
    const cellTop = startY - row * (cellH + gapY)
    const cellRight = cellLeft + cellW
    const cellBottom = cellTop - cellH

    // 绘制 cell 边框（细框）
    d.drawPolyline([
      [cellLeft, cellTop],
      [cellRight, cellTop],
      [cellRight, cellBottom],
      [cellLeft, cellBottom],
    ], true)

    // 图形居中
    const graphCenterX = cellLeft + cellW / 2
    const graphCenterY = cellBottom + cellH / 2

    const dx = graphCenterX - (bbox.minX + bbox.width / 2)
    const dy = graphCenterY - (bbox.minY + bbox.height / 2)

    for (const poly of outlines) {
      d.drawPolyline(poly.map(p => [p[0] + dx, p[1] + dy]), true)
    }

    // 小标签放在左下角（不干扰图形）
    const labelX = cellLeft + labelOffset
    const labelY = cellBottom + labelH + labelOffset
    d.drawText(labelX, labelY, labelH, 0, LABELS[i][0], 'left', 'middle')
  }

  return { blob: Buffer.from(d.toDxfString(), 'utf8') }
}

export default { runJSCAD, exportSTL, exportOBJ, exportDXF }
