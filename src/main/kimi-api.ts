/**
 * Kimi 网页 API 调用 - 流式 / 非流式
 * 参考 Chat2API kimi adapter 的实现思路
 * 对话结束后自动删除 kimi 服务端的聊天记录，避免在 kimi.com 网页端历史列表中出现
 */

import axios from 'axios'
import { detectTokenType, parseJWTPayload } from './kimi-login'

const KIMI_API_BASE = 'https://www.kimi.com'
const CHAT_PATH = '/apiv2/kimi.gateway.chat.v1.ChatService/Chat'
const DELETE_CHAT_PATH = '/apiv2/kimi.chat.v1.ChatService/DeleteChat'
const BATCH_DELETE_CHATS_PATH = '/apiv2/kimi.chat.v1.ChatService/BatchDeleteChats'
const LIST_CHATS_PATH = '/apiv2/kimi.chat.v1.ChatService/ListChats'

const FAKE_HEADERS: Record<string, string> = {
  Accept: '*/*',
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  Origin: KIMI_API_BASE,
  'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Priority: 'u=1, i',
}

export interface KimiChatOptions {
  model?: string
  isSearch?: boolean
  enableThinking?: boolean
  autoDeleteConversation?: boolean
}

interface TokenCache {
  token: string
  normalized: string
  userId: string
  updatedAt: number
}

let tokenCache: TokenCache | null = null
const TOKEN_CACHE_TTL = 4 * 60 * 1000

function normalizeToken(rawToken: string): { token: string; userId: string } {
  const now = Date.now()
  if (tokenCache && tokenCache.token === rawToken && now - tokenCache.updatedAt < TOKEN_CACHE_TTL) {
    return { token: tokenCache.normalized, userId: tokenCache.userId }
  }
  const type = detectTokenType(rawToken)
  let userId = ''
  if (type === 'jwt') {
    const payload = parseJWTPayload(rawToken)
    if (payload) userId = String(payload.sub || '')
  }
  tokenCache = { token: rawToken, normalized: rawToken, userId, updatedAt: now }
  return { token: rawToken, userId }
}

function resolveScenario(modelName: string): string {
  const lower = (modelName || '').toLowerCase()
  if (lower.includes('k2.6') || lower.includes('k2d6')) return 'SCENARIO_K2D6'
  return 'SCENARIO_K2D5'
}

function buildChatPayload(prompt: string, options: KimiChatOptions = {}) {
  const model = options.model || 'moonshot-v1-search'
  const scenario = resolveScenario(model)
  const isSearch = options.isSearch ?? true
  const enableThinking = options.enableThinking ?? false
  return {
    scenario,
    chat_id: '',
    tools: isSearch ? [{ type: 'TOOL_TYPE_SEARCH', search: {} }] : [],
    message: {
      parent_id: '',
      role: 'user',
      blocks: [{ message_id: '', text: { content: prompt } }],
      scenario,
    },
    options: { thinking: enableThinking },
  }
}

function encodeGrpcFrame(payload: unknown): Buffer {
  const jsonBuffer = Buffer.from(JSON.stringify(payload), 'utf8')
  const frame = Buffer.alloc(5 + jsonBuffer.length)
  frame.writeUInt8(0, 0)
  frame.writeUInt32BE(jsonBuffer.length, 1)
  jsonBuffer.copy(frame, 5)
  return frame
}

/**
 * 从流式 frame 中提取文本内容和 chat.id
 * kimi 响应结构示例：
 * { chat: { id: "chat_xxx", ... }, block: { ... }, op: "set"|"append" }
 */
function parseFrame(data: any): { content: string; chatId: string } {
  if (!data) return { content: '', chatId: '' }
  if (data.error) {
    throw new Error(`Kimi API error: ${data.error.message || JSON.stringify(data.error)}`)
  }
  let content = ''
  let chatId = ''
  // 提取 chat.id (可能是 data.chat.id 或 data.chat_id)
  if (data.chat && typeof data.chat.id === 'string' && data.chat.id) {
    chatId = data.chat.id
  } else if (typeof data.chat_id === 'string' && data.chat_id) {
    chatId = data.chat_id
  }
  // 提取文本内容
  if (data.op === 'set' || data.op === 'append') {
    const mask = data.mask || ''
    if (mask.includes('block.think') && data.block?.think?.content) {
      content = data.block.think.content
    } else if (mask.includes('block.text') && data.block?.text?.content) {
      content = data.block.text.content
    }
  }
  if (!content) {
    if (data.block?.text?.content) content = data.block.text.content
    else if (data.block?.think?.content) content = data.block.think.content
  }
  return { content, chatId }
}

/**
 * 调用 kimi 的 DeleteChat 接口，删除指定聊天
 */
export async function deleteConversation(token: string, chatId: string): Promise<boolean> {
  if (!chatId) return true
  const { token: accessToken } = normalizeToken(token)
  try {
    const response = await axios.post(
      `${KIMI_API_BASE}${DELETE_CHAT_PATH}`,
      { chat_id: chatId },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...FAKE_HEADERS,
        },
        timeout: 15000,
        validateStatus: () => true,
      },
    )
    return response.status === 200
  } catch (e) {
    console.warn('[Kimi] Failed to delete chat:', chatId, String(e))
    return false
  }
}

/**
 * 调用 kimi 的 BatchDeleteChats，批量删除
 */
export async function batchDeleteChats(token: string, chatIds: string[]): Promise<boolean> {
  if (!chatIds || chatIds.length === 0) return true
  const { token: accessToken } = normalizeToken(token)
  try {
    const response = await axios.post(
      `${KIMI_API_BASE}${BATCH_DELETE_CHATS_PATH}`,
      { chat_ids: chatIds },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...FAKE_HEADERS,
        },
        timeout: 30000,
        validateStatus: () => true,
      },
    )
    return response.status === 200
  } catch (e) {
    console.warn('[Kimi] Failed to batch delete chats:', String(e))
    return false
  }
}

/**
 * 列出 kimi 服务端当前账号的所有聊天记录，然后全部删除
 * 用于用户手动"清空历史"
 */
export async function deleteAllChats(token: string): Promise<{ deleted: number; success: boolean }> {
  const { token: accessToken } = normalizeToken(token)
  let allChatIds: string[] = []
  let pageToken: string | undefined = undefined

  try {
    for (let page = 0; page < 100; page++) {
      const response = await axios.post(
        `${KIMI_API_BASE}${LIST_CHATS_PATH}`,
        {
          page_size: 100,
          ...(pageToken ? { page_token: pageToken } : {}),
          query: '',
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            ...FAKE_HEADERS,
          },
          timeout: 15000,
          validateStatus: () => true,
        },
      )
      if (response.status !== 200) break
      const data = response.data && typeof response.data === 'object' ? response.data : {}
      const chats = Array.isArray(data.chats) ? data.chats : []
      const ids: string[] = chats
        .map((c: any) => (typeof c?.id === 'string' ? c.id : ''))
        .filter((id: string) => id)
      allChatIds = [...allChatIds, ...ids]
      const next = typeof data.nextPageToken === 'string' ? data.nextPageToken : ''
      if (!next || chats.length === 0) break
      pageToken = next
    }

    if (allChatIds.length === 0) return { deleted: 0, success: true }
    let success = true
    for (let i = 0; i < allChatIds.length; i += 100) {
      const batch = allChatIds.slice(i, i + 100)
      const ok = await batchDeleteChats(accessToken, batch)
      if (!ok) success = false
    }
    return { deleted: allChatIds.length, success }
  } catch (e) {
    console.warn('[Kimi] Failed to delete all chats:', String(e))
    return { deleted: allChatIds.length, success: false }
  }
}

/**
 * 流式聊天
 * 对话结束后自动删除 kimi 服务端的聊天记录（autoDeleteConversation 默认为 true）
 */
export function chatStream(
  prompt: string,
  token: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  options: KimiChatOptions = {},
  signal?: AbortSignal,
): void {
  const MAX_RETRIES = 10
  const RETRY_STATUS = new Set([429, 502, 503])

  function attempt(retryCount: number) {
    if (signal?.aborted) return onError('用户中断')
    const { token: accessToken } = normalizeToken(token)
    const payload = buildChatPayload(prompt, options)
    const frameBuffer = encodeGrpcFrame(payload)
    const autoDelete = options.autoDeleteConversation !== false

    const cancelToken = new axios.CancelToken((c) => {
      if (signal) {
        signal.addEventListener('abort', () => c('用户中断'), { once: true })
      }
    })

    axios
      .post(`${KIMI_API_BASE}${CHAT_PATH}`, frameBuffer, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/connect+json',
          ...FAKE_HEADERS,
        },
        timeout: 120000,
        validateStatus: () => true,
        responseType: 'stream',
        cancelToken,
      })
      .then(response => {
        if (response.status === 401) {
          tokenCache = null
          onError('Token 无效或已过期 (401)')
          return
        }
        if (RETRY_STATUS.has(response.status) && retryCount < MAX_RETRIES) {
          const delay = 1000 * Math.pow(2, retryCount)
          console.warn(`[Kimi] Retry ${retryCount + 1}/${MAX_RETRIES} after ${response.status}, waiting ${delay}ms`)
          setTimeout(() => attempt(retryCount + 1), delay)
          return
        }
        if (response.status !== 200) {
          onError(`请求失败: HTTP ${response.status}`)
          return
        }

        let buffer = Buffer.alloc(0)
        let extractedChatId = ''
        const stream: NodeJS.ReadableStream = response.data

        stream.on('data', (chunk: Buffer) => {
          buffer = Buffer.concat([buffer, chunk])
          let offset = 0
          while (offset + 5 <= buffer.length) {
            const length = buffer.readUInt32BE(offset + 1)
            if (offset + 5 + length > buffer.length) break
            const payloadBuf = buffer.slice(offset + 5, offset + 5 + length)
            try {
              const text = payloadBuf.toString('utf8')
              if (text.trim()) {
                const data = JSON.parse(text)
                const { content, chatId } = parseFrame(data)
                if (chatId && !extractedChatId) extractedChatId = chatId
                if (content) onChunk(content)
              }
            } catch (e) {
              // ignore
            }
            offset += 5 + length
          }
          buffer = buffer.slice(offset)
        })

        stream.on('end', () => {
          onDone()
          if (autoDelete && extractedChatId) {
            deleteConversation(accessToken, extractedChatId).then((ok) => {
              if (!ok) console.warn('[Kimi] Failed to auto-delete conversation:', extractedChatId)
              else console.log('[Kimi] Auto-deleted conversation:', extractedChatId)
            })
          }
        })

        stream.on('error', (err: Error) => {
          if (retryCount < MAX_RETRIES) {
            const delay = 1000 * Math.pow(2, retryCount)
            console.warn(`[Kimi] Stream error, retry ${retryCount + 1}/${MAX_RETRIES} in ${delay}ms: ${err.message}`)
            setTimeout(() => attempt(retryCount + 1), delay)
          } else {
            onError(`流错误: ${err.message}`)
          }
        })
      })
      .catch((err: any) => {
        if (axios.isCancel(err)) {
          onError('用户中断')
          return
        }
        if (retryCount < MAX_RETRIES) {
          const delay = 1000 * Math.pow(2, retryCount)
          console.warn(`[Kimi] Request error, retry ${retryCount + 1}/${MAX_RETRIES} in ${delay}ms: ${err.message}`)
          setTimeout(() => attempt(retryCount + 1), delay)
        } else {
          onError(`请求错误: ${err.message}`)
        }
      })
  }

  attempt(0)
}

/**
 * 非流式聊天
 */
export async function chat(
  prompt: string,
  token: string,
  options: KimiChatOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    let fullText = ''
    chatStream(
      prompt,
      token,
      chunk => { fullText += chunk },
      () => { resolve(fullText) },
      err => { reject(new Error(err)) },
      options,
    )
  })
}

/**
 * 通过 Kimi SubscriptionService 验证 token 是否有效
 * 参考 chatlink: KimiAdapter.loginWithToken
 */
export async function validateToken(token: string): Promise<{ valid: boolean; userId?: string; name?: string }> {
  const { token: accessToken } = normalizeToken(token)
  try {
    const response = await axios.post(
      `${KIMI_API_BASE}/apiv2/kimi.gateway.order.v1.SubscriptionService/GetSubscription`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...FAKE_HEADERS,
        },
        timeout: 15000,
        validateStatus: () => true,
      },
    )
    if (response.status === 200 && response.data?.subscription) {
      return {
        valid: true,
        userId: response.data.subscription.userId || '',
        name: response.data.subscription.userName || '',
      }
    }
    if (response.status === 401) {
      tokenCache = null
    }
    return { valid: false }
  } catch (e) {
    return { valid: false }
  }
}

export default { chat, chatStream, deleteConversation, batchDeleteChats, deleteAllChats, validateToken, KIMI_API_BASE }
