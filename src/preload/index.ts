import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  loginKimi: (): Promise<any> => ipcRenderer.invoke('kimi:login'),

  chat: (prompt: string, token?: string, options?: any): Promise<string> =>
    ipcRenderer.invoke('kimi:chat', prompt, token, options),

  chatStream: (
    prompt: string,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
  ): { cancel: () => void } => {
    const chunkHandler = (_event: any, text: string) => onChunk(text)
    const doneHandler = () => {
      cleanup()
      onDone()
    }
    const errorHandler = (_event: any, err: string) => {
      cleanup()
      onError(err)
    }
    const cleanup = () => {
      ipcRenderer.removeListener('kimi:stream-chunk', chunkHandler)
      ipcRenderer.removeListener('kimi:stream-done', doneHandler)
      ipcRenderer.removeListener('kimi:stream-error', errorHandler)
    }
    ipcRenderer.on('kimi:stream-chunk', chunkHandler)
    ipcRenderer.on('kimi:stream-done', doneHandler)
    ipcRenderer.on('kimi:stream-error', errorHandler)

    ipcRenderer.invoke('kimi:chatStream', prompt).catch((err) => {
      cleanup()
      onError(String(err))
    })

    return {
      cancel: () => {
        cleanup()
        ipcRenderer.invoke('kimi:abortChat').catch(() => {})
      }
    }
  },

  cancelChat: (): Promise<any> => ipcRenderer.invoke('kimi:abortChat'),

  getToken: (): Promise<string> => ipcRenderer.invoke('kimi:getToken'),
  testConnection: (): Promise<{ ok: boolean; response?: string; error?: string; userId?: string }> =>
    ipcRenderer.invoke('kimi:testConnection'),
  validateToken: (token?: string): Promise<{ valid: boolean; reason?: string; userId?: string }> =>
    ipcRenderer.invoke('kimi:validateToken', token),
  saveToken: (token: string): Promise<any> => ipcRenderer.invoke('kimi:saveToken', token),
  clearToken: (): Promise<any> => ipcRenderer.invoke('kimi:clearToken'),
  deleteAllChats: (): Promise<any> => ipcRenderer.invoke('kimi:deleteAllChats'),

  saveModel: (name: string, code: string, params: Record<string, any>, messages: any[]): Promise<any> =>
    ipcRenderer.invoke('model:save', name, code, params, messages),
  loadModels: (): Promise<any[]> => ipcRenderer.invoke('model:loadAll'),
  deleteModel: (id: string): Promise<boolean> => ipcRenderer.invoke('model:delete', id),

  runJSCAD: (
    code: string,
    params: Record<string, any>,
  ): Promise<{
    data?: { vertices: number[][]; faces: number[][]; normals?: number[][]; colors?: number[][] }
    error?: string
  }> => ipcRenderer.invoke('jscad:run', code, params),

  exportSTL: (code: string, params: Record<string, any>): Promise<any> =>
    ipcRenderer.invoke('jscad:exportSTL', code, params),
  exportOBJ: (code: string, params: Record<string, any>): Promise<any> =>
    ipcRenderer.invoke('jscad:exportOBJ', code, params),
  exportDXF: (code: string, params: Record<string, any>, view?: string): Promise<any> =>
    ipcRenderer.invoke('jscad:exportDXF', code, params, view),

  importSTL: (): Promise<{ ok?: boolean; code?: string; fileName?: string; error?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('jscad:importSTL'),
})
