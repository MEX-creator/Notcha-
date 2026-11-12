import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DEFAULT_SETTINGS, defaultState, type AppState, type Settings } from '../shared/types'
import { DEFAULT_THEME, THEMES } from '../shared/themes'

interface StoreShape {
  version: number
  settings: Settings
  state: AppState
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function normaliseSettings(input: Partial<Settings> | null | undefined): Settings {
  const merged = clone(DEFAULT_SETTINGS)
  if (input && typeof input === 'object') {
    for (const key of Object.keys(merged) as (keyof Settings)[]) {
      const section = input[key]
      if (section && typeof section === 'object') {
        Object.assign(merged[key] as object, section)
      }
    }
  }
  merged.general.showSeconds = Boolean(merged.general.showSeconds)
  merged.general.hoverExpand = Boolean(merged.general.hoverExpand)
  merged.general.startAtLogin = Boolean(merged.general.startAtLogin)
  merged.general.welcomeSeen = Boolean(merged.general.welcomeSeen)
  merged.general.displayId =
    typeof merged.general.displayId === 'number' && Number.isFinite(merged.general.displayId)
      ? merged.general.displayId
      : null
  merged.lyrics.enabled = Boolean(merged.lyrics.enabled)
  merged.weather.enabled = Boolean(merged.weather.enabled)
  merged.weather.place = String(merged.weather.place ?? '').slice(0, 80)
  merged.weather.unit = merged.weather.unit === 'f' ? 'f' : 'c'
  merged.google.clientId = String(merged.google.clientId ?? '').trim().slice(0, 240)
  merged.agent.model = String(merged.agent.model ?? '').trim().slice(0, 80) || DEFAULT_SETTINGS.agent.model
  merged.agent.baseUrl =
    String(merged.agent.baseUrl ?? '').trim().slice(0, 300) || DEFAULT_SETTINGS.agent.baseUrl
  merged.agent.channel = merged.agent.channel === 'api' ? 'api' : 'local'
  merged.updates.enabled = Boolean(merged.updates.enabled)
  merged.updates.feedUrl = String(merged.updates.feedUrl ?? '').trim().slice(0, 500)
  merged.focus.workMinutes = clamp(merged.focus.workMinutes, 1, 180, 25)
  merged.focus.breakMinutes = clamp(merged.focus.breakMinutes, 1, 60, 5)
  merged.focus.longBreakMinutes = clamp(merged.focus.longBreakMinutes, 1, 120, 15)
  merged.focus.sessionsUntilLongBreak = clamp(merged.focus.sessionsUntilLongBreak, 2, 12, 4)
  merged.focus.autoContinue = Boolean(merged.focus.autoContinue)
  merged.water.goal = clamp(merged.water.goal, 1, 24, 8)
  merged.water.intervalMinutes = clamp(merged.water.intervalMinutes, 5, 240, 45)
  merged.water.remindersEnabled = Boolean(merged.water.remindersEnabled)
  merged.water.startHour = clamp(merged.water.startHour, 0, 23, 9)
  merged.water.endHour = clamp(merged.water.endHour, 1, 24, 21)
  merged.privacy.monitorDevices = Boolean(merged.privacy.monitorDevices)
  merged.spring.stiffness = clamp(merged.spring.stiffness, 60, 420, 170)
  merged.spring.damping = clamp(merged.spring.damping, 4, 60, 17.7)
  // The first spring (170 / 17.7) took over half a second to settle. Anyone who
  // never touched the sliders moves to the quicker default instead of being
  // stuck with the old feel forever.
  if (merged.spring.stiffness === 170 && Math.abs(merged.spring.damping - 17.7) < 0.05) {
    merged.spring = { ...DEFAULT_SETTINGS.spring }
  }
  return merged
}

function normaliseState(input: Partial<AppState> | null | undefined): AppState {
  const fresh = defaultState()
  if (!input || typeof input !== 'object') return fresh
  const state = clone(fresh)
  if (Array.isArray(input.tasks)) {
    state.tasks = input.tasks
      .filter((t) => t && typeof t.text === 'string')
      .slice(0, 500)
      .map((t) => ({
        id: String(t.id ?? Math.random().toString(36).slice(2)),
        text: String(t.text).slice(0, 300),
        done: Boolean(t.done),
        createdAt: Number(t.createdAt) || Date.now(),
        due: t.due ? String(t.due) : null
      }))
  }
  if (Array.isArray(input.shelf)) {
    state.shelf = input.shelf
      .filter((s) => s && typeof s.path === 'string')
      .slice(0, 60)
      .map((s) => ({
        id: String(s.id ?? Math.random().toString(36).slice(2)),
        path: String(s.path),
        name: String(s.name ?? path.basename(String(s.path))),
        kind: s.kind === 'folder' ? 'folder' : 'file',
        addedAt: Number(s.addedAt) || Date.now()
      }))
  }
  if (input.focus && typeof input.focus === 'object') {
    const focus = input.focus
    state.focus.mode = focus.mode === 'break' || focus.mode === 'long' ? focus.mode : 'work'
    state.focus.running = Boolean(focus.running)
    state.focus.endsAt = typeof focus.endsAt === 'number' ? focus.endsAt : null
    state.focus.remainingMs = Math.max(0, Number(focus.remainingMs) || 0)
    state.focus.completed = Math.max(0, Number(focus.completed) || 0)
    state.focus.day = String(focus.day ?? state.focus.day)
  }
  if (input.water && typeof input.water === 'object') {
    state.water.day = String(input.water.day ?? state.water.day)
    state.water.count = Math.max(0, Number(input.water.count) || 0)
    state.water.lastReminderAt = Math.max(0, Number(input.water.lastReminderAt) || 0)
  }
  if (input.usage && typeof input.usage === 'object') {
    const usage = input.usage
    state.usage.day = String(usage.day ?? state.usage.day)
    state.usage.total = Math.max(0, Number(usage.total) || 0)
    state.usage.apps = Array.isArray(usage.apps)
      ? usage.apps
          .filter((item) => item && typeof item.name === 'string')
          .slice(0, 8)
          .map((item) => ({ name: String(item.name).slice(0, 80), seconds: Math.max(0, Number(item.seconds) || 0) }))
      : []
    state.usage.hours = Array.from({ length: 24 }, (_, index) => {
      const value = Array.isArray(usage.hours) ? Number(usage.hours[index]) : 0
      return Number.isFinite(value) && value > 0 ? value : 0
    })
  }
  if (Array.isArray(input.clipboard)) {
    state.clipboard = input.clipboard
      .filter((item) => item && typeof item.text === 'string')
      .slice(0, 6)
      .map((item) => ({
        id: String(item.id ?? Math.random().toString(36).slice(2)),
        text: String(item.text).slice(0, 280),
        at: Number(item.at) || Date.now()
      }))
  }
  if (input.motivation && typeof input.motivation === 'object') {
    const motivation = input.motivation
    if (Array.isArray(motivation.credited)) {
      state.motivation.credited = motivation.credited
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .slice(-800)
    }
    if (motivation.days && typeof motivation.days === 'object') {
      for (const [day, value] of Object.entries(motivation.days)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue
        const count = Math.min(500, Math.max(0, Number(value) || 0))
        if (count > 0) state.motivation.days[day] = count
      }
    }
    state.motivation.treats = Math.min(1_000_000, Math.max(0, Number(motivation.treats) || 0))
    state.motivation.paws = Math.min(1_000_000, Math.max(0, Number(motivation.paws) || 0))
    state.motivation.best = Math.min(4000, Math.max(0, Number(motivation.best) || 0))
  }
  if (input.themes && typeof input.themes === 'object') {
    const themes = input.themes
    const owned = Array.isArray(themes.owned)
      ? themes.owned.filter(
          (id): id is string => typeof id === 'string' && THEMES.some((theme) => theme.id === id)
        )
      : []
    state.themes.owned = [...new Set([DEFAULT_THEME, ...owned])]
    state.themes.active =
      typeof themes.active === 'string' && state.themes.owned.includes(themes.active)
        ? themes.active
        : DEFAULT_THEME
  }
  if (typeof input.lastTab === 'string') {
    const tabs = ['media', 'calendar', 'focus', 'water', 'tasks', 'shelf', 'agent']
    if (tabs.includes(input.lastTab)) state.lastTab = input.lastTab as AppState['lastTab']
  }
  return state
}

export class Store {
  private data: StoreShape
  private file: string
  private writeTimer: NodeJS.Timeout | null = null
  private pending: Promise<void> = Promise.resolve()

  constructor(directory: string) {
    this.file = path.join(directory, 'notch-data.json')
    this.data = { version: 1, settings: clone(DEFAULT_SETTINGS), state: defaultState() }
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as Partial<StoreShape>
      this.data = {
        version: 1,
        settings: normaliseSettings(parsed.settings),
        state: normaliseState(parsed.state)
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        // A corrupt file should never stop the app from starting.
        console.warn('[store] could not read data file, starting fresh:', error)
      }
      this.data = { version: 1, settings: clone(DEFAULT_SETTINGS), state: defaultState() }
    }
  }

  get settings(): Settings {
    return this.data.settings
  }

  get state(): AppState {
    return this.data.state
  }

  patchSettings(patch: Partial<Settings>): Settings {
    this.data.settings = normaliseSettings({ ...this.data.settings, ...patch })
    this.scheduleSave()
    return this.data.settings
  }

  patchState(patch: Partial<AppState>): AppState {
    this.data.state = normaliseState({ ...this.data.state, ...patch })
    this.scheduleSave()
    return this.data.state
  }

  private scheduleSave(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null
      void this.save()
    }, 250)
  }

  async save(): Promise<void> {
    const payload = JSON.stringify(this.data, null, 2)
    const tmp = `${this.file}.tmp`
    this.pending = this.pending.then(async () => {
      try {
        await fs.mkdir(path.dirname(this.file), { recursive: true })
        await fs.writeFile(tmp, payload, 'utf8')
        await fs.rename(tmp, this.file)
      } catch (error) {
        console.warn('[store] save failed', error)
      }
    })
    return this.pending
  }

  async flush(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    await this.save()
  }
}
