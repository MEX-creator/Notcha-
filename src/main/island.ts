import { BrowserWindow, screen, type Display } from 'electron'
import path from 'node:path'
import type { IslandMode } from '../shared/types'

/** CSS pixel size of the visible island in each state. */
export const PILL = { width: 188, height: 32 }
export const TOAST = { width: 432, height: 96 }
/** The toast grows with the cards it holds, within these bounds. */
const TOAST_MIN_HEIGHT = 84
const TOAST_MAX_HEIGHT = 330
export const PANEL = { width: 486, height: 336 }
/** The panel hugs its content between these; past the max the body scrolls. */
export const PANEL_MIN_HEIGHT = 208
export const PANEL_MAX_HEIGHT = 430

/** The island floats below the top edge; matches --island-gap in styles.css. */
const ISLAND_GAP = 8

/** Window is larger than the island so the drop shadow is never clipped. */
const WINDOW_COLLAPSED = { width: 236, height: 56 }
const WINDOW_TOAST = { width: 520, height: 200 }
/** Room below the toast for its drop shadow. */
const TOAST_WINDOW_PAD = 60
const WINDOW_EXPANDED = { width: 574, height: 424 }
/** Room above and below the panel for its shadow. */
const PANEL_WINDOW_PAD = 88

const ISLAND_SIZE = { pill: PILL, toast: TOAST, panel: PANEL }
const WINDOW_SIZE = { pill: WINDOW_COLLAPSED, toast: WINDOW_TOAST, panel: WINDOW_EXPANDED }

const HIT_PAD = 1

const DEBUG = process.env['NOTCH_DEBUG'] === '1'
function debug(...args: unknown[]): void {
  if (DEBUG) console.log('[island]', ...args)
}

interface IslandOptions {
  preload: string
  rendererUrl: string | null
  rendererFile: string
  displayId: number | null
  onHover: (inside: boolean) => void
  onForceCollapse: () => void
}

export class Island {
  readonly window: BrowserWindow
  private mode: IslandMode = 'pill'
  private inside = false
  private monitor: NodeJS.Timeout | null = null
  private displayId: number | null
  private destroyed = false
  private userTyping = false
  private busyUntil = 0
  private heldOpen = false
  private outsideSince: number | null = null
  private lastHoverSent = 0
  private toastHeight = TOAST.height
  private panelHeight = PANEL.height
  private covered = false
  /** The user opened the panel over a fullscreen app; respected until it closes. */
  private userOverride = false

  constructor(private options: IslandOptions) {
    this.displayId = options.displayId

    this.window = new BrowserWindow({
      width: WINDOW_COLLAPSED.width,
      height: WINDOW_COLLAPSED.height,
      show: false,
      // A tool window stays out of the taskbar and Alt+Tab on Windows: the
      // notch has to behave like an overlay, not like a running app.
      type: 'toolbar',
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      thickFrame: false,
      paintWhenInitiallyHidden: true,
      title: 'Notcha',
      webPreferences: {
        preload: options.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
        backgroundThrottling: false,
        devTools: !process.env['NOTCH_NO_DEVTOOLS']
      }
    })

    this.window.setAlwaysOnTop(true, 'screen-saver')
    this.window.setMenuBarVisibility(false)
    this.window.setIgnoreMouseEvents(true, { forward: true })

    this.place()

    if (options.rendererUrl) {
      void this.window.loadURL(options.rendererUrl)
    } else {
      void this.window.loadFile(path.join(options.rendererFile))
    }

    this.window.once('ready-to-show', () => this.reveal())

    this.window.webContents.on('render-process-gone', () => {
      // Reloading is safer than leaving an invisible window behind.
      if (!this.destroyed) this.window.reload()
    })
    this.window.webContents.on('did-finish-load', () => {
      // A non-focusable window does not always emit `ready-to-show` on Windows.
      this.reveal()
    })

    screen.on('display-metrics-changed', this.handleDisplayChange)
    screen.on('display-added', this.handleDisplayChange)
    screen.on('display-removed', this.handleDisplayChange)

    this.monitor = setInterval(() => this.tick(), 50)
  }

  private reveal(): void {
    if (this.destroyed || this.covered) return
    // Hiding drops the window out of the topmost band, so the level is
    // re-asserted every time it comes back into view.
    this.window.setAlwaysOnTop(true, 'screen-saver')
    if (!this.window.isVisible()) this.window.showInactive()
    this.window.moveTop()
    // A notification button has to answer on the first click without stealing
    // keyboard focus from whatever the user is doing, so the window is made
    // non-activating once it is on screen. It is created activating because a
    // non-focusable window is not reliably shown on Windows.
    this.applyFocusable()
  }

  private applyFocusable(): void {
    if (this.destroyed) return
    // Only a focused text field may take the keyboard. The pill, the toast and a
    // panel nobody is typing in stay non-activating, so interacting with the
    // notch never brings the app forward.
    this.window.setFocusable(this.userTyping)
  }

  private handleDisplayChange = (): void => {
    if (!this.destroyed) this.place()
  }

  setDisplay(displayId: number | null): void {
    this.displayId = displayId
    this.place()
  }

  private currentDisplay(): Display {
    if (this.displayId !== null) {
      const match = screen.getAllDisplays().find((display) => display.id === this.displayId)
      if (match) return match
    }
    return screen.getPrimaryDisplay()
  }

  /** The visible island box for the current mode; the toast is content-sized. */
  private islandSize(): { width: number; height: number } {
    if (this.mode === 'toast') return { width: TOAST.width, height: this.toastHeight }
    if (this.mode === 'panel') return { width: PANEL.width, height: this.panelHeight }
    return ISLAND_SIZE[this.mode]
  }

  private windowSize(): { width: number; height: number } {
    const base = WINDOW_SIZE[this.mode]
    if (this.mode === 'panel') {
      return { width: base.width, height: this.panelHeight + PANEL_WINDOW_PAD }
    }
    if (this.mode !== 'toast') return base
    return { width: base.width, height: this.toastHeight + TOAST_WINDOW_PAD }
  }

  /**
   * The renderer measures its own cards, so one notification takes only the room
   * it needs and a stack of them claims the space back.
   */
  /** No dead glass: the panel is exactly as tall as its contents measured. */
  setPanelHeight(height: number): void {
    if (!Number.isFinite(height)) return
    const next = Math.round(Math.min(PANEL_MAX_HEIGHT, Math.max(PANEL_MIN_HEIGHT, height)))
    if (next === this.panelHeight) return
    this.panelHeight = next
    debug('panel height', next)
    if (this.mode === 'panel') this.place()
  }

  setToastHeight(height: number): void {
    if (!Number.isFinite(height)) return
    const next = Math.round(Math.min(TOAST_MAX_HEIGHT, Math.max(TOAST_MIN_HEIGHT, height)))
    if (next === this.toastHeight) return
    this.toastHeight = next
    if (this.mode === 'toast') this.place()
  }

  private place(): void {
    if (this.destroyed) return
    const display = this.currentDisplay()
    const size = this.windowSize()
    const x = Math.round(display.bounds.x + (display.bounds.width - size.width) / 2)
    const y = Math.round(display.workArea.y)
    const bounds = this.window.getBounds()
    if (bounds.x === x && bounds.y === y && bounds.width === size.width && bounds.height === size.height) {
      return
    }
    this.window.setBounds({ x, y, width: size.width, height: size.height }, false)
  }

  setMode(mode: IslandMode): void {
    if (this.destroyed || this.mode === mode) return
    debug('setMode', mode)
    this.mode = mode
    // A user-opened panel over a fullscreen app is respected until it closes.
    if (mode === 'pill') this.userOverride = false
    this.outsideSince = null
    this.place()
    if (mode === 'panel') {
      this.window.moveTop()
    } else if (this.window.isFocused()) {
      // Collapsing gives the keyboard back to whatever the user was doing.
      this.window.blur()
    }
    this.window.setSkipTaskbar(true)
    this.applyFocusable()
  }

  /**
   * A fullscreen video or game owns the screen: the notch steps out of the way
   * entirely and comes back when fullscreen ends. Anything the user was doing in
   * the panel is collapsed first, so it reopens as a pill rather than a stale
   * panel over the video.
   */
  setCovered(covered: boolean): void {
    if (this.destroyed) return
    const next = Boolean(covered)
    if (next && this.userOverride) return
    if (next === this.covered) return
    this.covered = next
    debug('covered', next)
    if (next) {
      this.inside = false
      this.userTyping = false
      this.heldOpen = false
      this.busyUntil = 0
      if (this.mode !== 'pill') {
        this.mode = 'pill'
        this.place()
        this.options.onForceCollapse()
      }
      this.window.hide()
      return
    }
    this.reveal()
  }

  get isCovered(): boolean {
    return this.covered
  }

  setExpanded(expanded: boolean): void {
    this.setMode(expanded ? 'panel' : 'pill')
  }

  get expanded(): boolean {
    return this.mode === 'panel'
  }

  /** A deliberate click inside the panel: activate so text fields can be typed into. */
  activate(): void {
    if (this.destroyed) return
    this.window.setSkipTaskbar(true)
    this.window.setFocusable(true)
    this.window.showInactive()
    this.window.focus()
  }

  setUserTyping(typing: boolean): void {
    this.userTyping = typing
    if (typing) this.outsideSince = null
    if (this.destroyed) return
    this.window.setFocusable(Boolean(typing))
    if (typing) this.window.focus()
  }

  /**
   * A long-running renderer action (an assistant reply) keeps the panel open while
   * it works. Capped so a crashed renderer can never hold the panel forever.
   */
  /**
   * The welcome tour is the one panel the renderer owns for a while: it must stay
   * open even though the pointer is nowhere near the notch.
   */
  setHeldOpen(open: boolean): void {
    this.heldOpen = open
    if (open) this.outsideSince = null
  }

  setBusy(busy: boolean): void {
    this.busyUntil = busy ? Date.now() + 5 * 60_000 : 0
    if (busy) this.outsideSince = null
  }

  focusPanel(): void {
    if (this.destroyed) return
    // An explicit request outranks a fullscreen app until the panel closes.
    this.userOverride = true
    this.covered = false
    this.setExpanded(true)
    this.window.showInactive()
    this.window.focus()
  }

  private tick(): void {
    if (this.destroyed || this.covered || !this.window.isVisible()) return
    const size = this.islandSize()
    const windowBounds = this.windowSize()
    const bounds = this.window.getBounds()
    const point = screen.getCursorScreenPoint()

    const left = bounds.x + (windowBounds.width - size.width) / 2
    const top = bounds.y + ISLAND_GAP
    const inside =
      point.x >= left - HIT_PAD &&
      point.x <= left + size.width + HIT_PAD &&
      point.y >= top - HIT_PAD &&
      point.y <= top + size.height + HIT_PAD

    if (inside !== this.inside) {
      this.inside = inside
      this.lastHoverSent = Date.now()
      debug(
        'hover',
        inside,
        'expanded',
        this.mode,
        'point',
        point.x,
        point.y,
        'bounds',
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
        'left',
        left,
        'top',
        top,
        'size',
        size.width,
        size.height
      )
      this.window.setIgnoreMouseEvents(!inside, { forward: true })
      this.options.onHover(inside)
      if (inside) this.window.moveTop()
    } else if (Date.now() - this.lastHoverSent > 1500) {
      // Re-assert the cursor state so a stale renderer flag can recover.
      this.lastHoverSent = Date.now()
      this.options.onHover(inside)
    }

    // Safety net: if the pointer stays away and nobody is typing, the panel must
    // not stay open because of a stuck renderer flag.
    if (inside) {
      this.outsideSince = null
    } else {
      if (this.outsideSince === null) this.outsideSince = Date.now()
      const away = Date.now() - this.outsideSince
      if (this.userTyping && away > 6000) {
        // While the pointer is outside the window is click-through, so a focused
        // text field can never receive its blur event. A long idle stretch with
        // no pointer inside means nobody is typing: stop blocking the collapse.
        debug('typing stale, clearing')
        this.userTyping = false
      }
      const busy = Date.now() < this.busyUntil
      if (this.expanded && !this.userTyping && !busy && !this.heldOpen && away > 4000) {
        this.outsideSince = null
        debug('force collapse (pointer away)')
        this.mode = 'pill'
        this.place()
        this.options.onForceCollapse()
      }
    }
  }

  send(channel: string, payload?: unknown): void {
    if (this.destroyed) return
    if (this.window.webContents.isDestroyed()) return
    this.window.webContents.send(channel, payload)
  }

  dispose(): void {
    this.destroyed = true
    if (this.monitor) clearInterval(this.monitor)
    this.monitor = null
    screen.removeListener('display-metrics-changed', this.handleDisplayChange)
    screen.removeListener('display-added', this.handleDisplayChange)
    screen.removeListener('display-removed', this.handleDisplayChange)
    if (!this.window.isDestroyed()) this.window.destroy()
  }
}
