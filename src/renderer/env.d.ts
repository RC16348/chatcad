declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  api: {
    loginKimi: () => Promise<{ token?: string; userId?: string; error?: string }>
    getToken: () => Promise<string>
    saveToken: (token: string) => Promise<{ ok?: boolean }>
    clearToken: () => Promise<{ ok?: boolean }>
    deleteAllChats: () => Promise<{ success: boolean; deleted: number; error?: string }>

    chat: (prompt: string, token?: string, options?: any) => Promise<string | { error?: string }>
    chatStream: (
      prompt: string,
      onChunk: (chunk: string) => void,
      onDone: () => void,
      onError: (err: string) => void,
    ) => { cancel: () => void }
    cancelChat: () => Promise<any>

    saveModel: (name: string, code: string, params: Record<string, number>) => Promise<any>
    loadModels: () => Promise<any[]>
    deleteModel: (id: string) => Promise<boolean>

    runJSCAD: (
      code: string,
      params: Record<string, number>,
    ) => Promise<{
      data?: { vertices: number[][]; faces: number[][]; normals?: number[][]; colors?: number[][] }
      error?: string
    }>

    exportSTL: (code: string, params: Record<string, number>) => Promise<any>
    exportOBJ: (code: string, params: Record<string, number>) => Promise<any>
    exportDXF: (code: string, params: Record<string, number>, view?: string) => Promise<any>
  }
}
