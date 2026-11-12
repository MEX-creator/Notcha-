import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  AgentChannel,
  AgentLinkReply,
  AgentStatus,
  AgentStreamEvent,
  AgentTurn,
  AppState,
  Bootstrap,
  CalendarEvent,
  Capabilities,
  ClipboardEntry,
  DisplayInfo,
  GoogleStatus,
  GoogleTask,
  IslandApi,
  IslandMode,
  LyricsPayload,
  NotchNotification,
  MediaState,
  Settings,
  SystemState,
  UpdateResult,
  UsageDay,
  WeatherNow
} from '../shared/types'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: IslandApi = {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap') as Promise<Bootstrap>,
  media: (command, value) => ipcRenderer.send('media:command', command, value),
  setExpanded: (expanded) => ipcRenderer.send('window:expanded', expanded),
  setMode: (mode: IslandMode) => ipcRenderer.send('window:mode', mode),
  setTyping: (typing) => ipcRenderer.send('island:typing', Boolean(typing)),
  activate: () => ipcRenderer.send('island:activate'),
  setBusy: (busy) => ipcRenderer.send('island:busy', Boolean(busy)),
  setHold: (open) => ipcRenderer.send('island:hold', Boolean(open)),
  setToastHeight: (height) => ipcRenderer.send('island:toast-height', Number(height)),
  setPanelHeight: (height) => ipcRenderer.send('island:panel-height', Number(height)),
  reportIsland: () => {
    /* the main process owns the island geometry */
  },
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch) as Promise<Settings>,
  updateState: (patch) => ipcRenderer.invoke('state:update', patch) as Promise<AppState>,
  getSettings: () => ipcRenderer.invoke('settings:get') as Promise<Settings>,
  lyrics: (track) => ipcRenderer.invoke('lyrics:get', track) as Promise<LyricsPayload | null>,
  weather: (force) => ipcRenderer.invoke('weather:get', Boolean(force)) as Promise<WeatherNow | null>,
  geocode: (place) =>
    ipcRenderer.invoke('weather:geocode', place) as Promise<
      { name: string; latitude: number; longitude: number }[]
    >,
  googleStatus: () => ipcRenderer.invoke('google:status') as Promise<GoogleStatus>,
  googleConnect: () => ipcRenderer.invoke('google:connect') as Promise<GoogleStatus>,
  googleDisconnect: () => ipcRenderer.invoke('google:disconnect') as Promise<GoogleStatus>,
  calendar: () =>
    ipcRenderer.invoke('google:calendar') as Promise<{ events: CalendarEvent[]; error: string | null }>,
  googleTasks: () =>
    ipcRenderer.invoke('google:tasks') as Promise<{
      tasks: GoogleTask[]
      lists: { id: string; title: string }[]
      error: string | null
    }>,
  googleAddTask: (title, listId) =>
    ipcRenderer.invoke('google:add-task', title, listId) as Promise<{ ok: boolean; error: string | null }>,
  googleSetTask: (listId, taskId, done) =>
    ipcRenderer.invoke('google:set-task', listId, taskId, done) as Promise<{
      ok: boolean
      error: string | null
    }>,
  googleDeleteTask: (listId, taskId) =>
    ipcRenderer.invoke('google:delete-task', listId, taskId) as Promise<{
      ok: boolean
      error: string | null
    }>,
  agentStatus: () => ipcRenderer.invoke('agent:status') as Promise<AgentStatus>,
  agentSetKey: (key) => ipcRenderer.invoke('agent:set-key', key) as Promise<AgentStatus>,
  agentSetChannel: (channel) => ipcRenderer.invoke('agent:set-channel', channel) as Promise<AgentStatus>,
  agentClearKey: () => ipcRenderer.invoke('agent:clear-key') as Promise<AgentStatus>,
  agentSend: (requestId, turns: AgentTurn[], context: string) =>
    ipcRenderer.send('agent:send', requestId, turns, context),
  agentCancel: (requestId) => ipcRenderer.send('agent:cancel', requestId),
  agentLinkSend: (text) =>
    ipcRenderer.invoke('agent:link-send', text) as Promise<{ ok: boolean; pending?: number }>,
  notifyAnswer: (id, actionId) => ipcRenderer.send('notify:answer', id, actionId),
  copyText: (text) => ipcRenderer.send('clipboard:copy', text),
  shelfAdd: () => ipcRenderer.invoke('shelf:add') as Promise<AppState>,
  shelfAddPaths: (paths) => ipcRenderer.invoke('shelf:add-paths', paths) as Promise<AppState>,
  shelfRemove: (id) => ipcRenderer.invoke('shelf:remove', id) as Promise<AppState>,
  shelfOpen: (target) => ipcRenderer.send('shelf:open', target),
  shelfReveal: (target) => ipcRenderer.send('shelf:reveal', target),
  convertPlan: (target) =>
    ipcRenderer.invoke('convert:plan', target) as Promise<{
      kind: 'image' | 'audio' | 'video' | 'unknown'
      targets: { id: string; label: string }[]
    }>,
  convertPlanMany: (paths) =>
    ipcRenderer.invoke('convert:plan-many', paths) as Promise<{
      kind: 'image' | 'audio' | 'video' | 'unknown'
      targets: { id: string; label: string }[]
    }>,
  convertBatch: (paths, format, options) =>
    ipcRenderer.invoke('convert:batch', paths, format, options) as Promise<
      { path: string; ok: boolean; output: string | null; error: string | null }[]
    >,
  convertRun: (target, format, options) =>
    ipcRenderer.invoke('convert:run', target, format, options) as Promise<{
      ok: boolean
      output: string | null
      error: string | null
    }>,
  checkUpdates: () => ipcRenderer.invoke('updates:check') as Promise<UpdateResult>,
  displays: () => ipcRenderer.invoke('app:displays') as Promise<DisplayInfo[]>,
  openExternal: (url) => ipcRenderer.send('app:open-external', url),
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  quit: () => ipcRenderer.send('app:quit'),
  onMedia: (listener) => subscribe<MediaState>('media:update', listener),
  onSystem: (listener) => subscribe<SystemState>('system:update', listener),
  onCapabilities: (listener) => subscribe<Capabilities>('capabilities:update', listener),
  onHover: (listener) => subscribe<boolean>('hover:inside', listener),
  onForceCollapse: (listener) => subscribe<void>('island:force-collapse', () => listener()),
  onFocusRequest: (listener) => subscribe<string>('view:open', listener),
  onNotification: (listener) => subscribe<NotchNotification>('notify:show', listener),
  onNotificationClose: (listener) => subscribe<string>('notify:close', listener),
  onAgentLinkReply: (listener) => subscribe<AgentLinkReply>('agent:link-reply', listener),
  onAgentDelta: (listener) => subscribe<AgentStreamEvent>('agent:delta', listener),
  onAgentDone: (listener) => subscribe<AgentStreamEvent>('agent:done', listener),
  onAgentError: (listener) =>
    subscribe<{ requestId: string; message: string }>('agent:error', listener),
  onHome: (listener) =>
    subscribe<{ usage: UsageDay; clipboard: ClipboardEntry[] }>('home:update', listener)
}

contextBridge.exposeInMainWorld('island', api)
