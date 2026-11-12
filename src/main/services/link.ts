import { promises as fs } from 'node:fs'

export interface LinkMessage {
  seq: number
  text: string
  at: number
}

export interface LinkBatch {
  messages: LinkMessage[]
  last: number
}

/**
 * The inbox behind the Agent tab's local channel: messages typed in the notch
 * wait here until a coding agent on this machine collects them with
 * `tools/notcha-agent.mjs`, and answers come back through the same bridge.
 */
export class AgentLink {
  private messages: LinkMessage[] = []
  private seq = 0
  private waiters = new Set<() => void>()

  constructor(private file: string) {}

  async init(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      const data = JSON.parse(raw) as { seq?: number; messages?: LinkMessage[] }
      if (Array.isArray(data.messages)) {
        this.messages = data.messages
          .filter((message) => typeof message?.text === 'string')
          .slice(-40)
          .map((message) => ({
            seq: Number(message.seq) || 0,
            text: message.text,
            at: Number(message.at) || Date.now()
          }))
        this.messages.sort((a, b) => a.seq - b.seq)
        this.seq = Math.max(Number(data.seq) || 0, this.messages.at(-1)?.seq ?? 0, 0)
      }
    } catch {
      /* first run */
    }
  }

  private persist(): void {
    const payload = JSON.stringify({ seq: this.seq, messages: this.messages })
    void fs.writeFile(this.file, payload, 'utf8').catch((error) => {
      console.warn('[agent-link] could not save the inbox', error)
    })
  }

  get pending(): number {
    return this.messages.length
  }

  push(text: string): LinkMessage {
    const message: LinkMessage = { seq: ++this.seq, text, at: Date.now() }
    this.messages.push(message)
    if (this.messages.length > 40) this.messages = this.messages.slice(-40)
    this.persist()
    for (const wake of [...this.waiters]) wake()
    return message
  }

  private drain(after: number): LinkBatch {
    const messages = this.messages.filter((message) => message.seq > after)
    if (messages.length > 0) {
      this.messages = this.messages.filter((message) => message.seq <= after)
      this.persist()
    }
    return { messages, last: this.seq }
  }

  /** Long poll: resolves as soon as something new arrives, or when time is up. */
  wait(after: number, timeoutMs: number): Promise<LinkBatch> {
    if (this.messages.some((message) => message.seq > after)) {
      return Promise.resolve(this.drain(after))
    }
    return new Promise<LinkBatch>((resolve) => {
      let settled = false
      const finish = (): void => {
        if (settled) return
        settled = true
        this.waiters.delete(wake)
        clearTimeout(timer)
        resolve(this.drain(after))
      }
      const wake = (): void => finish()
      const timer = setTimeout(finish, timeoutMs)
      this.waiters.add(wake)
    })
  }
}
