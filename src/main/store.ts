/**
 * 本地存储 - 模型列表 & Token
 * 使用 electron app.getPath('userData') + '/models.json' / '/token.json'
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export interface ChatCADModel {
  id: string
  name: string
  code: string
  params: Record<string, any>
  messages: any[]
  createdAt: number
  updatedAt: number
}

interface ModelsFile {
  models: ChatCADModel[]
}

interface TokenFile {
  token: string
  savedAt: number
}

let _userDataPath: string | null = null
function getDataDir(): string {
  if (!_userDataPath) {
    try {
      _userDataPath = app.getPath('userData')
    } catch (e) {
      // 在非 Electron 环境下回退到临时目录 (方便单元测试)
      _userDataPath = path.join(process.cwd(), '.chatcad-data')
    }
  }
  if (!fs.existsSync(_userDataPath)) {
    fs.mkdirSync(_userDataPath, { recursive: true })
  }
  return _userDataPath
}

function modelsFilePath(): string {
  return path.join(getDataDir(), 'models.json')
}

function tokenFilePath(): string {
  return path.join(getDataDir(), 'token.json')
}

function readJSON<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(raw) as T
  } catch (e) {
    console.error('[Store] readJSON failed:', filePath, (e as Error).message)
    return fallback
  }
}

function writeJSON<T>(filePath: string, data: T): void {
  try {
    const tmp = `${filePath}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmp, filePath)
  } catch (e) {
    console.error('[Store] writeJSON failed:', filePath, (e as Error).message)
    throw e
  }
}

function genId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// ==================== Models ====================

export function saveModel(name: string, code: string, params: Record<string, any> = {}, messages: any[] = []): ChatCADModel {
  const now = Date.now()
  const model: ChatCADModel = {
    id: genId(),
    name: String(name || '未命名模型'),
    code: String(code || ''),
    params: params && typeof params === 'object' ? params : {},
    messages: Array.isArray(messages) ? messages : [],
    createdAt: now,
    updatedAt: now,
  }
  const data = readJSON<ModelsFile>(modelsFilePath(), { models: [] })
  data.models.unshift(model)
  writeJSON(modelsFilePath(), data)
  return model
}

export function updateModel(id: string, patch: Partial<Pick<ChatCADModel, 'name' | 'code' | 'params'>>): ChatCADModel | null {
  const data = readJSON<ModelsFile>(modelsFilePath(), { models: [] })
  const idx = data.models.findIndex(m => m.id === id)
  if (idx === -1) return null
  const merged: ChatCADModel = {
    ...data.models[idx],
    ...patch,
    params: patch.params ? { ...data.models[idx].params, ...patch.params } : data.models[idx].params,
    updatedAt: Date.now(),
  }
  data.models[idx] = merged
  writeJSON(modelsFilePath(), data)
  return merged
}

export function loadModels(): ChatCADModel[] {
  const data = readJSON<ModelsFile>(modelsFilePath(), { models: [] })
  return Array.isArray(data.models) ? data.models : []
}

export function deleteModel(id: string): boolean {
  const data = readJSON<ModelsFile>(modelsFilePath(), { models: [] })
  const before = data.models.length
  data.models = data.models.filter(m => m.id !== id)
  if (data.models.length === before) return false
  writeJSON(modelsFilePath(), data)
  return true
}

// ==================== Token ====================

export function saveToken(token: string): void {
  writeJSON(tokenFilePath(), { token: String(token || ''), savedAt: Date.now() })
}

export function getToken(): string {
  const data = readJSON<TokenFile>(tokenFilePath(), { token: '', savedAt: 0 })
  return data.token || ''
}

export function clearToken(): void {
  writeJSON(tokenFilePath(), { token: '', savedAt: Date.now() })
}

export default {
  saveModel,
  updateModel,
  loadModels,
  deleteModel,
  saveToken,
  getToken,
  clearToken,
}
