/**
 * Kimi 内置浏览器登录与 Token 提取
 * 
 * 启动一个 BrowserWindow 加载 kimi.com，通过以下方式获取 Token：
 * 1. webRequest.onBeforeSendHeaders - 拦截请求头中的 Authorization: Bearer
 * 2. webRequest.onHeadersReceived - 拦截响应头中的 Set-Cookie
 * 3. 轮询 cookie / localStorage / sessionStorage（降级方案）
 *
 * 参考 chatlink (chat2api) 的 OAuth 实现
 *   - tokenExtractionConfig.ts: Kimi 的 token 仅通过 networkHeader 获取
 *   - inAppLogin.ts: webRequest.onBeforeSendHeaders 实时拦截 Bearer token
 */

import { BrowserWindow, session, Session } from 'electron'
import axios from 'axios'

const KIMI_LOGIN_URLS = ['https://www.kimi.com', 'https://kimi.com']
const KIMI_API_BASE = 'https://www.kimi.com'
const DEFAULT_TIMEOUT = 5 * 60 * 1000 // 5 分钟
const POLL_INTERVAL = 2000            // 2 秒
const MIN_LOGIN_TIME = 5000           // 登录开始后至少等 5 秒才开始检查 token

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

export interface KimiLoginResult {
  token: string
  userId: string
  name?: string
}

export function detectTokenType(token: string): 'jwt' | 'refresh' | 'unknown' {
  if (!token) return 'unknown'
  if (token.startsWith('eyJ') && token.split('.').length === 3) {
    try {
      const payload = parseJWTPayload(token)
      // 必须同时满足 app_id === 'kimi' 和 typ === 'access' 才算有效 JWT
      if (payload && payload.app_id === 'kimi' && payload.typ === 'access') {
        return 'jwt'
      }
    } catch (e) {
      // ignore parse errors
    }
  }
  return 'refresh'
}

export function parseJWTPayload(token: string): any {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  let body = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  while (body.length % 4) body += '='
  try {
    const decoded = Buffer.from(body, 'base64').toString('utf8')
    return JSON.parse(decoded)
  } catch (e) {
    return null
  }
}

function extractUserId(token: string): string {
  const payload = parseJWTPayload(token)
  if (!payload) return ''
  return String(payload.sub || payload.user_id || payload.userId || '')
}

function isValidToken(value: string): boolean {
  if (!value || value.length < 10) return false

  // JWT 格式（3 段，以 eyJ 开头）
  if (value.startsWith('eyJ')) {
    const parts = value.split('.')
    if (parts.length === 3) {
      try {
        // 复用 parseJWTPayload 正确处理 base64url 编码
        const payload = parseJWTPayload(value)
        if (!payload) return false
        // 拒绝 guest 账号
        if (payload.email && payload.email.includes('@guest.com')) return false
        if (payload && (payload.app_id || payload.sub || payload.exp || payload.id || payload.user_id)) {
          return true
        }
      } catch { return false }
    }
    // JWE 格式（5 段）
    if (parts.length === 5 && value.length >= 100) return true
  }

  // 长 token（>= 64 字符）
  if (value.length >= 64 && /^[a-zA-Z0-9_\-+/*]+$/.test(value)) return true

  return false
}

export async function openKimiLoginWindow(): Promise<KimiLoginResult> {
  return new Promise((resolve, reject) => {
    const partition = `persist:kimi-login-${Date.now()}`
    const kimiSession = session.fromPartition(partition)

    let resolved = false
    let currentUrlIndex = 0
    let loginStartTime = Date.now()
    let lastTokenCheckTime = 0

    const cleanup = () => {
      clearInterval(pollTimer)
      clearTimeout(timeoutTimer)
      if (!loginWindow.isDestroyed()) {
        loginWindow.removeAllListeners()
        loginWindow.close()
      }
      // 清理 webRequest 监听
      try {
        kimiSession.webRequest.onBeforeSendHeaders(() => {})
        kimiSession.webRequest.onHeadersReceived(() => {})
      } catch (e) {
        // ignore cleanup errors
      }
      kimiSession.clearStorageData({ storages: ['cookies', 'localstorage'] }).catch(() => {})
    }

    // 存储已验证通过的 token 及其用户信息，避免重复验证
    let validatedToken: string | null = null
    let validatedUserId = ''
    let validatedName = ''

    const validateViaApi = async (rawToken: string): Promise<{ ok: boolean; userId?: string; name?: string }> => {
      if (validatedToken === rawToken) return { ok: true, userId: validatedUserId, name: validatedName }
      try {
        console.log('[KimiLogin] Validating token via SubscriptionService API...')
        const response = await axios.post(
          `${KIMI_API_BASE}/apiv2/kimi.gateway.order.v1.SubscriptionService/GetSubscription`,
          {},
          {
            headers: {
              Authorization: `Bearer ${rawToken}`,
              'Content-Type': 'application/json',
              ...FAKE_HEADERS,
            },
            timeout: 15000,
            validateStatus: () => true,
          },
        )
        const isValid = response.status === 200 && !!response.data?.subscription
        if (isValid) {
          validatedToken = rawToken
          validatedUserId = response.data.subscription.userId || ''
          validatedName = response.data.subscription.userName || ''
          console.log('[KimiLogin] Token validated successfully via API, user:', validatedName || validatedUserId)
          return { ok: true, userId: validatedUserId, name: validatedName }
        } else {
          console.log('[KimiLogin] Token rejected by API (status:', response.status, ')')
          return { ok: false }
        }
      } catch (e: any) {
        console.log('[KimiLogin] Token validation error:', e?.message)
        return { ok: false }
      }
    }

    const doResolve = (token: string, name?: string) => {
      if (resolved) return
      resolved = true
      const userId = extractUserId(token) || validatedUserId
      cleanup()
      resolve({ token, userId, name })
    }

    const doReject = (err: string) => {
      if (resolved) return
      resolved = true
      cleanup()
      reject(new Error(err))
    }

    const hasMinTimePassed = () => Date.now() - loginStartTime >= MIN_LOGIN_TIME

    // ==================== webRequest: 拦截请求头中的 Authorization: Bearer ====================
    kimiSession.webRequest.onBeforeSendHeaders((details, callback) => {
      if (resolved) {
        callback({ requestHeaders: details.requestHeaders })
        return
      }

      if (!hasMinTimePassed()) {
        callback({ requestHeaders: details.requestHeaders })
        return
      }

      const authHeader = details.requestHeaders['Authorization'] || details.requestHeaders['authorization']
      if (authHeader) {
        let token = authHeader
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7)
        }
        if (isValidToken(token) && detectTokenType(token) === 'jwt') {
          console.log('[KimiLogin] Found candidate JWT from Authorization header, validating via API...')
          validateViaApi(token).then((result) => {
            if (result.ok && !resolved) {
              console.log('[KimiLogin] Valid JWT from Authorization header')
              doResolve(token, result.name)
            }
          })
        }
      }

      callback({ requestHeaders: details.requestHeaders })
    })

    // ==================== webRequest: 拦截响应头中的 Set-Cookie ====================
    kimiSession.webRequest.onHeadersReceived((details, callback) => {
      if (resolved) {
        callback({})
        return
      }

      if (!hasMinTimePassed()) {
        callback({})
        return
      }

      const setCookieHeaders = details.responseHeaders?.['set-cookie'] || details.responseHeaders?.['Set-Cookie']
      if (setCookieHeaders && Array.isArray(setCookieHeaders)) {
        for (const cookieHeader of setCookieHeaders) {
          const cookieParts = cookieHeader.split(';')
          const nameValue = cookieParts[0]?.trim()
          if (nameValue) {
            const equalIndex = nameValue.indexOf('=')
            if (equalIndex > 0) {
              const name = nameValue.substring(0, equalIndex)
              let value = nameValue.substring(equalIndex + 1)
              if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1)
              }
              if (/kimi-auth/i.test(name) && isValidToken(value) && detectTokenType(value) === 'jwt') {
                console.log('[KimiLogin] Found candidate JWT from Set-Cookie header, validating via API...')
                validateViaApi(value).then((result) => {
                  if (result.ok && !resolved) {
                    console.log('[KimiLogin] Valid JWT from Set-Cookie')
                    doResolve(value, result.name)
                  }
                })
              }
            }
          }
        }
      }

      callback({})
    })

    // 超时
    const timeoutTimer = setTimeout(() => {
      doReject('Kimi 登录超时 (5 分钟)')
    }, DEFAULT_TIMEOUT)

    // ==================== 创建登录窗口 ====================
    const loginWindow = new BrowserWindow({
      width: 500,
      height: 700,
      title: '登录 Kimi',
      autoHideMenuBar: true,
      show: false,
      webPreferences: {
        partition,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        javascript: true,
      },
    })

    loginWindow.once('ready-to-show', () => {
      loginWindow.show()
    })

    const tryLoadNextUrl = () => {
      if (currentUrlIndex >= KIMI_LOGIN_URLS.length) return
      const url = KIMI_LOGIN_URLS[currentUrlIndex++]
      loginWindow.loadURL(url).catch(err => {
        console.warn('[KimiLogin] loadURL failed:', url, err.message)
        tryLoadNextUrl()
      })
    }
    tryLoadNextUrl()

    // ==================== 定期轮询 cookie / localStorage (降级方案) ====================
    const pollTimer = setInterval(async () => {
      if (resolved || loginWindow.isDestroyed()) return
      if (!hasMinTimePassed()) return

      // 限频：至少间隔 POLL_INTERVAL
      const now = Date.now()
      if (now - lastTokenCheckTime < POLL_INTERVAL) return
      lastTokenCheckTime = now

      try {
        // 1. 检查 cookies
        const cookies = await kimiSession.cookies.get({})
        for (const c of cookies) {
          if (/kimi-auth/i.test(c.name) && isValidToken(c.value) && detectTokenType(c.value) === 'jwt') {
            if (c.value === validatedToken) {
              console.log('[KimiLogin] Cookie token already validated, resolving')
              doResolve(c.value, validatedName)
              return
            }
            console.log('[KimiLogin] Found candidate JWT from cookie, validating via API...')
            const result = await validateViaApi(c.value)
            if (result.ok && !resolved) {
              console.log('[KimiLogin] Valid JWT from cookie')
              doResolve(c.value, result.name)
              return
            }
          }
        }

        // 2. 检查 localStorage / sessionStorage
        if (!loginWindow.webContents.isDestroyed()) {
          try {
            const storageData = await loginWindow.webContents.executeJavaScript(`
              (function(){
                const out = [];
                try {
                  for (let i = 0; i < localStorage.length; i++){
                    const k = localStorage.key(i);
                    out.push({ type: 'local', key: k, value: localStorage.getItem(k) });
                  }
                } catch(e){}
                try {
                  for (let i = 0; i < sessionStorage.length; i++){
                    const k = sessionStorage.key(i);
                    out.push({ type: 'session', key: k, value: sessionStorage.getItem(k) });
                  }
                } catch(e){}
                return out;
              })()
            `)
            if (Array.isArray(storageData)) {
              for (const item of storageData) {
                if (!item || !item.key || !item.value) continue
                const v = String(item.value)
                let raw = v
                try {
                  const parsed = JSON.parse(v)
                  if (typeof parsed === 'string') raw = parsed
                } catch (e) { /* not JSON */ }

                if (/kimi-auth/i.test(item.key) || /access_token/i.test(item.key) || /^token$/i.test(item.key)) {
                  if (isValidToken(raw) && detectTokenType(raw) === 'jwt') {
                    if (raw === validatedToken) {
                      console.log('[KimiLogin] Storage token already validated, resolving')
                      doResolve(raw, validatedName)
                      return
                    }
                    console.log('[KimiLogin] Found candidate JWT from storage, validating via API...')
                    const result = await validateViaApi(raw)
                    if (result.ok && !resolved) {
                      console.log('[KimiLogin] Valid JWT from storage')
                      doResolve(raw, result.name)
                      return
                    }
                  }
                }
              }
            }
          } catch (e) {
            // ignore executeJavaScript errors
          }
        }
      } catch (err: any) {
        console.warn('[KimiLogin] poll error:', err?.message)
      }
    }, POLL_INTERVAL)

    loginWindow.webContents.on('did-navigate', (_event, url) => {
      console.log('[KimiLogin] navigated to:', url)
    })

    loginWindow.on('closed', () => {
      if (!resolved) {
        doReject('Kimi 登录窗口已关闭')
      }
    })
  })
}

export default { openKimiLoginWindow, detectTokenType, parseJWTPayload }
