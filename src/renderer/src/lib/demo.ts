import {
  DEFAULT_SETTINGS,
  EMPTY_SYSTEM,
  defaultState,
  todayKey,
  type AppState,
  type Bootstrap,
  type IslandApi,
  type MediaState,
  type Settings
} from '../../../shared/types'

const ARTWORK = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
    <defs>
      <linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2b1b5e"/>
        <stop offset="0.55" stop-color="#5b2f8c"/>
        <stop offset="1" stop-color="#1b2a63"/>
      </linearGradient>
      <radialGradient id="b" cx="0.3" cy="0.25" r="0.8">
        <stop offset="0" stop-color="#ff9bd2" stop-opacity="0.95"/>
        <stop offset="0.5" stop-color="#8a5cff" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#8a5cff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="240" height="240" fill="url(#a)"/>
    <circle cx="70" cy="64" r="86" fill="url(#b)"/>
    <circle cx="188" cy="176" r="64" fill="#57e0ff" opacity="0.22"/>
  </svg>`
)}`

const LYRICS = [
  'City lights are breathing slow',
  'Every window has a glow',
  'We were never in a hurry',
  'Let the colours blur and go',
  'Static on the radio',
  'Fading into something gold',
  'Half a mile of open road',
  'And a story never told',
  'Stay with me until the morning',
  'Neon drifting through the rain',
  'Every signal softly turning',
  'I would do it all again'
]

function makeLyrics() {
  return LYRICS.map((text, index) => ({ time: 8 + index * 14.6, text }))
}

export function isDemoEnvironment(): boolean {
  return typeof window !== 'undefined' && !window.island
}

function demoReply(question: string, media: MediaState): string {
  const lower = question.toLowerCase()
  if (/(listen|song|track|playing)/.test(lower)) {
    return `You're playing "${media.title}" by ${media.artist} from ${media.album}. It's ${Math.floor(media.duration / 60)} minutes long and you're about a third in.`
  }
  if (/(first|next|plan|order)/.test(lower)) {
    return 'Start with the design review notes, they unblock everything else. Then the train booking, which takes five minutes. Leave the plants for the evening.'
  }
  if (/(day|summar)/.test(lower)) {
    return 'You have two open tasks, five glasses of water so far and a focus session that is still running. Nothing urgent is overdue yet.'
  }
  return 'I can only see the summary in the notch: music, tasks, water and the focus timer. Ask me what to tackle next and I will pick a starting point.'
}

export function createDemoApi(): IslandApi {
  const settings: Settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  settings.general.showSeconds = false
  settings.weather = { enabled: true, place: 'Lisbon', latitude: 38.72, longitude: -9.14, unit: 'c' }
  const state: AppState = defaultState()
  state.tasks = [
    { id: 'demo-1', text: 'Send the design review notes', done: false, createdAt: Date.now(), due: null },
    { id: 'demo-2', text: 'Book the train for Thursday', done: false, createdAt: Date.now(), due: null },
    { id: 'demo-3', text: 'Water the plants', done: true, createdAt: Date.now(), due: null }
  ]
  state.shelf = [
    { id: 'demo-s1', path: 'C:\\Users\\Dell\\Documents\\contract.pdf', name: 'contract.pdf', kind: 'file', addedAt: Date.now() },
    { id: 'demo-s2', path: 'C:\\Users\\Dell\\Projects\\notch', name: 'notch', kind: 'folder', addedAt: Date.now() }
  ]
  state.focus = { mode: 'work', running: true, endsAt: Date.now() + 14 * 60_000, remainingMs: 25 * 60_000, completed: 2, day: '' }
  state.water = { day: '', count: 5, lastReminderAt: 0 }
  const demoApps = [
    { name: 'Code', seconds: 6_120 },
    { name: 'chrome', seconds: 3_480 },
    { name: 'Spotify', seconds: 960 }
  ]
  state.usage = {
    day: todayKey(),
    total: 10_560,
    apps: demoApps,
    hours: Array.from({ length: 24 }, (_, hour) => (hour >= 8 && hour <= 17 ? 600 + ((hour * 37) % 900) : 0))
  }
  // A handful of treats and Paws so the shop can be tried in the preview.
  state.motivation = {
    days: { [todayKey()]: 2, [todayKey(new Date(Date.now() - 86_400_000))]: 3 },
    credited: ['demo-3'],
    treats: 7,
    paws: 45,
    best: 6
  }
  state.themes = { owned: ['midnight', 'mint'], active: 'midnight' }
  state.clipboard = [
    { id: 'demo-c1', text: 'Design review notes — Tuesday 14:00', at: Date.now() - 3 * 60_000 },
    { id: 'demo-c2', text: 'npm run typecheck', at: Date.now() - 26 * 60_000 }
  ]

  let media: MediaState = {
    active: true,
    appId: 'demo',
    appName: 'Spotify',
    title: 'Neon Drift',
    artist: 'Lumen',
    album: 'Night Signals',
    status: 'playing',
    position: 64,
    duration: 214,
    artwork: ARTWORK,
    trackKey: 'demo',
    sampledAt: Date.now(),
    canNext: true,
    canPrev: true,
    canSeek: true
  }

  let agentHasKey = true
  const agentDelta = new Set<(event: { requestId: string; text: string }) => void>()
  const agentDone = new Set<(event: { requestId: string; text: string }) => void>()
  const agentError = new Set<(event: { requestId: string; message: string }) => void>()
  const agentTimers = new Map<string, number[]>()
  const agentLinkReply = new Set<(event: { text: string; at: number }) => void>()

  const api: IslandApi = {
    bootstrap: async (): Promise<Bootstrap> => ({
      settings,
      state,
      media,
      system: {
        ...EMPTY_SYSTEM,
        volume: 62,
        brightness: 80,
        online: true,
        networkName: 'Wi-Fi',
        cpu: 7,
        ram: 61,
        disk: 74,
        foreground: 'Code'
      },
      capabilities: { media: true, volume: true, brightness: true, devices: true, bridge: 'ready' },
      version: '1.0.0',
      google: { configured: true, connected: false, email: null, error: null },
      agent: {
        hasKey: agentHasKey,
        channel: settings.agent.channel,
        model: settings.agent.model,
        baseUrl: settings.agent.baseUrl,
        error: null
      },
      lyricsEnabled: settings.lyrics.enabled
    }),
    media: (command, value) => {
      if (command === 'playpause') {
        media = {
          ...media,
          status: media.status === 'playing' ? 'paused' : 'playing',
          position: media.status === 'playing' ? media.position + (Date.now() - media.sampledAt) / 1000 : media.position,
          sampledAt: Date.now()
        }
      }
      if (command === 'seek' && typeof value === 'number') {
        media = { ...media, position: value, sampledAt: Date.now() }
      }
    },
    setExpanded: () => undefined,
    setMode: () => undefined,
    setTyping: () => undefined,
    activate: () => undefined,
    setBusy: () => undefined,
    setHold: () => undefined,
    setToastHeight: () => undefined,
    setPanelHeight: () => undefined,
    notifyAnswer: (id, actionId) => {
      console.log('[demo] notification answered', id, actionId)
    },
    agentStatus: async () => ({
      hasKey: agentHasKey,
      channel: settings.agent.channel,
      model: settings.agent.model,
      baseUrl: settings.agent.baseUrl,
      error: null
    }),
    agentSetChannel: async (channel) => {
      settings.agent.channel = channel
      return {
        hasKey: agentHasKey,
        channel,
        model: settings.agent.model,
        baseUrl: settings.agent.baseUrl,
        error: null
      }
    },
    agentSetKey: async () => {
      agentHasKey = true
      return api.agentStatus()
    },
    agentClearKey: async () => {
      agentHasKey = false
      return api.agentStatus()
    },
    agentSend: (requestId, turns) => {
      const question = [...turns].reverse().find((turn) => turn.role === 'user')?.content ?? ''
      const reply = demoReply(question, media)
      const parts = reply.split(' ')
      const timers: number[] = []
      agentTimers.set(requestId, timers)
      parts.forEach((part, index) => {
        timers.push(
          window.setTimeout(() => {
            const text = index === 0 ? part : ` ${part}`
            agentDelta.forEach((listener) => listener({ requestId, text }))
            if (index === parts.length - 1) {
              agentDone.forEach((listener) => listener({ requestId, text: reply }))
              agentTimers.delete(requestId)
            }
          }, 260 + index * 55)
        )
      })
    },
    agentCancel: (requestId) => {
      for (const timer of agentTimers.get(requestId) ?? []) window.clearTimeout(timer)
      agentTimers.delete(requestId)
    },
    agentLinkSend: async () => ({ ok: true, pending: 1 }),
    reportIsland: () => undefined,
    updateSettings: async (patch) => {
      Object.assign(settings, patch)
      return settings
    },
    updateState: async (patch) => {
      Object.assign(state, patch)
      return state
    },
    getSettings: async () => settings,
    lyrics: async () => ({
      synced: true,
      lines: makeLyrics(),
      plain: null,
      instrumental: false,
      source: 'LRCLIB',
      trackName: media.title,
      artistName: media.artist
    }),
    weather: async () => ({
      place: 'Lisbon',
      temperature: 21,
      unit: 'C',
      code: 2,
      isDay: true,
      high: 24,
      low: 15,
      humidity: 58,
      wind: 12,
      updatedAt: Date.now()
    }),
    geocode: async () => [{ name: 'Lisbon', latitude: 38.72, longitude: -9.14 }],
    googleStatus: async () => ({ configured: true, connected: false, email: null, error: null }),
    googleConnect: async () => ({ configured: true, connected: false, email: null, error: 'Preview mode: connect inside the desktop app.' }),
    googleDisconnect: async () => ({ configured: true, connected: false, email: null, error: null }),
    calendar: async () => ({
      events: [
        {
          id: 'demo-e1',
          title: 'Design review',
          start: new Date(new Date().setHours(14, 0, 0, 0)).toISOString(),
          end: new Date(new Date().setHours(15, 0, 0, 0)).toISOString(),
          allDay: false,
          location: 'Studio',
          calendarName: 'Work',
          color: '#9db4ff'
        },
        {
          id: 'demo-e2',
          title: 'Train to Brighton',
          start: new Date(new Date(Date.now() + 86_400_000).setHours(9, 30, 0, 0)).toISOString(),
          end: new Date(new Date(Date.now() + 86_400_000).setHours(11, 0, 0, 0)).toISOString(),
          allDay: false,
          location: 'Platform 4',
          calendarName: 'Personal',
          color: '#8ff0c1'
        }
      ],
      error: null
    }),
    googleTasks: async () => ({ tasks: [], lists: [], error: null }),
    googleAddTask: async () => ({ ok: false, error: 'Preview mode only.' }),
    googleSetTask: async () => ({ ok: false, error: 'Preview mode only.' }),
    googleDeleteTask: async () => ({ ok: false, error: 'Preview mode only.' }),
    shelfAdd: async () => state,
    shelfAddPaths: async (paths) => {
      for (const path of paths) {
        state.shelf = [
          ...state.shelf,
          { id: `demo-${Math.random().toString(36).slice(2)}`, path, name: path.split(/[\\/]/).pop() ?? path, kind: 'file', addedAt: Date.now() }
        ]
      }
      return state
    },
    shelfRemove: async (id) => {
      state.shelf = state.shelf.filter((item) => item.id !== id)
      return state
    },
    shelfOpen: () => undefined,
    shelfReveal: () => undefined,
    convertPlan: async (target) => {
      const extension = (target.split('.').pop() || '').toLowerCase()
      const image = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'].includes(extension)
      const audio = ['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(extension)
      const video = ['mp4', 'webm', 'mkv', 'mov'].includes(extension)
      const kind = image ? 'image' : audio ? 'audio' : video ? 'video' : 'unknown'
      const table = image
        ? ['png', 'jpg', 'webp']
        : audio
          ? ['mp3', 'wav', 'ogg']
          : video
            ? ['mp4', 'webm', 'gif']
            : []
      return {
        kind,
        targets: table.filter((id) => id !== extension).map((id) => ({ id, label: id.toUpperCase() }))
      }
    },
    convertPlanMany: async (paths) => {
      const images = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff']
      const audio = ['mp3', 'wav', 'ogg', 'flac', 'm4a']
      const video = ['mp4', 'webm', 'mkv', 'mov']
      const extensions = paths.map((entry) => (entry.split('.').pop() || '').toLowerCase())
      const kinds = extensions.map((extension) =>
        images.includes(extension)
          ? 'image'
          : audio.includes(extension)
            ? 'audio'
            : video.includes(extension)
              ? 'video'
              : 'unknown'
      )
      const kind = (kinds.every((entry) => entry === kinds[0]) ? kinds[0] : 'unknown') as
        | 'image'
        | 'audio'
        | 'video'
        | 'unknown'
      const table = kind === 'image' ? ['png', 'jpg', 'webp'] : kind === 'audio' ? ['mp3', 'wav', 'ogg'] : kind === 'video' ? ['mp4', 'webm', 'gif'] : []
      return {
        kind,
        targets: table.filter((id) => !extensions.includes(id)).map((id) => ({ id, label: id.toUpperCase() }))
      }
    },
    convertBatch: async (paths, format) => {
      await new Promise((resolve) => window.setTimeout(resolve, 600))
      return paths.map((target) => ({
        path: target,
        ok: true,
        output: `${target.replace(/\.[^.]+$/, '')}.${format}`,
        error: null
      }))
    },
    convertRun: async (target, format) => {
      await new Promise((resolve) => window.setTimeout(resolve, 450))
      return { ok: true, output: `${target.replace(/\.[^.]+$/, '')}.${format}`, error: null }
    },
    checkUpdates: async () => ({
      checkedAt: Date.now(),
      current: '1.0.0',
      latest: '1.0.0',
      available: false,
      notes: null,
      url: null,
      error: null
    }),
    displays: async () => [{ id: 1, label: 'Built-in display', primary: true }],
    openExternal: () => undefined,
    pathForFile: (file) => file.name,
    quit: () => undefined,
    onMedia: () => () => undefined,
    onSystem: () => () => undefined,
    onCapabilities: () => () => undefined,
    onHover: () => () => undefined,
    onForceCollapse: () => () => undefined,
    onFocusRequest: () => () => undefined,
    onNotification: (listener) => {
      const timer = window.setTimeout(() => {
        listener({
          id: 'demo-question',
          kind: 'permission',
          title: 'Allow the assistant to run a build?',
          detail: 'Questions and permission prompts from tools land right here in the notch.',
          source: 'agent',
          actions: [
            { id: 'allow', label: 'Allow', style: 'primary' },
            { id: 'later', label: 'Not now' }
          ],
          createdAt: Date.now(),
          timeoutMs: 0
        })
      }, 1500)
      return () => window.clearTimeout(timer)
    },
    onNotificationClose: () => () => undefined,
    onHome: () => () => undefined,
    copyText: () => undefined,
    onAgentLinkReply: (listener) => {
      agentLinkReply.add(listener)
      return () => agentLinkReply.delete(listener)
    },
    onAgentDelta: (listener) => {
      agentDelta.add(listener)
      return () => agentDelta.delete(listener)
    },
    onAgentDone: (listener) => {
      agentDone.add(listener)
      return () => agentDone.delete(listener)
    },
    onAgentError: (listener) => {
      agentError.add(listener)
      return () => agentError.delete(listener)
    }
  }

  return api
}
