import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import {
  DEFAULT_CAPABILITIES,
  DEFAULT_SETTINGS,
  EMPTY_MEDIA,
  EMPTY_SYSTEM,
  defaultState,
  todayKey,
  type AgentStatus,
  type AppState,
  type CalendarEvent,
  type Capabilities,
  type FocusMode,
  type FocusState,
  type GoogleStatus,
  type IslandApi,
  type IslandMode,
  type MediaState,
  type NotchNotification,
  type Settings,
  type SystemState,
  type Task,
  type ViewId
} from '../../shared/types'
import { CAT_NAME, CURRENCY, creditTasks, levelFor, treatsToNextLevel } from '../../shared/motivation'
import { themeById } from '../../shared/themes'
import { createDemoApi, isDemoEnvironment } from './lib/demo'

export type NoticeKind =
  | 'volume'
  | 'mute'
  | 'brightness'
  | 'caps'
  | 'network'
  | 'mic'
  | 'camera'
  | 'battery'
  | 'timer'
  | 'water'
  | 'info'

export interface Notice {
  key: string
  kind: NoticeKind
  title: string
  detail?: string
  value?: number
}

export interface AgentMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  at: number
  error?: boolean
}

export interface MotivationPulse {
  /** Monotonic id, so a second treat restarts the animation. */
  seq: number
  kind: 'treat' | 'level'
  at: number
}

interface AppContextValue {
  api: IslandApi
  demo: boolean
  ready: boolean
  settings: Settings
  state: AppState
  media: MediaState
  system: SystemState
  capabilities: Capabilities
  google: GoogleStatus
  setGoogle: (status: GoogleStatus) => void
  /** Kept warm here, not in the tab, so any view can show a fresh week. */
  calendarEvents: CalendarEvent[]
  calendarError: string | null
  calendarLoading: boolean
  refreshCalendar: () => void
  version: string
  view: ViewId
  setView: (view: ViewId) => void
  expanded: boolean
  mode: IslandMode
  hover: boolean
  notifications: NotchNotification[]
  activeNotification: NotchNotification | null
  notify: (input: {
    kind: NotchNotification['kind']
    title: string
    detail?: string | null
    timeoutMs?: number
    source?: string | null
  }) => void
  answerNotification: (id: string, actionId: string | null) => void
  setPointerHover: (inside: boolean) => void
  setHoldOpen: (open: boolean) => void
  dismiss: () => void
  notice: Notice | null
  showNotice: (notice: Omit<Notice, 'key'>) => void
  agent: AgentStatus
  setAgent: (status: AgentStatus) => void
  agentMessages: AgentMessage[]
  agentStreaming: boolean
  agentLinkWaiting: boolean
  agentError: string | null
  sendAgentMessage: (text: string) => void
  stopAgent: () => void
  clearAgent: () => void
  updateSettings: (patch: Partial<Settings>) => Promise<void>
  updateState: (patch: Partial<AppState>) => Promise<void>
  /** Task changes go through here so a completed task can pay the cat. */
  saveTasks: (tasks: Task[]) => void
  /** Buys a theme with Paws, or switches to it when it is already owned. */
  buyTheme: (id: string) => boolean
  applyTheme: (id: string) => void
  /** The most recent treat the cat ate, for the Home animation. */
  motivationPulse: MotivationPulse | null
  now: number
  focusRemaining: number
  focusTotal: number
  startFocus: () => void
  pauseFocus: () => void
  resetFocus: () => void
  skipFocus: () => void
  addWater: (delta: number) => void
  resetWater: () => void
}

const AppContext = createContext<AppContextValue | null>(null)

function mergeSettings(base: Settings, patch: Partial<Settings>): Settings {
  const next = { ...base }
  for (const key of Object.keys(patch) as (keyof Settings)[]) {
    const value = patch[key]
    if (value && typeof value === 'object') {
      ;(next as Record<string, unknown>)[key] = { ...base[key], ...value }
    }
  }
  return next
}

function focusDuration(mode: FocusMode, settings: Settings): number {
  const minutes =
    mode === 'work'
      ? settings.focus.workMinutes
      : mode === 'long'
        ? settings.focus.longBreakMinutes
        : settings.focus.breakMinutes
  return Math.max(1, minutes) * 60_000
}

export function AppProvider({ children }: { children: ReactNode }) {
  const api = useMemo<IslandApi>(
    () => (isDemoEnvironment() ? createDemoApi() : (window.island as IslandApi)),
    []
  )
  const demo = isDemoEnvironment()

  const [ready, setReady] = useState(false)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [state, setState] = useState<AppState>(defaultState)
  const [media, setMedia] = useState<MediaState>(EMPTY_MEDIA)
  const [system, setSystem] = useState<SystemState>(EMPTY_SYSTEM)
  const [capabilities, setCapabilities] = useState<Capabilities>(DEFAULT_CAPABILITIES)
  const [motivationPulse, setMotivationPulse] = useState<MotivationPulse | null>(null)
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [calendarError, setCalendarError] = useState<string | null>(null)
  const [calendarLoading, setCalendarLoading] = useState(false)
  const calendarInFlight = useRef(false)
  const [google, setGoogle] = useState<GoogleStatus>({
    configured: false,
    connected: false,
    email: null,
    error: null
  })
  const [version, setVersion] = useState('1.0.0')
  const [view, setViewState] = useState<ViewId>('media')
  const [now, setNow] = useState(() => Date.now())

  const [hoverIpc, setHoverIpc] = useState(false)
  const [hoverPointer, setHoverPointer] = useState(false)
  const [hoverStable, setHoverStable] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [hoverMuted, setHoverMuted] = useState(false)
  const [holdOpen, setHoldOpen] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [notifications, setNotifications] = useState<NotchNotification[]>([])
  const [agent, setAgent] = useState<AgentStatus>({
    hasKey: false,
    channel: 'local',
    model: DEFAULT_SETTINGS.agent.model,
    baseUrl: DEFAULT_SETTINGS.agent.baseUrl,
    error: null
  })
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([])
  const [agentStreaming, setAgentStreaming] = useState(false)
  const [agentLinkWaiting, setAgentLinkWaiting] = useState(false)
  const [agentBusy, setAgentBusy] = useState(false)
  const [agentError, setAgentError] = useState<string | null>(null)

  const noticeTimer = useRef<number | null>(null)
  const typingActivity = useRef(0)
  const pulseSeq = useRef(0)
  const previousSystem = useRef<SystemState | null>(null)
  const handledFocusEnd = useRef<number | null>(null)
  const resetDay = useRef<string>(todayKey())
  const expandedSnapshotRef = useRef(false)
  const agentRequestId = useRef<string | null>(null)

  const hover = hoverIpc || hoverPointer
  const activeNotification = notifications[0] ?? null
  // A card that arrived while the island was a pill stays a toast: moving the
  // pointer onto it must not replace it with the panel. A card that arrived
  // while the panel was already open stays in the panel instead.
  const panelAtArrival = useRef(false)
  // The first run opens itself: the welcome tour has to be visible without the
  // user knowing that hovering the notch is the way in.
  const tourOpen = ready && !settings.general.welcomeSeen
  // The pointer has to still be inside: `hoverStable` lingers for 220ms after a
  // leave, which would otherwise re-open a panel the user just closed.
  const expandedByHover = (hover && hoverStable && !dismissed) || pinned || holdOpen || agentBusy
  const expanded =
    tourOpen ||
    (expandedByHover && !hoverMuted && (activeNotification === null || panelAtArrival.current))
  useEffect(() => {
    expandedSnapshotRef.current = expanded
  }, [expanded])
  useEffect(() => {
    // The tour owns the panel: the island must not collapse it while the pointer
    // is elsewhere, because the user has not learned to hover the notch yet.
    api.setHold(tourOpen)
    return () => api.setHold(false)
  }, [api, tourOpen])
  const mode: IslandMode = expanded ? 'panel' : activeNotification ? 'toast' : 'pill'

  const notify = useCallback(
    (input: {
      kind: NotchNotification['kind']
      title: string
      detail?: string | null
      timeoutMs?: number
      source?: string | null
    }) => {
      const notification: NotchNotification = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: input.kind,
        title: input.title,
        detail: input.detail ?? null,
        source: input.source ?? null,
        actions: [],
        createdAt: Date.now(),
        timeoutMs: input.timeoutMs ?? 4500
      }
      panelAtArrival.current = expandedSnapshotRef.current
      setNotifications((previous) => [...previous.slice(-3), notification])
    },
    []
  )

  const answerNotification = useCallback(
    (id: string, actionId: string | null) => {
      api.notifyAnswer(id, actionId)
      setNotifications((previous) => previous.filter((item) => item.id !== id))
      // Answering happens with the pointer on the card; do not turn that same
      // hover into an expanded panel until the pointer leaves and comes back.
      setHoverMuted(true)
    },
    [api]
  )

  const showNotice = useCallback((next: Omit<Notice, 'key'>) => {
    setNotice({ ...next, key: `${next.kind}-${Date.now()}` })
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => {
      setNotice(null)
      noticeTimer.current = null
    }, 2800)
  }, [])

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      setSettings((current) => mergeSettings(current, patch))
      try {
        const next = await api.updateSettings(patch)
        setSettings(next)
      } catch (error) {
        console.warn('[island] settings update failed', error)
      }
    },
    [api]
  )

  const updateState = useCallback(
    async (patch: Partial<AppState>) => {
      setState((current) => ({ ...current, ...patch }))
      try {
        const next = await api.updateState(patch)
        setState(next)
      } catch (error) {
        console.warn('[island] state update failed', error)
      }
    },
    [api]
  )

  const setView = useCallback(
    (next: ViewId) => {
      setViewState(next)
      if (next !== 'settings') void api.updateState({ lastTab: next })
    },
    [api]
  )

  // Bootstrap + live subscriptions
  useEffect(() => {
    let alive = true
    api
      .bootstrap()
      .then((data) => {
        if (!alive) return
        setSettings(data.settings)
        setState(data.state)
        setMedia(data.media)
        setSystem(data.system)
        setCapabilities(data.capabilities)
        setGoogle(data.google)
        if (data.agent) setAgent(data.agent)
        setVersion(data.version)
        setViewState(data.state.lastTab ?? 'media')
        setReady(true)
      })
      .catch((error) => {
        console.error('[island] bootstrap failed', error)
        setReady(true)
      })

    const unsubscribers = [
      api.onMedia((next) => setMedia(next)),
      api.onSystem((next) => setSystem(next)),
      api.onCapabilities((next) => setCapabilities(next)),
      api.onHover((inside) => setHoverIpc(inside)),
      api.onForceCollapse(() => {
        setPinned(false)
        setHoldOpen(false)
        setHoverPointer(false)
        setDismissed(true)
      }),
      api.onFocusRequest((next) => {
        setPinned(true)
        setDismissed(false)
        setView(next as ViewId)
      }),
      api.onAgentDelta(({ requestId, text }) => {
        if (requestId !== agentRequestId.current) return
        setAgentMessages((previous) => {
          const index = previous.findIndex((message) => message.id === requestId)
          if (index === -1) {
            return [...previous, { id: requestId, role: 'assistant', text, at: Date.now() }]
          }
          const next = previous.slice()
          next[index] = { ...next[index], text: next[index].text + text }
          return next
        })
      }),
      api.onAgentDone(({ requestId, text }) => {
        if (requestId !== agentRequestId.current) return
        agentRequestId.current = null
        setAgentMessages((previous) => {
          if (previous.some((message) => message.id === requestId)) return previous
          if (!text.trim()) return previous
          return [...previous, { id: requestId, role: 'assistant', text, at: Date.now() }]
        })
        setAgentStreaming(false)
        setAgentBusy(false)
        api.setBusy(false)
      }),
      api.onAgentLinkReply(({ text }) => {
        const reply = text.trim()
        if (!reply) return
        setAgentLinkWaiting(false)
        if (!expandedSnapshotRef.current) {
          notify({
            kind: 'agent',
            title: 'Your agent replied',
            detail: reply.length > 120 ? `${reply.slice(0, 117)}…` : reply,
            timeoutMs: 7000,
            source: 'agent'
          })
        }
        setAgentMessages((previous) => [
          ...previous,
          { id: `l${Date.now().toString(36)}`, role: 'assistant', text: reply, at: Date.now() }
        ])
      }),
      api.onNotification((notification) => {
        setNotifications((previous) => {
          if (previous.some((item) => item.id === notification.id)) return previous
          panelAtArrival.current = expandedSnapshotRef.current
          return [...previous, notification]
        })
      }),
      api.onNotificationClose((id) => {
        setNotifications((previous) => previous.filter((item) => item.id !== id))
      }),
      api.onHome(({ usage, clipboard }) => {
        setState((previous) => ({ ...previous, usage, clipboard }))
      }),
      api.onAgentError(({ requestId, message }) => {
        if (requestId !== agentRequestId.current) return
        agentRequestId.current = null
        setAgentError(message)
        setAgentMessages((previous) => {
          if (previous.some((item) => item.id === requestId && item.text.trim())) return previous
          return [...previous, { id: requestId, role: 'assistant', text: message, at: Date.now(), error: true }]
        })
        setAgentStreaming(false)
        setAgentBusy(false)
        api.setBusy(false)
      })
    ]

    return () => {
      alive = false
      unsubscribers.forEach((off) => off())
    }
  }, [api, setView])

  // Clock
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [])

  // Hover stabilisation so a brief exit does not collapse the island
  useEffect(() => {
    if (hover) {
      setDismissed(false)
      setHoverStable(true)
      return
    }
    // A dismissal only ever applies to the hover session that produced it.
    setDismissed(false)
    setHoverMuted(false)
    const timer = window.setTimeout(() => setHoverStable(false), 220)
    return () => window.clearTimeout(timer)
  }, [hover])

  // The main process tracks the real cursor. A pointer-derived hover must never
  // outlive it, otherwise the panel can latch open after the island becomes
  // click-through and stops receiving pointer events.
  useEffect(() => {
    if (!hoverIpc) setHoverPointer(false)
  }, [hoverIpc])

  useEffect(() => {
    const clear = (): void => setHoverPointer(false)
    document.addEventListener('pointerleave', clear)
    window.addEventListener('blur', clear)
    return () => {
      document.removeEventListener('pointerleave', clear)
      window.removeEventListener('blur', clear)
    }
  }, [])

  // Only text entry may hold the panel open while the pointer is away. A focused
  // tab or button must not, or the island would never collapse again.
  useEffect(() => {
    const isTextEntry = (element: Element | null): boolean => {
      if (!(element instanceof HTMLElement)) return false
      if (element.isContentEditable) return true
      return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT'
    }
    const onFocusIn = (event: FocusEvent): void => {
      const text = isTextEntry(event.target as Element | null)
      typingActivity.current = Date.now()
      setHoldOpen(text)
      api.setTyping(text)
    }
    const onKeyDown = (): void => {
      typingActivity.current = Date.now()
    }
    const onFocusOut = (): void => {
      window.setTimeout(() => {
        const text = isTextEntry(document.activeElement)
        setHoldOpen(text)
        api.setTyping(text)
      }, 0)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [api])

  // A focused text field holds the panel open, but once the pointer leaves, the
  // window is click-through and that field never receives its blur event. Release
  // the hold when the pointer is away and nothing has been typed for a while, so
  // the island can never stay stuck open.
  useEffect(() => {
    if (!holdOpen || hover) return
    const timer = window.setInterval(() => {
      if (Date.now() - typingActivity.current < 6000) return
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      setHoldOpen(false)
    }, 500)
    return () => window.clearInterval(timer)
  }, [holdOpen, hover])

  useEffect(() => {
    api.setMode(mode)
  }, [api, mode])

  // Informational cards clear themselves; cards with buttons wait for an answer.
  useEffect(() => {
    if (!activeNotification || activeNotification.timeoutMs <= 0) return
    const timer = window.setTimeout(() => {
      api.notifyAnswer(activeNotification.id, null)
      setNotifications((previous) => previous.filter((item) => item.id !== activeNotification.id))
    }, activeNotification.timeoutMs)
    return () => window.clearTimeout(timer)
  }, [api, activeNotification])

  // Escape closes the panel
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      if (agentRequestId.current) {
        api.agentCancel(agentRequestId.current)
        agentRequestId.current = null
        setAgentStreaming(false)
        setAgentBusy(false)
        api.setBusy(false)
      }
      setPinned(false)
      if (view === 'settings') {
        setViewState('media')
        return
      }
      setDismissed(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view])

  // Losing window focus dismisses a pinned panel
  useEffect(() => {
    const onBlur = (): void => setPinned(false)
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [])

  const dismiss = useCallback(() => {
    setPinned(false)
    setDismissed(true)
  }, [])

  // Daily rollover for focus and water counters
  useEffect(() => {
    const key = todayKey()
    if (resetDay.current === key) return
    resetDay.current = key
    setState((current) => ({
      ...current,
      water: { ...current.water, day: key, count: 0, lastReminderAt: 0 },
      focus: { ...current.focus, day: key, completed: 0 }
    }))
    void api.updateState({
      water: { ...state.water, day: key, count: 0, lastReminderAt: 0 },
      focus: { ...state.focus, day: key, completed: 0 }
    })
  }, [now, api, state.water, state.focus])

  // System notices
  useEffect(() => {
    const previous = previousSystem.current
    previousSystem.current = system
    if (!previous) return

    if (system.muted !== previous.muted) {
      showNotice({ kind: 'mute', title: system.muted ? 'Muted' : 'Unmuted', value: system.volume ?? 0 })
    } else if (system.volume !== previous.volume && system.volume !== null) {
      showNotice({ kind: 'volume', title: 'Volume', value: system.volume })
    }

    if (
      system.brightness !== null &&
      previous.brightness !== null &&
      system.brightness !== previous.brightness
    ) {
      showNotice({ kind: 'brightness', title: 'Brightness', value: system.brightness })
    }

    if (system.capsLock !== previous.capsLock) {
      showNotice({ kind: 'caps', title: system.capsLock ? 'Caps Lock on' : 'Caps Lock off' })
    }

    if (system.online !== previous.online) {
      showNotice({
        kind: 'network',
        title: system.online ? 'Connected' : 'No internet connection',
        detail: system.online ? (system.networkName ?? undefined) : undefined
      })
      if (!system.online) notify({ kind: 'warning', title: 'No internet connection' })
    }

    if (system.micActive && !previous.micActive) {
      showNotice({
        kind: 'mic',
        title: 'Microphone in use',
        detail: system.micApps.join(', ') || undefined
      })
      notify({
        kind: 'warning',
        title: 'Microphone in use',
        detail: system.micApps.join(', ') || null
      })
    }

    if (system.cameraActive && !previous.cameraActive) {
      showNotice({
        kind: 'camera',
        title: 'Camera in use',
        detail: system.cameraApps.join(', ') || undefined
      })
      notify({ kind: 'warning', title: 'Camera in use', detail: system.cameraApps.join(', ') || null })
    }
  }, [system, showNotice, notify])

  // Battery notices
  useEffect(() => {
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{
        level: number
        charging: boolean
        addEventListener: (type: string, listener: () => void) => void
        removeEventListener: (type: string, listener: () => void) => void
      }>
    }
    if (typeof nav.getBattery !== 'function') return
    let disposed = false
    let battery: Awaited<ReturnType<NonNullable<typeof nav.getBattery>>> | null = null
    let wasCharging: boolean | null = null
    let warned = false

    const update = (): void => {
      if (!battery || disposed) return
      const level = Math.round(battery.level * 100)
      if (wasCharging !== null && battery.charging !== wasCharging) {
        showNotice({
          kind: 'battery',
          title: battery.charging ? 'Charging' : 'On battery',
          value: level
        })
      }
      wasCharging = battery.charging
      if (level <= 20 && !battery.charging && !warned) {
        warned = true
        showNotice({ kind: 'battery', title: 'Battery low', detail: `${level}% remaining`, value: level })
      }
      if (level > 30) warned = false
    }

    nav
      .getBattery()
      .then((result) => {
        if (disposed) return
        battery = result
        wasCharging = result.charging
        result.addEventListener('levelchange', update)
        result.addEventListener('chargingchange', update)
      })
      .catch(() => undefined)

    return () => {
      disposed = true
      if (battery) {
        battery.removeEventListener('levelchange', update)
        battery.removeEventListener('chargingchange', update)
      }
    }
  }, [showNotice])

  // Focus timer states
  const focus = state.focus
  const focusTotal = focusDuration(focus.mode, settings)
  const focusRemaining =
    focus.running && focus.endsAt ? Math.max(0, focus.endsAt - now) : Math.max(0, focus.remainingMs)

  const advancePhase = useCallback(
    (current: FocusState, skipped = false) => {
      const config = settings.focus
      if (current.mode === 'work') {
        const completed = current.completed + 1
        const untilLong = Math.max(2, config.sessionsUntilLongBreak)
        const nextMode: FocusMode = completed % untilLong === 0 ? 'long' : 'break'
        const duration = focusDuration(nextMode, settings)
        const running = config.autoContinue
        const next: FocusState = {
          ...current,
          mode: nextMode,
          completed,
          running,
          endsAt: running ? Date.now() + duration : null,
          remainingMs: duration
        }
        handledFocusEnd.current = next.endsAt
        void updateState({ focus: next })
        if (!skipped) {
          showNotice({
            kind: 'timer',
            title: 'Focus session complete',
            detail: `${Math.round(duration / 60_000)} min ${nextMode === 'long' ? 'long break' : 'break'} ready`
          })
          notify({
            kind: 'timer',
            title: 'Focus session complete',
            detail: `${Math.round(duration / 60_000)} min ${nextMode === 'long' ? 'long break' : 'break'} ready`,
            timeoutMs: 6000
          })
        }
      } else {
        const duration = focusDuration('work', settings)
        const next: FocusState = {
          ...current,
          mode: 'work',
          running: config.autoContinue,
          endsAt: config.autoContinue ? Date.now() + duration : null,
          remainingMs: duration
        }
        handledFocusEnd.current = next.endsAt
        void updateState({ focus: next })
        if (!skipped) showNotice({ kind: 'timer', title: 'Break over', detail: 'Ready to focus again' })
      }
    },
    [settings, updateState, showNotice, notify]
  )

  useEffect(() => {
    if (!focus.running || !focus.endsAt) return
    if (now < focus.endsAt) return
    if (handledFocusEnd.current === focus.endsAt) return
    handledFocusEnd.current = focus.endsAt
    advancePhase(focus)
  }, [now, focus, advancePhase])

  const startFocus = useCallback(() => {
    const remaining = focus.remainingMs > 0 ? focus.remainingMs : focusDuration(focus.mode, settings)
    void updateState({
      focus: { ...focus, running: true, endsAt: Date.now() + remaining, remainingMs: remaining }
    })
  }, [focus, settings, updateState])

  const pauseFocus = useCallback(() => {
    const remaining = focus.endsAt ? Math.max(0, focus.endsAt - Date.now()) : focus.remainingMs
    void updateState({ focus: { ...focus, running: false, endsAt: null, remainingMs: remaining } })
  }, [focus, updateState])

  const resetFocus = useCallback(() => {
    const duration = focusDuration(focus.mode, settings)
    void updateState({
      focus: { ...focus, running: false, endsAt: null, remainingMs: duration }
    })
  }, [focus, settings, updateState])

  const skipFocus = useCallback(() => {
    advancePhase(focus, true)
  }, [focus, advancePhase])

  const addWater = useCallback(
    (delta: number) => {
      const key = todayKey()
      const count = Math.max(0, Math.min(99, state.water.count + delta))
      void updateState({
        water: {
          day: key,
          count,
          lastReminderAt: delta > 0 ? Date.now() : state.water.lastReminderAt
        }
      })
    },
    [state.water, updateState]
  )

  /**
   * Every task ticked for the first time feeds Mochi a treat. Three treats is a
   * level, and a level pays out Paws for the theme store. Credited ids live in
   * the store, so unticking and re-ticking a task cannot farm treats.
   */
  const saveTasks = useCallback(
    (tasks: Task[]) => {
      const doneIds = tasks.filter((task) => task.done).map((task) => task.id)
      const result = creditTasks(state.motivation, doneIds)
      if (result.treats === 0) {
        void updateState({ tasks })
        return
      }
      const level = levelFor(result.motivation.treats)
      void updateState({ tasks, motivation: result.motivation })
      pulseSeq.current += 1
      setMotivationPulse({
        seq: pulseSeq.current,
        kind: result.levels > 0 ? 'level' : 'treat',
        at: Date.now()
      })
      if (result.levels > 0) {
        notify({
          kind: 'success',
          title: `${CAT_NAME} reached level ${level}`,
          detail: `+${result.paws} ${CURRENCY} to spend on themes`,
          timeoutMs: 6500
        })
      } else {
        showNotice({
          kind: 'info',
          title: `${CAT_NAME} got a treat`,
          detail: `${treatsToNextLevel(result.motivation.treats)} more to level ${level + 1}`
        })
      }
    },
    [state.motivation, updateState, notify, showNotice]
  )

  const applyTheme = useCallback(
    (id: string) => {
      if (!state.themes.owned.includes(id)) return
      void updateState({ themes: { owned: state.themes.owned, active: id } })
    },
    [state.themes, updateState]
  )

  const buyTheme = useCallback(
    (id: string): boolean => {
      const theme = themeById(id)
      if (state.themes.owned.includes(id)) {
        applyTheme(id)
        return true
      }
      if (state.motivation.paws < theme.price) return false
      const left = state.motivation.paws - theme.price
      void updateState({
        motivation: { ...state.motivation, paws: left },
        themes: { owned: [...state.themes.owned, id], active: id }
      })
      notify({
        kind: 'success',
        title: `${theme.name} unlocked`,
        detail: `${theme.price} ${CURRENCY} spent · ${left} left`,
        timeoutMs: 5000
      })
      return true
    },
    [state.themes, state.motivation, updateState, notify, applyTheme]
  )

  // The week of events is fetched here rather than inside the Calendar tab:
  // the notch keeps it warm in the background, so opening the tab is instant
  // and the data is already current.
  const refreshCalendar = useCallback(async () => {
    if (!google.connected || calendarInFlight.current) return
    calendarInFlight.current = true
    setCalendarLoading(true)
    try {
      const result = await api.calendar()
      setCalendarEvents(result.events)
      setCalendarError(result.error)
    } catch (caught) {
      setCalendarError((caught as Error).message)
    } finally {
      calendarInFlight.current = false
      setCalendarLoading(false)
    }
  }, [api, google.connected])

  useEffect(() => {
    if (!google.connected) return
    void refreshCalendar()
    const timer = window.setInterval(() => void refreshCalendar(), 5 * 60_000)
    const onSurface = (): void => {
      if (document.visibilityState === 'visible') void refreshCalendar()
    }
    document.addEventListener('visibilitychange', onSurface)
    window.addEventListener('focus', onSurface)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onSurface)
      window.removeEventListener('focus', onSurface)
    }
  }, [google.connected, refreshCalendar])

  // The active theme paints the island through the same variables the glass uses.
  useEffect(() => {
    const theme = themeById(state.themes.active)
    const root = document.documentElement
    root.style.setProperty('--accent', theme.accent)
    root.style.setProperty('--accent-2', theme.accent2)
    root.style.setProperty('--glass', theme.tint)
  }, [state.themes.active])

  const resetWater = useCallback(() => {
    void updateState({ water: { day: todayKey(), count: 0, lastReminderAt: 0 } })
  }, [updateState])

  // Water reminders
  useEffect(() => {
    if (!settings.water.remindersEnabled) return
    if (state.water.count >= settings.water.goal) return
    const hour = new Date().getHours()
    if (hour < settings.water.startHour || hour >= settings.water.endHour) return
    const interval = Math.max(5, settings.water.intervalMinutes) * 60_000
    if (state.water.lastReminderAt === 0) {
      void updateState({ water: { ...state.water, lastReminderAt: Date.now() } })
      return
    }
    if (now - state.water.lastReminderAt < interval) return
    void updateState({ water: { ...state.water, lastReminderAt: Date.now() } })
    showNotice({ kind: 'water', title: 'Time for a glass of water' })
    notify({ kind: 'info', title: 'Time for a glass of water', detail: 'Tap the notch to log it', timeoutMs: 6000 })
  }, [now, settings.water, state.water, updateState, showNotice, notify])

  useEffect(() => {
    return () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current)
    }
  }, [])

  // A compact snapshot of what the user is doing, sent with every message so the
  // assistant can answer about the day without any extra API access.
  const buildAgentContext = useCallback((): string => {
    const minutes = (seconds: number): string =>
      `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
    const lines: string[] = []
    const clock = new Date()
    lines.push(
      `Now: ${clock.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}`
    )
    lines.push(
      media.active && media.title
        ? `Music: "${media.title}" by ${media.artist || 'unknown artist'} in ${media.appName} (${media.status}) ${minutes(media.position)}/${minutes(media.duration)}`
        : 'Music: nothing playing'
    )
    const openTasks = state.tasks.filter((task) => !task.done)
    lines.push(
      openTasks.length > 0
        ? `Tasks (${openTasks.length} open): ${openTasks.slice(0, 5).map((task) => task.text).join('; ')}`
        : 'Tasks: none open'
    )
    lines.push(`Water: ${state.water.count} of ${settings.water.goal} glasses today`)
    const remaining =
      state.focus.running && state.focus.endsAt
        ? Math.max(0, state.focus.endsAt - Date.now())
        : state.focus.remainingMs
    lines.push(
      state.focus.running
        ? `Focus: ${state.focus.mode} session running, ${Math.round(remaining / 60_000)} min left`
        : `Focus: ${state.focus.mode} timer paused at ${Math.round(remaining / 60_000)} min`
    )
    if (system.volume !== null) lines.push(`Volume: ${system.volume}%${system.muted ? ' (muted)' : ''}`)
    lines.push(
      `Network: ${system.online ? (system.networkName ? `online (${system.networkName})` : 'online') : 'offline'}`
    )
    if (google.connected) lines.push('Google: connected')
    return lines.join('\n')
  }, [media, state.tasks, state.water, state.focus, settings.water.goal, system, google.connected])

  const sendAgentMessage = useCallback(
    (text: string) => {
      const value = text.trim()
      if (!value || agentStreaming || agentLinkWaiting) return
      const requestId = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      const userMessage: AgentMessage = {
        id: `${requestId}-u`,
        role: 'user',
        text: value,
        at: Date.now()
      }
      setAgentError(null)
      if (!agent.hasKey || agent.channel === 'local') {
        // No provider key: hand the message to the coding agent on this machine.
        setAgentMessages((previous) => [...previous, userMessage])
        setAgentLinkWaiting(true)
        void api.agentLinkSend(value).then((result) => {
          if (!result?.ok) {
            setAgentLinkWaiting(false)
            setAgentError('Could not reach the local agent bridge.')
          }
        })
        return
      }
      const turns = [...agentMessages, userMessage]
        .slice(-16)
        .map((message) => ({ role: message.role, content: message.text }))
      agentRequestId.current = requestId
      setAgentMessages((previous) => [...previous, userMessage])
      setAgentStreaming(true)
      setAgentBusy(true)
      api.setBusy(true)
      api.agentSend(requestId, turns, buildAgentContext())
    },
    [api, agent.hasKey, agent.channel, agentLinkWaiting, agentMessages, agentStreaming, buildAgentContext]
  )

  const stopAgent = useCallback(() => {
    if (agentRequestId.current) api.agentCancel(agentRequestId.current)
    agentRequestId.current = null
    setAgentStreaming(false)
    setAgentLinkWaiting(false)
    setAgentBusy(false)
    api.setBusy(false)
  }, [api])

  const clearAgent = useCallback(() => {
    setAgentMessages([])
    setAgentError(null)
    setAgentLinkWaiting(false)
  }, [])

  const value: AppContextValue = {
    api,
    demo,
    ready,
    settings,
    state,
    media,
    system,
    capabilities,
    google,
    setGoogle,
    calendarEvents,
    calendarError,
    calendarLoading,
    refreshCalendar,
    version,
    view,
    setView,
    expanded,
    mode,
    hover,
    notifications,
    activeNotification,
    notify,
    answerNotification,
    setPointerHover: setHoverPointer,
    setHoldOpen,
    dismiss,
    notice,
    showNotice,
    agent,
    setAgent,
    agentMessages,
    agentStreaming,
    agentLinkWaiting,
    agentError,
    sendAgentMessage,
    stopAgent,
    clearAgent,
    updateSettings,
    updateState,
    saveTasks,
    buyTheme,
    applyTheme,
    motivationPulse,
    now,
    focusRemaining,
    focusTotal,
    startFocus,
    pauseFocus,
    resetFocus,
    skipFocus,
    addWater,
    resetWater
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used inside AppProvider')
  return context
}

export function useTicker(intervalMs = 250): number {
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs])
  return tick
}
