import { randomBytes, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { NotchNotification, NotifyAction, NotifyKind } from '../shared/types'

const KINDS: NotifyKind[] = ['info', 'success', 'warning', 'timer', 'agent', 'question', 'permission']
const MAX_BODY = 16 * 1024
const ANSWER_TIMEOUT = 10 * 60_000

export interface NotifyAnswer {
  actionId: string | null
  dismissed: boolean
}

interface NotifierOptions {
  onShow: (notification: NotchNotification) => void
  onClose: (id: string) => void
  /** Messages typed in the Agent tab, waiting for a coding agent on this PC. */
  agentInbox?: (after: number, waitMs: number) => Promise<{ messages: unknown[]; last: number }>
  /** An answer from that coding agent, shown in the Agent tab. */
  agentReply?: (text: string) => void
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('Payload too large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function parseActions(raw: unknown): NotifyAction[] {
  if (!Array.isArray(raw)) return []
  return raw
    .slice(0, 4)
    .map((item, index) => {
      const value = (item ?? {}) as Record<string, unknown>
      const label = String(value['label'] ?? '').trim().slice(0, 40)
      const id = String(value['id'] ?? `action-${index + 1}`).trim().slice(0, 40)
      const style = value['style']
      return {
        id,
        label,
        style: style === 'primary' || style === 'danger' ? style : 'default'
      } as NotifyAction
    })
    .filter((action) => action.label.length > 0)
}

/**
 * A tiny HTTP endpoint on the loopback interface so other programs (an editor, a
 * build script, the coding agent) can ask the notch for attention and, when the
 * card has buttons, receive the answer as the response.
 */
export class Notifier {
  private server: Server | null = null
  private token = ''
  private port = 0
  private waiters = new Map<string, (answer: NotifyAnswer) => void>()

  constructor(
    private options: NotifierOptions,
    private file: string
  ) {}

  async start(): Promise<void> {
    if (this.server) return
    this.token = randomBytes(24).toString('hex')

    const server = createServer((request, response) => {
      void this.handle(request, response)
    })
    this.server = server

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })

    this.port = (server.address() as AddressInfo).port
    server.on('error', (error) => console.warn('[notifier] server error', error))

    try {
      await fs.writeFile(
        this.file,
        JSON.stringify({ port: this.port, token: this.token, pid: process.pid }, null, 2),
        { encoding: 'utf8', mode: 0o600 }
      )
    } catch (error) {
      console.warn('[notifier] could not write bridge file', error)
    }
  }

  /** Called by the renderer once the user picks an action or dismisses a card. */
  answer(id: string, actionId: string | null): void {
    const waiter = this.waiters.get(id)
    this.waiters.delete(id)
    this.options.onClose(id)
    waiter?.({ actionId, dismissed: actionId === null })
  }

  private reply(response: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body)
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    })
    response.end(payload)
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')

      if (request.method === 'GET' && url.pathname === '/health') {
        this.reply(response, 200, { ok: true, app: 'notcha' })
        return
      }

      if (request.headers['x-notch-token'] !== this.token) {
        this.reply(response, 401, { ok: false, error: 'Missing or invalid token.' })
        return
      }

      if (request.method === 'GET' && url.pathname === '/agent/inbox') {
        const after = Number(url.searchParams.get('after') ?? '0') || 0
        const waitMs = url.searchParams.get('wait') === '0' ? 0 : 20_000
        const batch = this.options.agentInbox
          ? await this.options.agentInbox(after, waitMs)
          : { messages: [], last: after }
        this.reply(response, 200, batch)
        return
      }

      if (request.method === 'POST' && url.pathname === '/agent/reply') {
        if (!this.options.agentReply) {
          this.reply(response, 503, { ok: false, error: 'The agent channel is not available.' })
          return
        }
        const body = JSON.parse((await readBody(request)) || '{}') as Record<string, unknown>
        const text = String(body['text'] ?? '').trim().slice(0, 4000)
        if (!text) {
          this.reply(response, 400, { ok: false, error: 'Reply text is required.' })
          return
        }
        this.options.agentReply(text)
        this.reply(response, 200, { ok: true })
        return
      }

      if (request.method !== 'POST' || url.pathname !== '/notify') {
        this.reply(response, 404, { ok: false, error: 'Not found.' })
        return
      }

      const body = JSON.parse((await readBody(request)) || '{}') as Record<string, unknown>
      const title = String(body['title'] ?? '').trim().slice(0, 140)
      if (!title) {
        this.reply(response, 400, { ok: false, error: 'A title is required.' })
        return
      }

      const actions = parseActions(body['actions'])
      const notification: NotchNotification = {
        id: randomUUID(),
        kind: KINDS.includes(body['kind'] as NotifyKind) ? (body['kind'] as NotifyKind) : 'agent',
        title,
        detail: body['detail'] ? String(body['detail']).slice(0, 400) : null,
        source: body['source'] ? String(body['source']).slice(0, 40) : null,
        actions,
        createdAt: Date.now(),
        timeoutMs: clamp(body['timeoutMs'], 0, 120_000, actions.length > 0 ? 0 : 4500)
      }

      const wait = body['wait'] !== false
      this.options.onShow(notification)

      // Informational cards and fire-and-forget requests answer immediately.
      if (actions.length === 0 || !wait) {
        this.reply(response, 200, { ok: true, id: notification.id })
        return
      }

      const answer = await new Promise<NotifyAnswer>((resolve) => {
        const timer = setTimeout(() => {
          this.waiters.delete(notification.id)
          resolve({ actionId: null, dismissed: true })
        }, ANSWER_TIMEOUT)

        const finish = (result: NotifyAnswer): void => {
          clearTimeout(timer)
          resolve(result)
        }
        this.waiters.set(notification.id, finish)

        // The caller hung up (Ctrl+C in a terminal, a killed script).
        response.on('close', () => {
          if (response.writableEnded) return
          if (!this.waiters.has(notification.id)) return
          this.waiters.delete(notification.id)
          this.options.onClose(notification.id)
          finish({ actionId: null, dismissed: true })
        })
      })

      this.reply(response, 200, { ok: true, id: notification.id, ...answer })
    } catch (error) {
      console.warn('[notifier] request failed', error)
      if (!response.headersSent) this.reply(response, 400, { ok: false, error: 'Invalid request.' })
    }
  }

  async stop(): Promise<void> {
    const server = this.server
    this.server = null
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    try {
      await fs.rm(this.file, { force: true })
    } catch {
      /* ignore */
    }
  }
}
