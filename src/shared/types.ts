import { DEFAULT_THEME } from './themes'

export type TabId = 'home' | 'media' | 'calendar' | 'focus' | 'water' | 'tasks' | 'shelf' | 'agent'
export type ViewId = TabId | 'settings'
export type PlaybackStatus = 'playing' | 'paused' | 'stopped' | 'none'

export interface MediaState {
  active: boolean
  appId: string
  appName: string
  title: string
  artist: string
  album: string
  status: PlaybackStatus
  position: number
  duration: number
  artwork: string | null
  trackKey: string
  sampledAt: number
  canNext: boolean
  canPrev: boolean
  canSeek: boolean
}

export interface SystemState {
  volume: number | null
  muted: boolean
  brightness: number | null
  capsLock: boolean
  online: boolean
  networkName: string | null
  micActive: boolean
  micApps: string[]
  cameraActive: boolean
  cameraApps: string[]
  /** Percentages sampled by the main process, independent of the PowerShell bridge. */
  cpu: number | null
  ram: number | null
  disk: number | null
  /** Name of the process owning the foreground window, when the bridge can see it. */
  foreground: string | null
}

export interface Capabilities {
  media: boolean
  volume: boolean
  brightness: boolean
  devices: boolean
  bridge: 'starting' | 'ready' | 'failed'
  bridgeMessage?: string
}

export interface Settings {
  general: {
    showSeconds: boolean
    hoverExpand: boolean
    startAtLogin: boolean
    displayId: number | null
    welcomeSeen: boolean
  }
  lyrics: { enabled: boolean }
  weather: {
    enabled: boolean
    place: string
    latitude: number | null
    longitude: number | null
    unit: 'c' | 'f'
  }
  google: { clientId: string }
  agent: { model: string; baseUrl: string; channel: AgentChannel }
  updates: { enabled: boolean; feedUrl: string }
  focus: {
    workMinutes: number
    breakMinutes: number
    longBreakMinutes: number
    sessionsUntilLongBreak: number
    autoContinue: boolean
  }
  water: {
    goal: number
    intervalMinutes: number
    remindersEnabled: boolean
    startHour: number
    endHour: number
  }
  privacy: { monitorDevices: boolean }
  /** One spring drives the chip, the notch height and the rail icons. */
  spring: { stiffness: number; damping: number }
}

export interface UsageApp {
  name: string
  seconds: number
}

/** Screen time for one day, kept in local time. */
export interface UsageDay {
  day: string
  total: number
  apps: UsageApp[]
  /** Seconds per hour of the day, 0-23. */
  hours: number[]
}

export interface ClipboardEntry {
  id: string
  text: string
  at: number
}

export interface Task {
  id: string
  text: string
  done: boolean
  createdAt: number
  due: string | null
}

export interface ShelfItem {
  id: string
  path: string
  name: string
  kind: 'file' | 'folder'
  addedAt: number
}

export type ConvertKind = 'image' | 'audio' | 'video' | 'unknown'

export interface ConvertTarget {
  /** Stable id, which is also the output extension. */
  id: string
  label: string
}

export type ConvertQuality = 'high' | 'balanced' | 'small'

export interface ConvertOptions {
  quality: ConvertQuality
  /** Longest side in pixels, or null to keep the original size. */
  maxSize: number | null
}

export interface ConvertPlan {
  kind: ConvertKind
  targets: ConvertTarget[]
}

export interface ConvertResult {
  ok: boolean
  output: string | null
  error: string | null
}

export interface ConvertItemResult extends ConvertResult {
  path: string
}

export type FocusMode = 'work' | 'break' | 'long'

export interface FocusState {
  mode: FocusMode
  running: boolean
  /** epoch ms when the current phase ends; null when idle */
  endsAt: number | null
  /** remaining ms when paused */
  remainingMs: number
  completed: number
  day: string
}

export interface WaterState {
  day: string
  count: number
  lastReminderAt: number
}

/** Everything the cat and the shop remember. */
export interface MotivationState {
  /** Day key (YYYY-MM-DD) to tasks completed that day. */
  days: Record<string, number>
  /** Task ids that already paid out a treat, so unticking cannot farm them. */
  credited: string[]
  /** Treats eaten over the cat's whole life; this is its experience. */
  treats: number
  /** Spendable currency, earned when the cat levels up. */
  paws: number
  /** Best streak ever reached. */
  best: number
}

export interface ThemeState {
  owned: string[]
  active: string
}

export interface AppState {
  tasks: Task[]
  shelf: ShelfItem[]
  usage: UsageDay
  clipboard: ClipboardEntry[]
  focus: FocusState
  water: WaterState
  motivation: MotivationState
  themes: ThemeState
  lastTab: TabId
}

export interface Bootstrap {
  settings: Settings
  state: AppState
  media: MediaState
  system: SystemState
  capabilities: Capabilities
  version: string
  google: GoogleStatus
  agent: AgentStatus
  lyricsEnabled: boolean
}

export interface WeatherNow {
  place: string
  temperature: number
  unit: 'C' | 'F'
  code: number
  isDay: boolean
  high: number
  low: number
  humidity: number
  wind: number
  updatedAt: number
}

export interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  location: string | null
  calendarName: string
  color: string | null
}

export interface GoogleTask {
  id: string
  listId: string
  listTitle: string
  title: string
  notes: string | null
  done: boolean
  due: string | null
}

export type AgentChannel = 'local' | 'api'

export interface AgentStatus {
  hasKey: boolean
  channel: AgentChannel
  model: string
  baseUrl: string
  error: string | null
}

export interface AgentLinkReply {
  text: string
  at: number
}

export interface AgentTurn {
  role: 'user' | 'assistant'
  content: string
}

export type NotifyKind = 'info' | 'success' | 'warning' | 'timer' | 'agent' | 'question' | 'permission'

export interface NotifyAction {
  id: string
  label: string
  style?: 'primary' | 'default' | 'danger'
}

export interface NotchNotification {
  id: string
  kind: NotifyKind
  title: string
  detail: string | null
  source: string | null
  actions: NotifyAction[]
  createdAt: number
  /** 0 keeps the card until it is answered or dismissed. */
  timeoutMs: number
}

export type IslandMode = 'pill' | 'toast' | 'panel'

export interface AgentStreamEvent {
  requestId: string
  text: string
}

export interface GoogleStatus {
  configured: boolean
  connected: boolean
  email: string | null
  error: string | null
}

export interface LyricLine {
  time: number
  text: string
}

export interface LyricsPayload {
  synced: boolean
  lines: LyricLine[]
  plain: string | null
  instrumental: boolean
  source: string
  trackName: string
  artistName: string
}

export interface UpdateResult {
  checkedAt: number
  current: string
  latest: string | null
  available: boolean
  notes: string | null
  url: string | null
  error: string | null
}

export interface IslandRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DisplayInfo {
  id: number
  label: string
  primary: boolean
}

export interface IslandApi {
  bootstrap(): Promise<Bootstrap>
  media(command: 'playpause' | 'next' | 'prev' | 'seek', value?: number): void
  setExpanded(expanded: boolean): void
  setMode(mode: IslandMode): void
  setTyping(typing: boolean): void
  activate(): void
  setBusy(busy: boolean): void
  setHold(open: boolean): void
  setToastHeight(height: number): void
  /** The panel hugs its content; the shell resizes to whatever the renderer
   *  measured, clamped to the notch's min/max height. */
  setPanelHeight(height: number): void
  reportIsland(rect: IslandRect): void
  updateSettings(patch: Partial<Settings>): Promise<Settings>
  updateState(patch: Partial<AppState>): Promise<AppState>
  getSettings(): Promise<Settings>
  lyrics(track: {
    title: string
    artist: string
    album: string
    duration: number
  }): Promise<LyricsPayload | null>
  weather(force?: boolean): Promise<WeatherNow | null>
  geocode(place: string): Promise<{ name: string; latitude: number; longitude: number }[]>
  googleStatus(): Promise<GoogleStatus>
  googleConnect(): Promise<GoogleStatus>
  googleDisconnect(): Promise<GoogleStatus>
  calendar(): Promise<{ events: CalendarEvent[]; error: string | null }>
  googleTasks(): Promise<{ tasks: GoogleTask[]; lists: { id: string; title: string }[]; error: string | null }>
  googleAddTask(title: string, listId?: string): Promise<{ ok: boolean; error: string | null }>
  googleSetTask(listId: string, taskId: string, done: boolean): Promise<{ ok: boolean; error: string | null }>
  googleDeleteTask(listId: string, taskId: string): Promise<{ ok: boolean; error: string | null }>
  agentStatus(): Promise<AgentStatus>
  agentSetKey(key: string): Promise<AgentStatus>
  agentSetChannel(channel: AgentChannel): Promise<AgentStatus>
  agentClearKey(): Promise<AgentStatus>
  agentSend(requestId: string, turns: AgentTurn[], context: string): void
  agentLinkSend(text: string): Promise<{ ok: boolean; pending?: number }>
  agentCancel(requestId: string): void
  notifyAnswer(id: string, actionId: string | null): void
  shelfAdd(): Promise<AppState>
  shelfAddPaths(paths: string[]): Promise<AppState>
  shelfRemove(id: string): Promise<AppState>
  shelfOpen(path: string): void
  shelfReveal(path: string): void
  convertPlan(path: string): Promise<ConvertPlan>
  convertRun(path: string, format: string, options?: Partial<ConvertOptions>): Promise<ConvertResult>
  convertPlanMany(paths: string[]): Promise<ConvertPlan>
  convertBatch(
    paths: string[],
    format: string,
    options?: Partial<ConvertOptions>
  ): Promise<ConvertItemResult[]>
  checkUpdates(): Promise<UpdateResult>
  displays(): Promise<DisplayInfo[]>
  openExternal(url: string): void
  pathForFile(file: File): string
  quit(): void
  onMedia(listener: (media: MediaState) => void): () => void
  onSystem(listener: (system: SystemState) => void): () => void
  onCapabilities(listener: (caps: Capabilities) => void): () => void
  onHover(listener: (inside: boolean) => void): () => void
  onForceCollapse(listener: () => void): () => void
  onFocusRequest(listener: (view: string) => void): () => void
  onNotification(listener: (notification: NotchNotification) => void): () => void
  onNotificationClose(listener: (id: string) => void): () => void
  onAgentLinkReply(listener: (event: AgentLinkReply) => void): () => void
  onAgentDelta(listener: (event: AgentStreamEvent) => void): () => void
  onAgentDone(listener: (event: AgentStreamEvent) => void): () => void
  onAgentError(listener: (event: { requestId: string; message: string }) => void): () => void
  onHome(listener: (event: { usage: UsageDay; clipboard: ClipboardEntry[] }) => void): () => void
  copyText(text: string): void
}

export const DEFAULT_SETTINGS: Settings = {
  general: {
    showSeconds: false,
    hoverExpand: true,
    startAtLogin: false,
    displayId: null,
    welcomeSeen: false
  },
  lyrics: { enabled: true },
  weather: {
    enabled: false,
    place: '',
    latitude: null,
    longitude: null,
    unit: 'c'
  },
  google: { clientId: '' },
  // OpenAI-compatible endpoint. Z.ai's GLM models are the cheapest default and
  // accept any other provider when the base URL and model are changed.
  agent: { model: 'glm-4-flash', baseUrl: 'https://api.z.ai/api/paas/v4', channel: 'local' },
  updates: { enabled: false, feedUrl: '' },
  focus: {
    workMinutes: 25,
    breakMinutes: 5,
    longBreakMinutes: 15,
    sessionsUntilLongBreak: 4,
    autoContinue: false
  },
  water: {
    goal: 8,
    intervalMinutes: 45,
    remindersEnabled: false,
    startHour: 9,
    endHour: 21
  },
  privacy: { monitorDevices: true },
  // Fast enough to feel instant: settles in about 380ms at 60fps.
  spring: { stiffness: 340, damping: 24 }
}

export const EMPTY_MEDIA: MediaState = {
  active: false,
  appId: '',
  appName: '',
  title: '',
  artist: '',
  album: '',
  status: 'none',
  position: 0,
  duration: 0,
  artwork: null,
  trackKey: '',
  sampledAt: 0,
  canNext: false,
  canPrev: false,
  canSeek: false
}

export const EMPTY_SYSTEM: SystemState = {
  volume: null,
  muted: false,
  brightness: null,
  capsLock: false,
  online: true,
  networkName: null,
  micActive: false,
  micApps: [],
  cameraActive: false,
  cameraApps: [],
  cpu: null,
  ram: null,
  disk: null,
  foreground: null
}

export const DEFAULT_CAPABILITIES: Capabilities = {
  media: false,
  volume: false,
  brightness: false,
  devices: false,
  bridge: 'starting'
}

export function todayKey(date = new Date()): string {
  const y = date.getFullYear()
  const m = `${date.getMonth() + 1}`.padStart(2, '0')
  const d = `${date.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function emptyUsage(day = todayKey()): UsageDay {
  return { day, total: 0, apps: [], hours: new Array(24).fill(0) as number[] }
}

export function defaultState(): AppState {
  return {
    tasks: [],
    shelf: [],
    usage: emptyUsage(),
    clipboard: [],
    focus: {
      mode: 'work',
      running: false,
      endsAt: null,
      remainingMs: DEFAULT_SETTINGS.focus.workMinutes * 60_000,
      completed: 0,
      day: todayKey()
    },
    water: { day: todayKey(), count: 0, lastReminderAt: 0 },
    motivation: { days: {}, credited: [], treats: 0, paws: 0, best: 0 },
    themes: { owned: [DEFAULT_THEME], active: DEFAULT_THEME },
    lastTab: 'home'
  }
}
