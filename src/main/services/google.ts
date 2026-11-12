import { createHash, randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { safeStorage, shell } from 'electron'
import type { CalendarEvent, GoogleStatus, GoogleTask } from '../../shared/types'

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'
const TASKS_API = 'https://tasks.googleapis.com/tasks/v1'
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks'
].join(' ')

const CALENDAR_TTL = 60_000
const TASKS_TTL = 30_000

interface StoredTokens {
  access_token: string
  refresh_token: string | null
  expires_at: number
  email: string | null
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
  error?: string
  error_description?: string
}

interface CalendarListEntry {
  id: string
  summary?: string
  backgroundColor?: string
  selected?: boolean
  primary?: boolean
  accessRole?: string
}

interface CalendarEventItem {
  id: string
  status?: string
  summary?: string
  location?: string
  start?: { date?: string; dateTime?: string }
  end?: { date?: string; dateTime?: string }
}

interface TaskListItem {
  id: string
  title?: string
}

interface TaskItem {
  id: string
  title?: string
  notes?: string
  status?: string
  due?: string
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(normalized, 'base64').toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function resultPage(ok: boolean): string {
  const title = ok ? 'Notcha is connected' : 'Sign-in was cancelled'
  const message = ok
    ? 'You can close this tab and go back to Notcha.'
    : 'Nothing was changed. You can close this tab and try again from Notcha.'
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  html,body{height:100%;margin:0;background:#0b0c0f;color:#f2f4f8;
    font-family:"Segoe UI Variable","Segoe UI",system-ui,sans-serif;display:grid;place-items:center}
  .card{text-align:center;max-width:420px;padding:40px}
  .dot{width:46px;height:46px;border-radius:16px;background:#1b1d23;border:1px solid #2c2f38;
    margin:0 auto 22px;display:grid;place-items:center;font-size:20px}
  h1{font-size:19px;font-weight:600;margin:0 0 8px}
  p{margin:0;color:#8d93a1;font-size:13.5px;line-height:1.55}
</style></head><body><div class="card"><div class="dot">${ok ? '✓' : '✕'}</div>
<h1>${title}</h1><p>${message}</p></div></body></html>`
}

export class GoogleService {
  private tokens: StoredTokens | null = null
  private lastError: string | null = null
  private calendarCache: { at: number; events: CalendarEvent[] } | null = null
  private taskCache: { at: number; tasks: GoogleTask[]; lists: { id: string; title: string }[] } | null = null
  private connecting = false

  constructor(
    private tokenFile: string,
    private getClientId: () => string
  ) {}

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.tokenFile)
      let json: string | null = null
      if (raw.subarray(0, 6).toString('utf8') === 'plain:') {
        json = raw.subarray(6).toString('utf8')
      } else if (safeStorage.isEncryptionAvailable()) {
        json = safeStorage.decryptString(raw)
      }
      if (json) {
        const parsed = JSON.parse(json) as StoredTokens
        if (parsed && typeof parsed.access_token === 'string') this.tokens = parsed
      }
    } catch {
      this.tokens = null
    }
  }

  status(): GoogleStatus {
    return {
      configured: this.getClientId().length > 0,
      connected: this.tokens !== null,
      email: this.tokens?.email ?? null,
      error: this.lastError
    }
  }

  private async persist(): Promise<void> {
    try {
      if (!this.tokens) {
        await fs.rm(this.tokenFile, { force: true })
        return
      }
      const json = JSON.stringify(this.tokens)
      if (safeStorage.isEncryptionAvailable()) {
        await fs.writeFile(this.tokenFile, safeStorage.encryptString(json))
      } else {
        await fs.writeFile(this.tokenFile, `plain:${json}`, 'utf8')
      }
    } catch (error) {
      console.warn('[google] could not persist tokens:', error)
    }
  }

  async connect(): Promise<GoogleStatus> {
    if (this.connecting) return this.status()
    this.lastError = null
    const clientId = this.getClientId()
    if (!clientId) {
      this.lastError = 'Add a Google OAuth client ID first.'
      return this.status()
    }

    this.connecting = true
    const verifier = base64url(randomBytes(48))
    const challenge = base64url(createHash('sha256').update(verifier).digest())

    const server = createServer()
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => resolve())
      })
      const port = (server.address() as AddressInfo).port
      const redirectUri = `http://127.0.0.1:${port}`

      const authorize = new URL(AUTH_URL)
      authorize.searchParams.set('client_id', clientId)
      authorize.searchParams.set('redirect_uri', redirectUri)
      authorize.searchParams.set('response_type', 'code')
      authorize.searchParams.set('scope', SCOPES)
      authorize.searchParams.set('code_challenge', challenge)
      authorize.searchParams.set('code_challenge_method', 'S256')
      authorize.searchParams.set('access_type', 'offline')
      authorize.searchParams.set('prompt', 'consent')
      authorize.searchParams.set('include_granted_scopes', 'true')

      const code = await new Promise<string>((resolve, reject) => {
        let settled = false
        const finish = (error: Error | null, value?: string): void => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (error) reject(error)
          else resolve(value as string)
        }
        const timer = setTimeout(() => finish(new Error('Google sign-in timed out.')), 5 * 60_000)
        server.on('request', (request, response) => {
          const url = new URL(request.url ?? '/', 'http://127.0.0.1')
          if (url.pathname !== '/') {
            response.writeHead(404).end('Not found')
            return
          }
          const error = url.searchParams.get('error')
          const returned = url.searchParams.get('code')
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          response.end(resultPage(Boolean(returned)))
          if (returned) finish(null, returned)
          else finish(new Error(error ? `Google sign-in was cancelled (${error}).` : 'Google returned no authorization code.'))
        })

        void shell.openExternal(authorize.toString())
      })

      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri
        }).toString(),
        signal: AbortSignal.timeout(20_000)
      })
      const data = (await response.json()) as TokenResponse
      if (!response.ok || !data.access_token) {
        throw new Error(data.error_description ?? data.error ?? 'Google rejected the sign-in request.')
      }

      const claims = data.id_token ? decodeJwtPayload(data.id_token) : null
      this.tokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token ?? null,
        expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
        email: typeof claims?.email === 'string' ? claims.email : null
      }
      await this.persist()
      this.calendarCache = null
      this.taskCache = null
      this.lastError = null
    } catch (error) {
      this.lastError = (error as Error).message
    } finally {
      this.connecting = false
      try {
        server.close()
      } catch {
        /* ignore */
      }
    }
    return this.status()
  }

  async disconnect(): Promise<GoogleStatus> {
    this.tokens = null
    this.calendarCache = null
    this.taskCache = null
    this.lastError = null
    await this.persist()
    return this.status()
  }

  private async accessToken(): Promise<string> {
    const tokens = this.tokens
    if (!tokens) throw new Error('Google is not connected.')
    if (tokens.expires_at - 90_000 > Date.now()) return tokens.access_token

    if (!tokens.refresh_token) {
      this.tokens = null
      await this.persist()
      throw new Error('Google session expired. Please connect again.')
    }

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.getClientId(),
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token
      }).toString(),
      signal: AbortSignal.timeout(15_000)
    })
    const data = (await response.json()) as TokenResponse
    if (!response.ok || !data.access_token) {
      this.tokens = null
      await this.persist()
      throw new Error('Google session expired. Please connect again.')
    }
    this.tokens = {
      ...tokens,
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? tokens.refresh_token,
      expires_at: Date.now() + (data.expires_in ?? 3600) * 1000
    }
    await this.persist()
    return this.tokens.access_token
  }

  private async request<T>(url: string, init: RequestInit = {}, retry = true): Promise<T> {
    const token = await this.accessToken()
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(15_000) })
    if (response.status === 401 && retry && this.tokens) {
      this.tokens.expires_at = 0
      return this.request<T>(url, init, false)
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      if (response.status === 403) {
        throw new Error('Google denied access. Reconnect to grant calendar and tasks permissions.')
      }
      throw new Error(`Google API error ${response.status}: ${body.slice(0, 160)}`)
    }
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return {} as T
    }
    const text = await response.text()
    if (!text.trim()) return {} as T
    return JSON.parse(text) as T
  }

  async calendar(): Promise<{ events: CalendarEvent[]; error: string | null }> {
    if (!this.tokens) return { events: [], error: 'Google is not connected.' }
    if (this.calendarCache && Date.now() - this.calendarCache.at < CALENDAR_TTL) {
      return { events: this.calendarCache.events, error: null }
    }
    try {
      const list = await this.request<{ items?: CalendarListEntry[] }>(
        `${CALENDAR_API}/users/me/calendarList?minAccessRole=reader&maxResults=50`
      )
      const calendars = (list.items ?? [])
        .filter((item) => item.selected !== false && item.id)
        .slice(0, 8)

      const start = new Date()
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 8)

      const responses = await Promise.all(
        calendars.map(async (calendar) => {
          const params = new URLSearchParams({
            singleEvents: 'true',
            orderBy: 'startTime',
            timeMin: start.toISOString(),
            timeMax: end.toISOString(),
            maxResults: '60'
          })
          try {
            const data = await this.request<{ items?: CalendarEventItem[] }>(
              `${CALENDAR_API}/calendars/${encodeURIComponent(calendar.id)}/events?${params.toString()}`
            )
            return { calendar, items: data.items ?? [] }
          } catch {
            return { calendar, items: [] as CalendarEventItem[] }
          }
        })
      )

      const events: CalendarEvent[] = []
      for (const { calendar, items } of responses) {
        for (const item of items) {
          if (item.status === 'cancelled') continue
          const startRaw = item.start?.dateTime ?? item.start?.date
          const endRaw = item.end?.dateTime ?? item.end?.date
          if (!startRaw) continue
          events.push({
            id: item.id,
            title: item.summary?.trim() || 'Busy',
            start: startRaw,
            end: endRaw ?? startRaw,
            allDay: Boolean(item.start?.date),
            location: item.location ?? null,
            calendarName: calendar.summary ?? 'Calendar',
            color: calendar.backgroundColor ?? null
          })
        }
      }
      events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      this.calendarCache = { at: Date.now(), events }
      this.lastError = null
      return { events, error: null }
    } catch (error) {
      const message = (error as Error).message
      this.lastError = message
      return { events: this.calendarCache?.events ?? [], error: message }
    }
  }

  private async taskLists(force = false): Promise<{ id: string; title: string }[]> {
    if (!force && this.taskCache && Date.now() - this.taskCache.at < TASKS_TTL) {
      return this.taskCache.lists
    }
    const data = await this.request<{ items?: TaskListItem[] }>(`${TASKS_API}/users/@me/lists?maxResults=20`)
    return (data.items ?? [])
      .filter((list) => list.id)
      .slice(0, 5)
      .map((list) => ({ id: list.id, title: list.title ?? 'Tasks' }))
  }

  async tasks(): Promise<{ tasks: GoogleTask[]; lists: { id: string; title: string }[]; error: string | null }> {
    if (!this.tokens) return { tasks: [], lists: [], error: 'Google is not connected.' }
    if (this.taskCache && Date.now() - this.taskCache.at < TASKS_TTL) {
      return { tasks: this.taskCache.tasks, lists: this.taskCache.lists, error: null }
    }
    try {
      const lists = await this.taskLists()
      const results = await Promise.all(
        lists.map(async (list) => {
          const params = new URLSearchParams({
            showCompleted: 'false',
            showHidden: 'false',
            maxResults: '60'
          })
          try {
            const data = await this.request<{ items?: TaskItem[] }>(
              `${TASKS_API}/lists/${encodeURIComponent(list.id)}/tasks?${params.toString()}`
            )
            return (data.items ?? []).map<GoogleTask>((task) => ({
              id: task.id,
              listId: list.id,
              listTitle: list.title,
              title: task.title?.trim() || 'Untitled task',
              notes: task.notes ?? null,
              done: task.status === 'completed',
              due: task.due ?? null
            }))
          } catch {
            return [] as GoogleTask[]
          }
        })
      )
      const tasks = results.flat()
      this.taskCache = { at: Date.now(), tasks, lists }
      this.lastError = null
      return { tasks, lists, error: null }
    } catch (error) {
      const message = (error as Error).message
      this.lastError = message
      return { tasks: this.taskCache?.tasks ?? [], lists: this.taskCache?.lists ?? [], error: message }
    }
  }

  async addTask(title: string, listId?: string): Promise<{ ok: boolean; error: string | null }> {
    try {
      let targetList = listId
      if (!targetList) {
        const lists = await this.taskLists()
        targetList = lists[0]?.id
      }
      if (!targetList) throw new Error('No Google task list was found.')
      await this.request(`${TASKS_API}/lists/${encodeURIComponent(targetList)}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
      })
      this.taskCache = null
      return { ok: true, error: null }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }

  async setTask(listId: string, taskId: string, done: boolean): Promise<{ ok: boolean; error: string | null }> {
    try {
      await this.request(
        `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: done ? 'completed' : 'needsAction' })
        }
      )
      this.taskCache = null
      return { ok: true, error: null }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }

  async deleteTask(listId: string, taskId: string): Promise<{ ok: boolean; error: string | null }> {
    try {
      await this.request(
        `${TASKS_API}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
        { method: 'DELETE' }
      )
      this.taskCache = null
      return { ok: true, error: null }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }
}
