import { randomUUID } from 'node:crypto'
import { existsSync, promises as fs, renameSync } from 'node:fs'
import path from 'node:path'
import { app, clipboard, dialog, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron'
import { Bridge } from './bridge'
import { Island } from './island'
import { Store } from './store'
import { GoogleService } from './services/google'
import { AgentService } from './services/agent'
import { AgentLink } from './services/link'
import { Notifier } from './notifier'
import { LyricsService } from './services/lyrics'
import { WeatherService } from './services/weather'
import { checkForUpdates } from './services/updates'
import { convertFile, convertMany, planFor, planForMany } from './services/convert'
import { addUsage, isTrackedApp, samplePerf, type Perf } from './stats'
import {
  DEFAULT_CAPABILITIES,
  EMPTY_MEDIA,
  EMPTY_SYSTEM,
  type AgentTurn,
  type AppState,
  type IslandMode,
  type Bootstrap,
  type Capabilities,
  type MediaState,
  type Settings,
  type SystemState,
  type TabId,
  type UsageDay
} from '../shared/types'

app.setName('Notcha')
// The app used to be called Notch; keep its settings, tasks and bridge token.
const appDataDir = app.getPath('appData')
const legacyDir = path.join(appDataDir, 'Notch')
const currentDir = path.join(appDataDir, 'Notcha')
if (!existsSync(currentDir) && existsSync(legacyDir)) {
  try {
    renameSync(legacyDir, currentDir)
  } catch {
    /* fall back to a fresh profile */
  }
}
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-renderer-backgrounding')

let store: Store
let island: Island
let bridge: Bridge
let google: GoogleService
let agent: AgentService
let link: AgentLink
let notifier: Notifier
let lyrics: LyricsService
let weather: WeatherService
let tray: Tray | null = null

let media: MediaState = { ...EMPTY_MEDIA }
let system: SystemState = { ...EMPTY_SYSTEM }
let capabilities: Capabilities = { ...DEFAULT_CAPABILITIES }
let quitting = false
let perf: Perf = { cpu: 0, ram: 0, disk: null }
let lastClipboard = ''
let perfTimer: NodeJS.Timeout | null = null
let usageTimer: NodeJS.Timeout | null = null
let clipboardTimer: NodeJS.Timeout | null = null

const agentStreams = new Map<string, AbortController>()

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.slice(0, 120))
    .slice(0, 8)
}

function toMediaState(raw: Record<string, unknown> | null | undefined): MediaState {
  if (!raw || raw['active'] !== true) return { ...EMPTY_MEDIA }
  const status = String(raw['status'] ?? 'paused')
  const normalised: MediaState['status'] =
    status === 'playing' || status === 'paused' || status === 'stopped' ? status : 'paused'
  return {
    active: true,
    appId: String(raw['appId'] ?? ''),
    appName: String(raw['appName'] ?? 'Media'),
    title: String(raw['title'] ?? ''),
    artist: String(raw['artist'] ?? ''),
    album: String(raw['album'] ?? ''),
    status: normalised,
    position: Math.max(0, Number(raw['position']) || 0),
    duration: Math.max(0, Number(raw['duration']) || 0),
    artwork: typeof raw['artwork'] === 'string' && raw['artwork'].length > 32 ? raw['artwork'] : null,
    trackKey: String(raw['trackKey'] ?? ''),
    sampledAt: Number(raw['sampledAt']) || Date.now(),
    canNext: Boolean(raw['canNext']),
    canPrev: Boolean(raw['canPrev']),
    canSeek: Boolean(raw['canSeek'])
  }
}

function toSystemState(raw: Record<string, unknown>): SystemState {
  const volumeRaw = raw['volume']
  const brightnessRaw = raw['brightness']
  const monitorDevices = store?.settings.privacy.monitorDevices !== false
  return {
    volume: typeof volumeRaw === 'number' ? Math.round(volumeRaw) : null,
    muted: Boolean(raw['muted']),
    brightness: typeof brightnessRaw === 'number' ? Math.round(brightnessRaw) : null,
    capsLock: Boolean(raw['capsLock']),
    online: raw['online'] !== false,
    networkName: typeof raw['networkName'] === 'string' ? raw['networkName'] : null,
    micActive: monitorDevices && Boolean(raw['micActive']),
    micApps: monitorDevices ? toStringArray(raw['micApps']) : [],
    cameraActive: monitorDevices && Boolean(raw['cameraActive']),
    cameraApps: monitorDevices ? toStringArray(raw['cameraApps']) : [],
    cpu: perf.cpu,
    ram: perf.ram,
    disk: perf.disk,
    foreground: typeof raw['foreground'] === 'string' ? String(raw['foreground']).slice(0, 80) : null
  }
}

function pushCapabilities(): void {
  island?.send('capabilities:update', capabilities)
}

function pushHome(): void {
  if (!store) return
  island?.send('home:update', { usage: store.state.usage, clipboard: store.state.clipboard })
}

/** Screen time is sampled on a wall clock, not per animation frame. */
const USAGE_TICK_MS = 10_000

function recordUsageTick(): void {
  if (!store) return
  if (!isTrackedApp(system.foreground)) return
  const usage: UsageDay = addUsage(store.state.usage, system.foreground, USAGE_TICK_MS / 1000)
  store.patchState({ usage })
  pushHome()
}

async function pollClipboard(): Promise<void> {
  if (!store) return
  let text = ''
  try {
    text = await clipboard.readText()
  } catch {
    return
  }
  if (!text || text === lastClipboard) return
  lastClipboard = text
  const trimmed = text.trim()
  if (!trimmed) return
  const entry = { id: randomUUID(), text: trimmed.slice(0, 280), at: Date.now() }
  const next = [entry, ...store.state.clipboard.filter((item) => item.text !== entry.text)].slice(0, 6)
  store.patchState({ clipboard: next })
  pushHome()
}

function startHomeStats(): void {
  perf = samplePerf()
  if (perfTimer) clearInterval(perfTimer)
  perfTimer = setInterval(() => {
    perf = samplePerf()
    system = { ...system, cpu: perf.cpu, ram: perf.ram, disk: perf.disk }
    island?.send('system:update', system)
  }, 3000)

  if (usageTimer) clearInterval(usageTimer)
  usageTimer = setInterval(recordUsageTick, USAGE_TICK_MS)

  if (clipboardTimer) clearInterval(clipboardTimer)
  clipboardTimer = setInterval(() => void pollClipboard(), 2000)
}

function createBridge(): void {
  const scriptPath = app.isPackaged
    ? path.join(process.resourcesPath, 'bridge.ps1')
    : path.join(app.getAppPath(), 'resources', 'bridge.ps1')

  bridge = new Bridge(scriptPath, {
    onReady: (info) => {
      capabilities = {
        ...capabilities,
        bridge: 'ready',
        bridgeMessage: undefined,
        media: true,
        volume: info.audio,
        devices: true
      }
      pushCapabilities()
    },
    onSystem: (raw) => {
      system = toSystemState(raw)
      // A fullscreen video or game covers the screen, so the notch gets out of
      // the way until it ends.
      island?.setCovered(raw['fullscreen'] === true)
      if (system.brightness !== null && !capabilities.brightness) {
        capabilities = { ...capabilities, brightness: true }
        pushCapabilities()
      }
      island?.send('system:update', system)
    },
    onMedia: (raw) => {
      media = toMediaState(raw)
      island?.send('media:update', media)
    },
    onError: (message) => {
      capabilities = {
        ...capabilities,
        bridge: capabilities.bridge === 'ready' ? 'ready' : 'failed',
        bridgeMessage: message
      }
      pushCapabilities()
    }
  })
  bridge.start()
}

function applyLoginItem(enabled: boolean): void {
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({ openAtLogin: enabled })
  } catch (error) {
    console.warn('[main] could not update login item', error)
  }
}

async function addShelfPaths(paths: string[]): Promise<AppState> {
  const next = [...store.state.shelf]
  for (const raw of paths.slice(0, 25)) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    if (next.length >= 60) break
    const resolved = path.resolve(raw)
    if (next.some((item) => item.path.toLowerCase() === resolved.toLowerCase())) continue
    let kind: 'file' | 'folder' = 'file'
    try {
      const stat = await fs.stat(resolved)
      if (!stat.isFile() && !stat.isDirectory()) continue
      kind = stat.isDirectory() ? 'folder' : 'file'
    } catch {
      continue
    }
    next.push({
      id: randomUUID(),
      path: resolved,
      name: path.basename(resolved) || resolved,
      kind,
      addedAt: Date.now()
    })
  }
  return store.patchState({ shelf: next })
}

function convertOptions(options: unknown): { quality: 'high' | 'balanced' | 'small'; maxSize: number | null } {
  const quality = (options as { quality?: unknown } | undefined)?.quality
  const maxSize = (options as { maxSize?: unknown } | undefined)?.maxSize
  return {
    quality: quality === 'high' || quality === 'small' ? quality : 'balanced',
    maxSize: typeof maxSize === 'number' ? maxSize : null
  }
}

function registerIpc(): void {
  ipcMain.handle('app:bootstrap', async (): Promise<Bootstrap> => ({
    settings: store.settings,
    state: store.state,
    media,
    system,
    capabilities,
    version: app.getVersion(),
    google: google.status(),
    agent: agent.status(),
    lyricsEnabled: store.settings.lyrics.enabled
  }))

  ipcMain.on('media:command', (_event, command: string, value?: number) => {
    if (!['playpause', 'next', 'prev', 'seek'].includes(command)) return
    if (command === 'seek') {
      const seconds = Number(value)
      if (!Number.isFinite(seconds) || seconds < 0) return
      bridge?.send({ cmd: 'seek', value: seconds })
      return
    }
    bridge?.send({ cmd: command })
  })

  ipcMain.on('window:expanded', (_event, expanded: boolean) => {
    island.setExpanded(Boolean(expanded))
  })

  ipcMain.on('window:mode', (_event, mode: IslandMode) => {
    if (mode === 'pill' || mode === 'toast' || mode === 'panel') island.setMode(mode)
  })

  ipcMain.on('notify:answer', (_event, id: string, actionId: string | null) => {
    if (typeof id === 'string') notifier?.answer(id, typeof actionId === 'string' ? actionId : null)
  })

  ipcMain.on('island:activate', () => island.activate())

  ipcMain.on('island:typing', (_event, typing: boolean) => {
    island.setUserTyping(Boolean(typing))
  })

  ipcMain.on('island:busy', (_event, busy: boolean) => {
    island.setBusy(Boolean(busy))
  })

  ipcMain.on('island:hold', (_event, open: boolean) => {
    island.setHeldOpen(Boolean(open))
  })

  ipcMain.on('island:toast-height', (_event, height: number) => {
    island.setToastHeight(Number(height))
  })

  ipcMain.on('island:panel-height', (_event, height: number) => {
    island.setPanelHeight(Number(height))
  })

  ipcMain.on('clipboard:copy', (_event, text: string) => {
    const value = typeof text === 'string' ? text : ''
    if (!value) return
    void clipboard.writeText(value).catch(() => undefined)
    lastClipboard = value
    const entry = store.state.clipboard.find((item) => item.text === value)
    if (entry) {
      const rest = store.state.clipboard.filter((item) => item.id !== entry.id)
      store.patchState({ clipboard: [{ ...entry, at: Date.now() }, ...rest] })
      pushHome()
    }
  })

  ipcMain.handle('settings:get', async (): Promise<Settings> => store.settings)

  ipcMain.handle('settings:update', async (_event, patch: Partial<Settings>): Promise<Settings> => {
    const before = store.settings
    const updated = store.patchSettings(patch ?? {})

    if (before.general.startAtLogin !== updated.general.startAtLogin) {
      applyLoginItem(updated.general.startAtLogin)
    }
    if (before.general.displayId !== updated.general.displayId) {
      island.setDisplay(updated.general.displayId)
    }
    if (
      before.weather.enabled !== updated.weather.enabled ||
      before.weather.place !== updated.weather.place ||
      before.weather.unit !== updated.weather.unit ||
      before.weather.latitude !== updated.weather.latitude ||
      before.weather.longitude !== updated.weather.longitude
    ) {
      weather.clear()
    }
    return updated
  })

  ipcMain.handle('state:update', async (_event, patch: Partial<AppState>): Promise<AppState> => {
    return store.patchState(patch ?? {})
  })

  ipcMain.handle('lyrics:get', async (_event, track: unknown) => {
    if (!store.settings.lyrics.enabled) return null
    const input = (track ?? {}) as Record<string, unknown>
    const title = String(input['title'] ?? '').slice(0, 200)
    if (!title) return null
    return lyrics.get(
      {
        title,
        artist: String(input['artist'] ?? '').slice(0, 200),
        album: String(input['album'] ?? '').slice(0, 200),
        duration: Math.max(0, Number(input['duration']) || 0)
      },
      true
    )
  })

  ipcMain.handle('weather:get', async (_event, force: boolean) => {
    const settings = store.settings
    if (!settings.weather.enabled) return null
    if (settings.weather.latitude === null || settings.weather.longitude === null) {
      if (!settings.weather.place.trim()) return null
      const matches = await weather.geocode(settings.weather.place)
      const first = matches[0]
      if (!first) return null
      store.patchSettings({
        weather: { ...settings.weather, latitude: first.latitude, longitude: first.longitude }
      })
    }
    return weather.get(store.settings, Boolean(force))
  })

  ipcMain.handle('weather:geocode', async (_event, place: string) => {
    return weather.geocode(String(place ?? ''))
  })

  ipcMain.handle('google:status', async () => google.status())
  ipcMain.handle('google:connect', async () => google.connect())
  ipcMain.handle('google:disconnect', async () => google.disconnect())
  ipcMain.handle('google:calendar', async () => google.calendar())
  ipcMain.handle('google:tasks', async () => google.tasks())
  ipcMain.handle('google:add-task', async (_event, title: string, listId?: string) => {
    const text = String(title ?? '').trim().slice(0, 300)
    if (!text) return { ok: false, error: 'Task text is empty.' }
    return google.addTask(text, typeof listId === 'string' ? listId : undefined)
  })
  ipcMain.handle('google:set-task', async (_event, listId: string, taskId: string, done: boolean) =>
    google.setTask(String(listId), String(taskId), Boolean(done))
  )
  ipcMain.handle('google:delete-task', async (_event, listId: string, taskId: string) =>
    google.deleteTask(String(listId), String(taskId))
  )

  ipcMain.handle('agent:link-send', async (_event, text: string) => {
    const value = String(text ?? '').trim().slice(0, 2000)
    if (!value) return { ok: false }
    link.push(value)
    return { ok: true, pending: link.pending }
  })

  ipcMain.handle('agent:status', async () => agent.status())
  ipcMain.handle('agent:set-channel', async (_event, channel: string) => {
    store.patchSettings({ agent: { ...store.settings.agent, channel: channel === 'api' ? 'api' : 'local' } })
    return agent.status()
  })
  ipcMain.handle('agent:set-key', async (_event, key: string) => agent.setKey(String(key ?? '')))
  ipcMain.handle('agent:clear-key', async () => agent.clearKey())

  ipcMain.on('agent:send', (_event, requestId: string, turns: AgentTurn[], context: string) => {
    if (typeof requestId !== 'string' || !Array.isArray(turns)) return
    const controller = new AbortController()
    agentStreams.set(requestId, controller)

    const safeTurns = turns
      .filter((turn) => turn && (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string')
      .slice(-16)
      .map((turn) => ({ role: turn.role, content: turn.content.slice(0, 4000) }))

    agent
      .stream(safeTurns, String(context ?? '').slice(0, 2000), (text) => {
        island?.send('agent:delta', { requestId, text })
      }, controller.signal)
      .then((text) => {
        island?.send('agent:done', { requestId, text })
      })
      .catch((error: unknown) => {
        const aborted = controller.signal.aborted
        const message = aborted ? 'Stopped.' : ((error as Error).message ?? 'The request failed.')
        island?.send('agent:error', { requestId, message })
      })
      .finally(() => {
        agentStreams.delete(requestId)
      })
  })

  ipcMain.on('agent:cancel', (_event, requestId: string) => {
    agentStreams.get(String(requestId))?.abort()
  })

  ipcMain.handle('shelf:add', async (): Promise<AppState> => {
    const result = await dialog.showOpenDialog({
      title: 'Add to your shelf',
      properties: ['openFile', 'multiSelections'],
      buttonLabel: 'Add'
    })
    if (result.canceled) return store.state
    return addShelfPaths(result.filePaths)
  })

  ipcMain.handle('shelf:add-paths', async (_event, paths: string[]): Promise<AppState> => {
    if (!Array.isArray(paths)) return store.state
    return addShelfPaths(paths)
  })

  ipcMain.handle('shelf:remove', async (_event, id: string): Promise<AppState> => {
    return store.patchState({ shelf: store.state.shelf.filter((item) => item.id !== id) })
  })

  ipcMain.on('shelf:open', (_event, target: string) => {
    if (typeof target === 'string') void shell.openPath(target)
  })

  ipcMain.on('shelf:reveal', (_event, target: string) => {
    if (typeof target === 'string') shell.showItemInFolder(target)
  })

  // Local conversion: the renderer asks what a file can become, then runs it.
  ipcMain.handle('convert:plan', async (_event, target: string) => {
    if (typeof target !== 'string' || !target.trim()) return { kind: 'unknown' as const, targets: [] }
    return planFor(target)
  })

  ipcMain.handle('convert:plan-many', async (_event, paths: string[]) => {
    if (!Array.isArray(paths)) return { kind: 'unknown' as const, targets: [] }
    return planForMany(paths.filter((entry): entry is string => typeof entry === 'string'))
  })

  ipcMain.handle('convert:batch', async (_event, paths: string[], format: string, options?: unknown) => {
    if (!Array.isArray(paths) || typeof format !== 'string') {
      return [{ path: '', ok: false, output: null, error: 'Invalid request.' }]
    }
    const list = paths.filter((entry): entry is string => typeof entry === 'string')
    return convertMany(list, format, convertOptions(options))
  })

  ipcMain.handle('convert:run', async (_event, target: string, format: string, options?: unknown) => {
    if (typeof target !== 'string' || typeof format !== 'string') {
      return { ok: false, output: null, error: 'Invalid request.' }
    }
    return convertFile(target, format, convertOptions(options))
  })

  ipcMain.handle('updates:check', async () => {
    return checkForUpdates(app.getVersion(), store.settings.updates.feedUrl)
  })

  ipcMain.handle('app:displays', async () => {
    const primary = screen.getPrimaryDisplay()
    return screen.getAllDisplays().map((display, index) => ({
      id: display.id,
      label:
        (display.label && display.label.replace(/\s+/g, ' ').trim()) || `Display ${index + 1}`,
      primary: display.id === primary.id
    }))
  })

  ipcMain.on('app:open-external', (_event, url: string) => {
    if (typeof url !== 'string') return
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') void shell.openExternal(url)
    } catch {
      /* ignore invalid urls */
    }
  })

  ipcMain.on('app:quit', () => void quit())
  ipcMain.on('app:hide-panel', () => island.setExpanded(false))
}

function createTray(): void {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'tray.png')
    : path.join(app.getAppPath(), 'resources', 'tray.png')

  let image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) image = nativeImage.createEmpty()
  if (process.platform === 'win32') image = image.resize({ width: 16, height: 16 })

  tray = new Tray(image)
  tray.setToolTip('Notcha')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open Notcha',
        click: () => {
          island.focusPanel()
          island.send('view:open', 'media')
        }
      },
      {
        label: 'Settings',
        click: () => {
          island.focusPanel()
          island.send('view:open', 'settings')
        }
      },
      { type: 'separator' },
      { label: `Version ${app.getVersion()}`, enabled: false },
      { type: 'separator' },
      { label: 'Quit Notcha', click: () => void quit() }
    ])
  )
  tray.on('click', () => {
    island.focusPanel()
    island.send('view:open', 'media')
  })
}

async function quit(): Promise<void> {
  if (quitting) return
  quitting = true
  for (const controller of agentStreams.values()) controller.abort()
  agentStreams.clear()
  void notifier?.stop()
  try {
    await store?.flush()
  } catch {
    /* ignore */
  }
  bridge?.dispose()
  island?.dispose()
  tray?.destroy()
  tray = null
  app.quit()
}

async function bootstrap(): Promise<void> {
  const userData = app.getPath('userData')
  await fs.mkdir(userData, { recursive: true })

  store = new Store(userData)
  await store.load()

  lyrics = new LyricsService(path.join(userData, 'lyrics'))
  weather = new WeatherService()
  google = new GoogleService(path.join(userData, 'google-tokens.bin'), () => store.settings.google.clientId)
  await google.init()
  agent = new AgentService(path.join(userData, 'agent-key.bin'), () => ({
    model: store.settings.agent.model,
    baseUrl: store.settings.agent.baseUrl,
    channel: store.settings.agent.channel === 'api' ? 'api' : 'local'
  }))
  await agent.init()

  link = new AgentLink(path.join(userData, 'agent-inbox.json'))
  await link.init()

  notifier = new Notifier(
    {
      onShow: (notification) => island?.send('notify:show', notification),
      onClose: (id) => island?.send('notify:close', id),
      agentInbox: (after, waitMs) => link.wait(after, waitMs),
      agentReply: (text) => island?.send('agent:link-reply', { text, at: Date.now() })
    },
    path.join(userData, 'agent-bridge.json')
  )
  await notifier.start().catch((error) => {
    console.warn('[notifier] could not start the local notification bridge', error)
  })

  island = new Island({
    preload: path.join(__dirname, '../preload/index.js'),
    rendererUrl: process.env['ELECTRON_RENDERER_URL'] ?? null,
    rendererFile: path.join(__dirname, '../renderer/index.html'),
    displayId: store.settings.general.displayId,
    onHover: (inside) => island.send('hover:inside', inside),
    onForceCollapse: () => island.send('island:force-collapse')
  })

  registerIpc()
  createBridge()
  startHomeStats()
  createTray()
  applyLoginItem(store.settings.general.startAtLogin)

  Menu.setApplicationMenu(null)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    island?.focusPanel()
  })

  app.whenReady().then(bootstrap).catch((error) => {
    console.error('[main] failed to start', error)
    dialog.showErrorBox('Notcha could not start', String(error))
    app.quit()
  })

  app.on('window-all-closed', () => {
    // The tray keeps the app alive; the overlay is the only window.
  })

  app.on('before-quit', () => {
    if (quitting) return
    quitting = true
    bridge?.dispose()
    island?.dispose()
    tray?.destroy()
    tray = null
  })

  app.on('activate', () => {
    island?.setExpanded(true)
  })
}

export type { TabId }
