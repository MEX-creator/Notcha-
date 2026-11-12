import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'

export interface BridgeReady {
  pid: number
  powershell: string
  audio: boolean
}

export interface BridgeCallbacks {
  onReady: (info: BridgeReady) => void
  onSystem: (data: Record<string, unknown>) => void
  onMedia: (data: Record<string, unknown>) => void
  onError: (message: string) => void
}

const MAX_RESTARTS = 6

export class Bridge extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private restarts = 0
  private disposed = false
  private restartTimer: NodeJS.Timeout | null = null
  private lastStart = 0
  private ready = false

  constructor(
    private scriptPath: string,
    private callbacks: BridgeCallbacks
  ) {
    super()
  }

  start(): void {
    if (this.disposed || this.child) return
    this.lastStart = Date.now()
    this.buffer = ''

    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
      )
    } catch (error) {
      this.callbacks.onError(`Could not start the Windows bridge: ${String(error)}`)
      this.scheduleRestart()
      return
    }

    this.child = child

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.handleChunk(chunk))

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      const text = chunk.trim()
      if (text) console.warn('[bridge]', text.slice(0, 500))
    })

    child.on('error', (error) => {
      this.callbacks.onError(`Windows bridge error: ${error.message}`)
    })

    child.on('exit', (code) => {
      this.child = null
      this.ready = false
      if (this.disposed) return
      if (code !== 0 && code !== null) {
        console.warn('[bridge] exited with code', code)
      }
      this.scheduleRestart()
    })

    // A bridge that never becomes ready means the media/system APIs are unusable.
    setTimeout(() => {
      if (!this.ready && this.child) {
        this.callbacks.onError('The Windows bridge did not report ready in time.')
      }
    }, 20_000)
  }

  private handleChunk(chunk: string): void {
    this.buffer += chunk
    let index = this.buffer.indexOf('\n')
    while (index !== -1) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      if (line) this.handleLine(line)
      index = this.buffer.indexOf('\n')
    }
    if (this.buffer.length > 4_000_000) this.buffer = ''
  }

  private handleLine(line: string): void {
    let message: { t?: string; data?: Record<string, unknown> }
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (!message || typeof message !== 'object') return
    switch (message.t) {
      case 'ready':
        this.ready = true
        this.restarts = 0
        this.callbacks.onReady({
          pid: Number(message.data?.pid) || 0,
          powershell: String(message.data?.powershell ?? ''),
          audio: Boolean(message.data?.audio)
        })
        break
      case 'sys':
        if (message.data) this.callbacks.onSystem(message.data)
        break
      case 'media':
        if (message.data) this.callbacks.onMedia(message.data)
        break
      case 'error':
        this.callbacks.onError(String(message.data?.message ?? 'Unknown bridge error'))
        break
    }
  }

  private scheduleRestart(): void {
    if (this.disposed) return
    if (this.restarts >= MAX_RESTARTS) {
      this.callbacks.onError('The Windows bridge stopped responding. Media and system notices are unavailable.')
      return
    }
    const ranFor = Date.now() - this.lastStart
    if (ranFor < 3000) this.restarts += 1
    const delay = Math.min(30_000, 1500 * Math.max(1, this.restarts))
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      this.start()
    }, delay)
  }

  send(command: Record<string, unknown>): void {
    const child = this.child
    if (!child || !child.stdin.writable) return
    try {
      child.stdin.write(`${JSON.stringify(command)}\n`)
    } catch {
      // A dead pipe is handled by the exit listener.
    }
  }

  dispose(): void {
    this.disposed = true
    if (this.restartTimer) clearTimeout(this.restartTimer)
    this.restartTimer = null
    const child = this.child
    this.child = null
    if (!child) return
    try {
      child.stdin.end()
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        child.kill()
      } catch {
        /* ignore */
      }
    }, 800)
  }
}
