"""Wires the motivation economy, theme store, calendar refresh and faster motion."""
import io

ROOT = r'C:\Users\Dell\.config\freebuff-desktop\local-projects\cb5b8d9e-690a-4822-9ea3-43f4bffe5d7c\\'


def patch(path, edits, append=None):
    full = ROOT + path
    data = io.open(full, 'rb').read()
    # Files in this repo are not consistently CRLF, so match with each file's
    # own dominant line ending instead of assuming one.
    crlf = data.count(b'\r\n')
    lf = data.count(b'\n') - crlf
    eol = '\r\n' if crlf > lf else '\n'

    def to_bytes(text):
        return text.replace('\n', eol).encode('utf-8')

    for old, _new in edits:
        count = data.count(to_bytes(old))
        assert count == 1, f'{path} [{eol!r}]: anchor count {count} for {old[:80]!r}'
    for old, new in edits:
        data = data.replace(to_bytes(old), to_bytes(new), 1)
    if append:
        data += to_bytes(append)
    io.open(full, 'wb').write(data)
    print('patched', path, f'({len(edits)} edits{", append" if append else ""}, eol={eol!r})')


# ------------------------------------------------------------------ state.tsx
patch('src/renderer/src/state.tsx', [
    (
        """  updateState: (patch: Partial<AppState>) => Promise<void>""",
        """  updateState: (patch: Partial<AppState>) => Promise<void>
  /** Task changes go through here so a completed task can pay the cat. */
  saveTasks: (tasks: Task[]) => void
  /** Buys a theme with Paws, or switches to it when it is already owned. */
  buyTheme: (id: string) => boolean
  applyTheme: (id: string) => void"""
    ),
    (
        """  type SystemState,
  type ViewId
} from '../../shared/types'""",
        """  type SystemState,
  type Task,
  type ViewId
} from '../../shared/types'
import { CAT_NAME, CURRENCY, creditTasks, levelFor, treatsToNextLevel } from '../../shared/motivation'
import { themeById } from '../../shared/themes'"""
    ),
    (
        """  const resetWater = useCallback(() => {""",
        """  /**
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

  // The active theme paints the island through the same variables the glass uses.
  useEffect(() => {
    const theme = themeById(state.themes.active)
    const root = document.documentElement
    root.style.setProperty('--accent', theme.accent)
    root.style.setProperty('--accent-2', theme.accent2)
    root.style.setProperty('--glass', theme.tint)
  }, [state.themes.active])

  const resetWater = useCallback(() => {"""
    ),
    (
        """    updateState,
    now,""",
        """    updateState,
    saveTasks,
    buyTheme,
    applyTheme,
    now,"""
    )
])

# ------------------------------------------------------------------ TasksTab
patch('src/renderer/src/components/TasksTab.tsx', [
    (
        """  const { api, state, updateState, google, setView } = useApp()""",
        """  const { api, state, saveTasks, google, setView } = useApp()"""
    ),
    (
        """    await updateState({
      tasks: [{ id: uid(), text: value.slice(0, 300), done: false, createdAt: Date.now(), due: null }, ...state.tasks]
    })""",
        """    saveTasks([
      { id: uid(), text: value.slice(0, 300), done: false, createdAt: Date.now(), due: null },
      ...state.tasks
    ])"""
    ),
    (
        """  const toggleLocal = (id: string): void => {
    void updateState({
      tasks: state.tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task))
    })
  }

  const removeLocal = (id: string): void => {
    void updateState({ tasks: state.tasks.filter((task) => task.id !== id) })
  }""",
        """  const toggleLocal = (id: string): void => {
    saveTasks(state.tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)))
  }

  const removeLocal = (id: string): void => {
    saveTasks(state.tasks.filter((task) => task.id !== id))
  }"""
    )
])

# --------------------------------------------------------------- SettingsView
patch('src/renderer/src/components/SettingsView.tsx', [
    (
        """import { DEFAULT_SETTINGS, type DisplayInfo, type UpdateResult } from '../../../shared/types'""",
        """import { DEFAULT_SETTINGS, type DisplayInfo, type UpdateResult } from '../../../shared/types'
import { CAT_NAME, CURRENCY, TREATS_PER_LEVEL } from '../../../shared/motivation'
import { THEMES } from '../../../shared/themes'"""
    ),
    (
        """  const { api, settings, updateSettings, google, setGoogle, agent, setAgent, version, demo, capabilities } =
    useApp()""",
        """  const {
    api,
    settings,
    updateSettings,
    google,
    setGoogle,
    agent,
    setAgent,
    version,
    demo,
    capabilities,
    state,
    buyTheme,
    applyTheme
  } = useApp()"""
    ),
    (
        """        <SectionLabel>Privacy</SectionLabel>""",
        """        <SectionLabel>Theme store</SectionLabel>
        <div className="store-head">
          <span className="store-balance">
            🐾 {state.motivation.paws} {CURRENCY}
          </span>
          <span className="setting-detail">
            Earned when {CAT_NAME} levels up — {TREATS_PER_LEVEL} treats per level, one treat per task done.
          </span>
        </div>
        <div className="theme-grid">
          {THEMES.map((theme) => {
            const owned = state.themes.owned.includes(theme.id)
            const active = state.themes.active === theme.id
            const afford = state.motivation.paws >= theme.price
            return (
              <div key={theme.id} className={`theme-card ${active ? 'is-active' : ''}`} data-theme-id={theme.id}>
                <span
                  className="theme-swatch"
                  style={{ background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})` }}
                />
                <div className="theme-copy">
                  <span className="theme-name">{theme.name}</span>
                  <span className="theme-note">{theme.note}</span>
                </div>
                {active ? (
                  <span className="theme-state">In use</span>
                ) : owned ? (
                  <Button variant="ghost" onClick={() => applyTheme(theme.id)}>
                    Use
                  </Button>
                ) : (
                  <Button variant="primary" disabled={!afford} onClick={() => buyTheme(theme.id)}>
                    🐾 {theme.price}
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        <SectionLabel>Privacy</SectionLabel>"""
    )
])

# --------------------------------------------------------------- CalendarTab
patch('src/renderer/src/components/CalendarTab.tsx', [
    (
        """  useEffect(() => {
    void load()
  }, [load])""",
        """  useEffect(() => {
    void load()
  }, [load])

  // The calendar keeps itself current: a slow refresh while the tab is open, and
  // an immediate one whenever the user comes back to the notch.
  useEffect(() => {
    if (!google.connected) return
    const timer = window.setInterval(() => void load(), 5 * 60_000)
    const onSurface = (): void => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onSurface)
    window.addEventListener('focus', onSurface)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onSurface)
      window.removeEventListener('focus', onSurface)
    }
  }, [google.connected, load])"""
    )
])

# ------------------------------------------------------------------- Panel
patch('src/renderer/src/components/Panel.tsx', [
    (
        """const SLIDE_HOLD = 0.022
const SLIDE_HOLD_MAX = 0.09""",
        """const SLIDE_HOLD = 0.014
const SLIDE_HOLD_MAX = 0.06"""
    )
])

# --------------------------------------------------------------- styles.css
NEW_CSS = """
/* ------------------------------------------------------------ streak card */

.home-streak {
  gap: 7px;
}

.streak-body {
  display: flex;
  align-items: center;
  gap: 10px;
}

.streak-cat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 11px;
  background: var(--surface);
  color: var(--accent);
}

.streak-level {
  font-size: 9.5px;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.streak-copy {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
  flex: 1 1 auto;
}

.streak-line {
  display: flex;
  align-items: baseline;
  gap: 5px;
}

.streak-count {
  font-size: 21px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.streak-of {
  font-size: 11px;
  color: var(--muted);
}

.streak-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 10.5px;
  color: var(--muted);
}

.streak-paws {
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

/* ----------------------------------------------------------- theme store */

.store-head {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 2px 0 8px;
}

.store-balance {
  font-size: 14px;
  font-weight: 600;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}

.theme-grid {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.theme-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid transparent;
  transition:
    background 130ms ease,
    border-color 130ms ease;
}

.theme-card.is-active {
  background: var(--surface-2);
  border-color: color-mix(in srgb, var(--accent) 55%, transparent);
}

.theme-swatch {
  width: 26px;
  height: 26px;
  border-radius: 9px;
  flex: 0 0 auto;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
}

.theme-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1 1 auto;
}

.theme-name {
  font-size: 12px;
  font-weight: 600;
}

.theme-note {
  font-size: 10.5px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-state {
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}

/* ------------------------------------------------------- tour connect step */

.welcome-connect {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 2px 2px 0;
}

.welcome-connect-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.welcome-connect input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 7px 9px;
  border-radius: 9px;
  border: 1px solid var(--hair);
  background: rgba(255, 255, 255, 0.05);
  color: var(--text);
  font-size: 11.5px;
}

.welcome-connect-ok {
  font-size: 11px;
  color: var(--accent);
}

.welcome-connect .form-error {
  font-size: 11px;
  color: var(--danger);
}
"""

patch('src/renderer/src/styles.css', [
    (
        """  --danger: #ff9a9a;""",
        """  --danger: #ff9a9a;
  /* The glass the island is poured from; a theme replaces it. */
  --glass: #07080a;"""
    ),
    (
        """  overflow: hidden;
  background: #07080a;""",
        """  overflow: hidden;
  background: var(--glass);"""
    ),
    (
        """  transition:
    width 380ms cubic-bezier(0.22, 1, 0.36, 1),
    height 380ms cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 380ms cubic-bezier(0.22, 1, 0.36, 1);""",
        """  transition:
    width 240ms cubic-bezier(0.22, 1, 0.36, 1),
    height 240ms cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 240ms cubic-bezier(0.22, 1, 0.36, 1);"""
    ),
    (
        """  transition:
    width 380ms cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 380ms cubic-bezier(0.22, 1, 0.36, 1);
}""",
        """  transition:
    width 240ms cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 240ms cubic-bezier(0.22, 1, 0.36, 1);
}"""
    ),
    (
        """  animation: island-in 460ms cubic-bezier(0.22, 1, 0.36, 1);""",
        """  animation: island-in 300ms cubic-bezier(0.22, 1, 0.36, 1);"""
    ),
    (
        """  transition: opacity 200ms ease;""",
        """  transition: opacity 130ms ease;"""
    ),
    (
        """  transition:
    opacity 240ms ease 70ms,
    visibility 0s linear 0s;""",
        """  transition:
    opacity 150ms ease 40ms,
    visibility 0s linear 0s;"""
    )
], append=NEW_CSS)

print('all patches applied')
