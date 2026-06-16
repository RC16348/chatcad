import { BrowserWindow, ipcMain, dialog } from 'electron'
import * as fs from 'fs'
import { openKimiLoginWindow, detectTokenType } from './kimi-login'
import { chat, chatStream, deleteAllChats as kimiDeleteAllChats, validateToken } from './kimi-api'
import { saveModel, loadModels, deleteModel, getToken, saveToken, clearToken } from './store'
import { runJSCAD, exportSTL, exportOBJ, exportDXF } from './jscad-runner'
import { parseSTL, meshToJSCADCode } from './stl-parser'

// 为避免重复注册
const registeredChannels = new Set<string>()

function handleOnce(channel: string, handler: (...args: any[]) => any): void {
  if (registeredChannels.has(channel)) return
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await handler(...args)
    } catch (err: any) {
      console.error(`[IPC] ${channel} error:`, err?.message || err)
      return { error: err?.message || String(err) }
    }
  })
  registeredChannels.add(channel)
}

export function registerIpcHandlers(mainWindow: BrowserWindow): void {
  // ==================== Kimi 登录 ====================
  handleOnce('kimi:login', async () => {
    try {
      const result = await openKimiLoginWindow()
      // token 已在 login 窗口内通过 API 验证
      if (result?.token) {
        saveToken(result.token)
        return { token: result.token, userId: result.userId, name: result.name, verified: true }
      }
      return result
    } catch (err: any) {
      return { error: err?.message || String(err) }
    }
  })

  // ==================== Kimi 聊天 (非流式) ====================
  handleOnce('kimi:chat', async (prompt: string, tokenArg?: string, options?: any) => {
    const token = tokenArg || getToken()
    if (!token) throw new Error('尚未登录 Kimi，或未获取到有效 Token')
    return await chat(prompt, token, options)
  })

  // ==================== Kimi 聊天 (流式，通过事件推送) ====================
  let currentStreamAbort: AbortController | null = null

  handleOnce('kimi:chatStream', async (prompt: string, tokenArg?: string, options?: any) => {
    const token = tokenArg || getToken()
    if (!token) {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('kimi:stream-error', '尚未登录 Kimi')
      return { started: false }
    }

    if (currentStreamAbort) {
      currentStreamAbort.abort()
      currentStreamAbort = null
    }
    const abort = new AbortController()
    currentStreamAbort = abort

    chatStream(
      prompt,
      token,
      (chunk) => {
        if (abort.signal.aborted) return
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send('kimi:stream-chunk', chunk)
      },
      () => {
        if (abort.signal.aborted) return
        currentStreamAbort = null
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send('kimi:stream-done')
      },
      (err) => {
        currentStreamAbort = null
        if (!mainWindow.isDestroyed()) mainWindow.webContents.send('kimi:stream-error', err)
      },
      options,
      abort.signal,
    )
    return { started: true }
  })

  handleOnce('kimi:abortChat', async () => {
    if (currentStreamAbort) {
      currentStreamAbort.abort()
      currentStreamAbort = null
    }
    return { aborted: true }
  })

  // ==================== Token 管理 ====================
  handleOnce('kimi:getToken', async () => getToken())
  handleOnce('kimi:validateToken', async (token?: string) => {
    const t = token || getToken()
    if (!t) return { valid: false, reason: 'empty' }
    const type = detectTokenType(t)
    if (type !== 'jwt') return { valid: false, reason: 'not_jwt' }
    // 通过 API 真实验证
    const result = await validateToken(t)
    if (!result.valid) {
      clearToken()
      return { valid: false, reason: 'api_rejected' }
    }
    return { valid: true, userId: result.userId || '' }
  })
  handleOnce('kimi:saveToken', async (token: string) => {
    saveToken(token)
    return { ok: true }
  })
  handleOnce('kimi:clearToken', async () => {
    clearToken()
    return { ok: true }
  })

  // ==================== Kimi 连接测试 ====================
  handleOnce('kimi:testConnection', async (tokenArg?: string) => {
    const token = tokenArg || getToken()
    if (!token) return { ok: false, error: '未获取到 Token，请先登录' }
    try {
      // 第一步：通过 SubscriptionService 验证 token 有效性
      const validation = await validateToken(token)
      if (!validation.valid) {
        return { ok: false, error: 'Token 无效或已过期 (API 验证失败)' }
      }
      // 第二步：发送测试对话，确认 AI 能正常回复
      const response = await chat('只回复一个字母：ok', token, { isSearch: false, autoDeleteConversation: true })
      const trimmed = (response || '').trim().toLowerCase()
      const connected = trimmed.length > 0
      return { ok: connected, response: trimmed, userId: validation.userId }
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) }
    }
  })

  // ==================== Kimi 聊天记录清理 ====================
  handleOnce('kimi:deleteAllChats', async () => {
    const token = getToken()
    if (!token) return { success: false, deleted: 0, error: '未登录' }
    const result = await kimiDeleteAllChats(token)
    return result
  })

  // ==================== 模型管理 ====================
  handleOnce('model:save', async (name: string, code: string, params: Record<string, any>, messages: any[]) => {
    return saveModel(name, code, params || {}, messages || [])
  })
  handleOnce('model:loadAll', async () => {
    return loadModels()
  })
  handleOnce('model:delete', async (id: string) => {
    return deleteModel(id)
  })

  // ==================== JSCAD 执行 ====================
  handleOnce('jscad:run', async (code: string, params: Record<string, any>) => {
    return await runJSCAD(code, params || {})
  })

  // ==================== 导出 STL (带保存对话框) ====================
  handleOnce('jscad:exportSTL', async (code: string, params: Record<string, any>) => {
    const win = BrowserWindow.fromWebContents(mainWindow.webContents) || mainWindow
    const result = await dialog.showSaveDialog(win, {
      title: '导出 STL',
      defaultPath: 'chatcad-model.stl',
      filters: [{ name: 'STL 文件', extensions: ['stl'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true, data: null }

    const run = await exportSTL(code, params || {})
    if (run.error || !run.blob) {
      return { error: run.error || '生成失败', data: null }
    }
    fs.writeFileSync(result.filePath, run.blob)
    return { ok: true, filePath: result.filePath, data: Array.from(new Uint8Array(run.blob)) }
  })

  // ==================== 导入 STL ====================
  handleOnce('jscad:importSTL', async () => {
    const win = BrowserWindow.fromWebContents(mainWindow.webContents) || mainWindow
    const result = await dialog.showOpenDialog(win, {
      title: '导入 STL',
      filters: [{ name: 'STL 文件', extensions: ['stl'] }],
      properties: ['openFile'],
    })
    if (result.canceled || result.filePaths.length === 0) return { canceled: true }

    try {
      const mesh = parseSTL(result.filePaths[0])
      const code = meshToJSCADCode(mesh)
      return { ok: true, code, fileName: result.filePaths[0].split('\\').pop()?.split('/').pop() || 'model.stl' }
    } catch (err: any) {
      return { error: err?.message || String(err) }
    }
  })

  // ==================== 导出 OBJ (带保存对话框) ====================
  handleOnce('jscad:exportOBJ', async (code: string, params: Record<string, any>) => {
    const win = BrowserWindow.fromWebContents(mainWindow.webContents) || mainWindow
    const result = await dialog.showSaveDialog(win, {
      title: '导出 OBJ',
      defaultPath: 'chatcad-model.obj',
      filters: [{ name: 'OBJ 文件', extensions: ['obj'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true, data: null }

    const run = await exportOBJ(code, params || {})
    if (run.error || !run.blob) {
      return { error: run.error || '生成失败', data: null }
    }
    fs.writeFileSync(result.filePath, run.blob)
    return { ok: true, filePath: result.filePath, data: Array.from(new Uint8Array(run.blob)) }
  })

  // ==================== 导出 DXF (视角选择 + 保存对话框) ====================
  handleOnce('jscad:exportDXF', async (code: string, params: Record<string, any>, view?: string) => {
    const win = BrowserWindow.fromWebContents(mainWindow.webContents) || mainWindow
    const isAllViews = view === 'all'
    const result = await dialog.showSaveDialog(win, {
      title: isAllViews ? '导出 DXF (合并全部视角)' : '导出 DXF',
      defaultPath: isAllViews ? 'chatcad-model-views.dxf' : 'chatcad-model.dxf',
      filters: [{ name: 'DXF 文件', extensions: ['dxf'] }],
    })
    if (result.canceled || !result.filePath) return { canceled: true, data: null }

    const run = await exportDXF(code, params || {}, view || 'top')
    if (run.error || !run.blob) {
      return { error: run.error || '生成失败', data: null }
    }
    fs.writeFileSync(result.filePath, run.blob)
    return { ok: true, filePath: result.filePath, data: Array.from(new Uint8Array(run.blob)) }
  })
}

export default { registerIpcHandlers }
