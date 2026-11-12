import { promises as fs } from 'node:fs'
import { safeStorage } from 'electron'
import type { AgentChannel, AgentStatus, AgentTurn } from '../../shared/types'

const SYSTEM_PROMPT = [
  'You are the assistant inside Notcha, a small always-on-top desktop widget on Windows.',
  'Answer briefly: at most about 90 words unless the user asks for more, plain text, no markdown headings or code fences.',
  'You can see a short snapshot of the user context that is included with each message (time, music, tasks, water, focus timer, volume, network).',
  'Use it when it helps, but do not read it back line by line.',
  'You cannot control the computer, open apps, or change settings; if asked, say so in one sentence.',
  'Stay private: never ask for passwords or personal identifiers.'
].join(' ')

interface ChatConfig {
  model: string
  baseUrl: string
  channel: AgentChannel
}

interface ChatChunk {
  choices?: { delta?: { content?: string }; message?: { content?: string } }[]
  error?: { message?: string } | string
}

export class AgentService {
  private key: string | null = null
  private lastError: string | null = null

  constructor(
    private keyFile: string,
    private config: () => ChatConfig
  ) {}

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.keyFile)
      if (raw.subarray(0, 6).toString('utf8') === 'plain:') {
        this.key = raw.subarray(6).toString('utf8').trim() || null
      } else if (safeStorage.isEncryptionAvailable()) {
        this.key = safeStorage.decryptString(raw).trim() || null
      }
    } catch {
      this.key = null
    }
  }

  status(): AgentStatus {
    const { model, baseUrl, channel } = this.config()
    // With no key there is only one working channel: the local one.
    return { hasKey: this.key !== null, channel: this.key ? channel : 'local', model, baseUrl, error: this.lastError }
  }

  private async persist(): Promise<void> {
    try {
      if (!this.key) {
        await fs.rm(this.keyFile, { force: true })
        return
      }
      if (safeStorage.isEncryptionAvailable()) {
        await fs.writeFile(this.keyFile, safeStorage.encryptString(this.key))
      } else {
        await fs.writeFile(this.keyFile, `plain:${this.key}`, 'utf8')
      }
    } catch (error) {
      console.warn('[agent] could not persist API key:', error)
    }
  }

  async setKey(raw: string): Promise<AgentStatus> {
    const value = raw.trim()
    this.lastError = null
    if (value.length < 8 || value.length > 400) {
      this.lastError = 'That does not look like an API key.'
      return this.status()
    }
    this.key = value
    await this.persist()
    return this.status()
  }

  async clearKey(): Promise<AgentStatus> {
    this.key = null
    this.lastError = null
    await this.persist()
    return this.status()
  }

  private endpoint(): string {
    const base = this.config().baseUrl.trim().replace(/\/+$/, '')
    if (!/^https?:\/\//i.test(base)) {
      throw new Error('Add a valid API base URL in Settings.')
    }
    return /\/chat\/completions$/i.test(base) ? base : `${base}/chat/completions`
  }

  private describeError(status: number, body: string): string {
    if (status === 401 || status === 403) return 'The API key was rejected. Check it in Settings.'
    if (status === 404) return 'That endpoint was not found. Check the base URL and model name.'
    if (status === 429) return 'The provider is rate limiting requests. Try again in a moment.'
    if (status >= 500) return `The provider had an error (${status}). Try again shortly.`
    const trimmed = body.replace(/\s+/g, ' ').trim().slice(0, 180)
    return trimmed ? `Request failed (${status}): ${trimmed}` : `Request failed (${status}).`
  }

  async stream(
    turns: AgentTurn[],
    context: string,
    onDelta: (text: string) => void,
    signal: AbortSignal
  ): Promise<string> {
    const key = this.key
    if (!key) throw new Error('Add an API key in Settings to chat.')

    const { model } = this.config()
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...(context.trim()
        ? [{ role: 'system', content: `Current user context:\n${context.trim()}` }]
        : []),
      ...turns
    ]

    const response = await fetch(this.endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({ model, messages, stream: true, temperature: 0.6, max_tokens: 700 }),
      signal
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(this.describeError(response.status, body))
    }

    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/event-stream') || !response.body) {
      // Some OpenAI-compatible servers answer in one JSON object even when asked
      // to stream; accept that instead of failing.
      const data = (await response.json().catch(() => null)) as ChatChunk | null
      const text = data?.choices?.[0]?.message?.content ?? ''
      if (!text.trim()) throw new Error('The model returned an empty reply.')
      onDelta(text)
      return text
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
        if (!line || line.startsWith(':')) continue
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let parsed: ChatChunk
        try {
          parsed = JSON.parse(payload) as ChatChunk
        } catch {
          continue
        }
        const error = parsed.error
        if (error) throw new Error(typeof error === 'string' ? error : (error.message ?? 'The provider returned an error.'))
        const delta = parsed.choices?.[0]?.delta?.content
        if (typeof delta === 'string' && delta.length > 0) {
          full += delta
          onDelta(delta)
        }
      }
    }

    if (!full.trim()) throw new Error('The model returned an empty reply.')
    return full
  }
}
