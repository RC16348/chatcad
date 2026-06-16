export interface ParamDef {
  name: string
  label: string
  unit?: string
  min: number
  max: number
  default: number
  value: number
}

export function parseParams(code: string): ParamDef[] {
  if (!code) return []
  const params: ParamDef[] = []
  const lines = code.split(/\r?\n/)
  const usedNames = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const commentLine = lines[i]
    const commentMatch = commentLine.match(/^\s*\/\/\s*(.+)/)
    if (!commentMatch) continue

    const commentText = commentMatch[1].trim()
    const isAnnotated = commentText.includes('unit:') || commentText.includes('min:')

    const nextLine = lines[i + 1] || ''
    const varMatch = nextLine.match(/(?:const|let|var)\s+([^\s=]+)\s*=\s*([\-\d.]+)/)
    if (!varMatch) continue

    const name = varMatch[1]
    if (usedNames.has(name)) continue
    usedNames.add(name)

    const currentValue = parseFloat(varMatch[2])
    if (isNaN(currentValue)) continue

    if (!isAnnotated) continue

    const unitMatch = commentText.match(/unit:([^\s]+)/)
    const minMatch = commentText.match(/min:([\-\d.]+)/)
    const maxMatch = commentText.match(/max:([\-\d.]+)/)
    const defaultMatch = commentText.match(/default:([\-\d.]+)/)
    const nameLabel = commentText
      .replace(/unit:[^\s]+/g, '')
      .replace(/min:[\-\d.]+/g, '')
      .replace(/max:[\-\d.]+/g, '')
      .replace(/default:[\-\d.]+/g, '')
      .trim()

    const minVal = minMatch ? parseFloat(minMatch[1]) : 0
    const maxVal = maxMatch ? parseFloat(maxMatch[1]) : 100
    const defaultVal = defaultMatch ? parseFloat(defaultMatch[1]) : currentValue

    params.push({
      name,
      label: nameLabel || name,
      unit: unitMatch ? unitMatch[1] : undefined,
      min: isNaN(minVal) ? 0 : minVal,
      max: isNaN(maxVal) ? 100 : maxVal,
      default: isNaN(defaultVal) ? currentValue : defaultVal,
      value: currentValue
    })
  }

  if (params.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const simpleMatch = line.match(/(?:const|let|var)\s+([^\s=]+)\s*=\s*([\-\d.]+)/)
      if (!simpleMatch) continue
      const name = simpleMatch[1]
      if (usedNames.has(name)) continue
      usedNames.add(name)
      const val = parseFloat(simpleMatch[2])
      if (isNaN(val)) continue
      params.push({
        name,
        label: name,
        unit: undefined,
        min: 0,
        max: val > 0 ? val * 2 : 100,
        default: val,
        value: val
      })
    }
  }

  return params
}

export function applyParamValues(code: string, params: Record<string, number>): string {
  if (!code) return code
  let result = code
  for (const [key, val] of Object.entries(params)) {
    const re = new RegExp(`(\\b(?:const|let|var)\\s+${key}\\s*=\\s*)([\\-\\d.]+)`, 'g')
    result = result.replace(re, (_m, p1) => `${p1}${val}`)
  }
  return result
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
