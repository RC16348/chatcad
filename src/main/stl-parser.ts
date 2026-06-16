import * as fs from 'fs'

export interface STLMesh {
  vertices: number[][]
  faces: number[][]
}

function parseASCII(content: string): STLMesh {
  const verts: number[][] = []
  const faces: number[][] = []
  const vertMap = new Map<string, number>()

  function addVertex(x: number, y: number, z: number): number {
    const key = `${x},${y},${z}`
    const existing = vertMap.get(key)
    if (existing !== undefined) return existing
    const idx = verts.length
    verts.push([x, y, z])
    vertMap.set(key, idx)
    return idx
  }

  const facetRegex = /facet\s+normal\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)([\s\S]*?)endfacet/gi
  const vertexRegex = /vertex\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)/g

  let facetMatch: RegExpExecArray | null
  while ((facetMatch = facetRegex.exec(content)) !== null) {
    const facetBody = facetMatch[4]
    const vMatches: RegExpExecArray[] = []
    let vm: RegExpExecArray | null
    while ((vm = vertexRegex.exec(facetBody)) !== null) {
      vMatches.push(vm)
    }
    if (vMatches.length >= 3) {
      const i0 = addVertex(parseFloat(vMatches[0][1]), parseFloat(vMatches[0][2]), parseFloat(vMatches[0][3]))
      const i1 = addVertex(parseFloat(vMatches[1][1]), parseFloat(vMatches[1][2]), parseFloat(vMatches[1][3]))
      const i2 = addVertex(parseFloat(vMatches[2][1]), parseFloat(vMatches[2][2]), parseFloat(vMatches[2][3]))
      faces.push([i0, i1, i2])
    }
  }

  return { vertices: verts, faces }
}

function parseBinary(buffer: Buffer): STLMesh {
  const verts: number[][] = []
  const faces: number[][] = []
  const vertMap = new Map<string, number>()

  function addVertex(x: number, y: number, z: number): number {
    const key = `${x},${y},${z}`
    const existing = vertMap.get(key)
    if (existing !== undefined) return existing
    const idx = verts.length
    verts.push([x, y, z])
    vertMap.set(key, idx)
    return idx
  }

  const triCount = buffer.readUInt32LE(80)
  let offset = 84

  for (let i = 0; i < triCount; i++) {
    // skip normal (12 bytes)
    offset += 12
    const vx1 = buffer.readFloatLE(offset); offset += 4
    const vy1 = buffer.readFloatLE(offset); offset += 4
    const vz1 = buffer.readFloatLE(offset); offset += 4
    const vx2 = buffer.readFloatLE(offset); offset += 4
    const vy2 = buffer.readFloatLE(offset); offset += 4
    const vz2 = buffer.readFloatLE(offset); offset += 4
    const vx3 = buffer.readFloatLE(offset); offset += 4
    const vy3 = buffer.readFloatLE(offset); offset += 4
    const vz3 = buffer.readFloatLE(offset); offset += 4
    // attribute byte count (2 bytes)
    offset += 2

    const i0 = addVertex(vx1, vy1, vz1)
    const i1 = addVertex(vx2, vy2, vz2)
    const i2 = addVertex(vx3, vy3, vz3)
    faces.push([i0, i1, i2])
  }

  return { vertices: verts, faces }
}

export function parseSTL(filePath: string): STLMesh {
  const buffer = fs.readFileSync(filePath)

  if (buffer.length < 84) {
    throw new Error('Invalid STL file: too small')
  }

  const header = buffer.toString('ascii', 0, 80).trim()

  // Check if it's ASCII STL (starts with "solid" and contains "facet")
  const isASCII = /^solid\b/i.test(header) && buffer.toString('ascii', 0, Math.min(buffer.length, 500)).toLowerCase().includes('facet')

  if (isASCII) {
    return parseASCII(buffer.toString('utf-8'))
  }

  return parseBinary(buffer)
}

export function meshToJSCADCode(mesh: STLMesh): string {
  const round = (v: number) => Math.round(v * 1000) / 1000

  // 计算包围盒
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  let minZ = Infinity, maxZ = -Infinity
  for (const v of mesh.vertices) {
    if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0]
    if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1]
    if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2]
  }
  const sizeX = round(maxX - minX)
  const sizeY = round(maxY - minY)
  const sizeZ = round(maxZ - minZ)
  const bboxDiag = round(Math.sqrt(sizeX * sizeX + sizeY * sizeY + sizeZ * sizeZ))

  const vertsStr = mesh.vertices
    .map(v => `  [${round(v[0])}, ${round(v[1])}, ${round(v[2])}]`)
    .join(',\n')

  const facesStr = mesh.faces
    .map(f => `  [${f[0]}, ${f[1]}, ${f[2]}]`)
    .join(',\n')

  return `// STL 导入 - ${mesh.vertices.length} 顶点, ${mesh.faces.length} 面
// 原始尺寸: ${sizeX}×${sizeY}×${sizeZ}mm

// 全局缩放 unit:min:0.1 max:10 default:1
const S = 1

// 平移 X unit:mm min:${round(-bboxDiag)} max:${round(bboxDiag)} default:0
const TX = 0

// 平移 Y unit:mm min:${round(-bboxDiag)} max:${round(bboxDiag)} default:0
const TY = 0

// 平移 Z unit:mm min:${round(-bboxDiag)} max:${round(bboxDiag)} default:0
const TZ = 0

// 绕 X 轴旋转 unit:deg min:0 max:360 default:0
const RX = 0

// 绕 Y 轴旋转 unit:deg min:0 max:360 default:0
const RY = 0

// 绕 Z 轴旋转 unit:deg min:0 max:360 default:0
const RZ = 0

function main() {
  return jscad.transforms.rotate(
    [jscad.utils.degToRad(RX), jscad.utils.degToRad(RY), jscad.utils.degToRad(RZ)],
    jscad.transforms.translate([TX, TY, TZ],
      jscad.transforms.scale([S, S, S],
        polyhedron({
          points: [\n${vertsStr}\n],
          faces: [\n${facesStr}\n],
          orientation: 'outward'
        })
      )
    )
  )
}

module.exports = { main }
`
}
