import { useEffect, useState, type CSSProperties } from 'react'
import { useApp } from '../state'
import { todayKey, type UsageDay } from '../../../shared/types'
import {
  CAT_NAME,
  CURRENCY,
  PAWS_PER_LEVEL,
  STREAK_GOAL,
  levelFor,
  streakFor,
  treatsToNextLevel
} from '../../../shared/motivation'
import { describeWeather } from '../../../shared/weather'
import { useWeather } from '../hooks/useWeather'
import { PauseIcon, PlayIcon } from './Icons'
import Cat from './Cat'

function hm(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${`${minutes % 60}`.padStart(2, '0')}m`
}

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${`${minutes}`.padStart(2, '0')}:${`${seconds}`.padStart(2, '0')}`
}

function shortName(name: string): string {
  const clean = name.replace(/\.exe$/i, '')
  return clean.length > 22 ? `${clean.slice(0, 21)}…` : clean
}

function Ring({ label, value }: { label: string; value: number | null }) {
  const percent = value === null ? 0 : Math.min(100, Math.max(0, Math.round(value)))
  return (
    <div className="home-ring">
      <div className="home-ring-dial" style={{ '--fill': `${percent * 3.6}deg` } as CSSProperties}>
        <span className="home-ring-value">{value === null ? '–' : `${percent}%`}</span>
      </div>
      <span className="home-ring-label">{label}</span>
    </div>
  )
}

function Bars({ usage }: { usage: UsageDay }) {
  // The last nine hours are enough context for a card this size.
  const end = new Date().getHours()
  const slices = Array.from({ length: 9 }, (_, index) => {
    const hour = (end - 8 + index + 24) % 24
    return { hour, seconds: usage.hours[hour] ?? 0 }
  })
  const peak = Math.max(1, ...slices.map((slice) => slice.seconds))
  return (
    <div className="home-bars" aria-hidden="true">
      {slices.map((slice) => (
        <span
          key={slice.hour}
          className={slice.hour === end ? 'is-now' : undefined}
          style={{ height: `${Math.max(8, Math.round((slice.seconds / peak) * 100))}%` }}
        />
      ))}
    </div>
  )
}

export default function HomeTab() {
  const { state, system, setView, api, focusRemaining, focusTotal, startFocus, pauseFocus, motivationPulse } =
    useApp()
  const weather = useWeather()
  const weatherInfo = weather ? describeWeather(weather.code, weather.isDay) : null

  const usage: UsageDay = state.usage.day === todayKey() ? state.usage : { ...state.usage, total: 0, apps: [] }
  const topApp = usage.apps[0] ?? null
  const clipboard = state.clipboard.slice(0, 2)
  const openTasks = state.tasks.filter((task) => !task.done)
  const focusRunning = state.focus.running && (state.focus.endsAt ?? 0) > Date.now()
  const focusPercent = focusTotal > 0 ? Math.min(100, Math.round(((focusTotal - focusRemaining) / focusTotal) * 100)) : 0

  const motivation = state.motivation
  const level = levelFor(motivation.treats)
  const doneToday = motivation.days[todayKey()] ?? 0
  const streak = streakFor(motivation.days)
  const best = Math.max(motivation.best, streak)
  const toNext = treatsToNextLevel(motivation.treats)
  const goalPercent = Math.min(100, Math.round((doneToday / STREAK_GOAL) * 100))

  // The cat reacts to the most recent treat: a bite, or a burst on a level-up.
  const [bite, setBite] = useState<{ seq: number; kind: 'treat' | 'level' } | null>(null)
  useEffect(() => {
    if (!motivationPulse) return
    // A pulse older than this was earned while Home was closed; do not replay it.
    if (Date.now() - motivationPulse.at > 1600) return
    setBite({ seq: motivationPulse.seq, kind: motivationPulse.kind })
    const timer = window.setTimeout(() => setBite(null), motivationPulse.kind === 'level' ? 1250 : 640)
    return () => window.clearTimeout(timer)
  }, [motivationPulse])

  return (
    <div className="view view-home">
      <div className="home-grid">
        <section className="home-card">
          <div className="home-card-head">
            <span className="home-label">Screen time</span>
            <span className="home-meta">today</span>
          </div>
          <div className="home-screen">
            <div>
              <div className="home-big">{usage.total > 0 ? hm(usage.total) : '—'}</div>
              <div className="home-sub">
                {topApp ? `${shortName(topApp.name)} · ${hm(topApp.seconds)}` : 'Counted while Notcha is open'}
              </div>
            </div>
            <Bars usage={usage} />
          </div>
        </section>

        <section className="home-card">
          <div className="home-card-head">
            <span className="home-label">System</span>
          </div>
          <div className="home-rings">
            <Ring label="CPU" value={system.cpu} />
            <Ring label="RAM" value={system.ram} />
            <Ring label="DISK" value={system.disk} />
          </div>
        </section>

        <section className="home-card">
          <div className="home-card-head">
            <span className="home-label">Weather</span>
          </div>
          {weather ? (
            <div className="home-weather">
              <div className="home-temp">
                {weather.temperature}°
                <span className="weather-glyph home-weather-glyph">
                  {weatherInfo?.icon === 'sun' ? '☀' : weatherInfo?.icon === 'moon' ? '☾' : '⛅'}
                </span>
              </div>
              <div className="home-sub">
                {weatherInfo?.label ?? '—'} · {weather.place}
              </div>
              <div className="home-meta">
                H {weather.high}° L {weather.low}°
              </div>
            </div>
          ) : (
            <div className="home-sub">Weather is off</div>
          )}
        </section>

        <section className="home-card">
          <div className="home-card-head">
            <span className="home-label">Focus</span>
            <span className="home-meta">{state.focus.mode === 'work' ? 'work' : 'break'}</span>
          </div>
          <div className="home-focus">
            <div>
              <div className="home-big">{clock(focusRemaining)}</div>
              <div className="home-sub">{focusRunning ? 'Focusing' : 'Paused'}</div>
            </div>
            <button
              type="button"
              className="home-round"
              title={focusRunning ? 'Pause focus' : 'Start focus'}
              onClick={() => (focusRunning ? pauseFocus() : startFocus())}
            >
              {focusRunning ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
            </button>
          </div>
          <div className="home-progress">
            <span style={{ width: `${Math.max(3, focusPercent)}%` }} />
          </div>
        </section>

        <section className="home-card">
          <div className="home-card-head">
            <span className="home-label">Clipboard</span>
            <span className="home-meta">{state.clipboard.length}</span>
          </div>
          <div className="home-clips">
            {clipboard.length === 0 ? <div className="home-sub">Nothing copied yet</div> : null}
            {clipboard.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="home-clip"
                title="Copy again"
                onClick={() => api.copyText(entry.text)}
              >
                <span className="home-clip-text">{entry.text.replace(/\s+/g, ' ').slice(0, 46)}</span>
                <span className="home-clip-time">
                  {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="home-card home-streak">
          <div className="home-card-head">
            <span className="home-label">Streak</span>
            <button type="button" className="home-link" onClick={() => setView('tasks')}>
              {openTasks.length} open
            </button>
          </div>
          <div className="streak-body">
            <div
              className={`streak-cat${bite ? ' is-chomp' : ''}${bite?.kind === 'level' ? ' is-levelup' : ''}`}
              title={`${CAT_NAME}, level ${level}`}
            >
              <span className="streak-cat-avatar">
                <Cat size={28} mood={doneToday > 0 ? 'alert' : 'idle'} />
              </span>
              <span className={`streak-level${bite?.kind === 'level' ? ' is-pop' : ''}`}>Lv {level}</span>
              {bite ? (
                <span className="streak-bite" key={bite.seq} aria-hidden="true">
                  🍪
                </span>
              ) : null}
              {bite?.kind === 'level' ? (
                <span className="streak-burst" key={`burst-${bite.seq}`} aria-hidden="true">
                  {Array.from({ length: 8 }, (_, index) => {
                    const angle = (index / 8) * Math.PI * 2
                    return (
                      <i
                        key={index}
                        style={
                          {
                            '--dx': `${Math.round(Math.cos(angle) * 17)}px`,
                            '--dy': `${Math.round(Math.sin(angle) * 17)}px`
                          } as CSSProperties
                        }
                      />
                    )
                  })}
                  <b className="streak-ring" />
                  <b className="streak-paws-float">+{PAWS_PER_LEVEL} 🐾</b>
                </span>
              ) : null}
            </div>
            <div className="streak-copy">
              <div className="streak-line">
                <span className="streak-count">{doneToday}</span>
                <span className="streak-of">of {STREAK_GOAL} tasks today</span>
              </div>
              <div className="home-progress">
                <span style={{ width: `${Math.max(4, goalPercent)}%` }} />
              </div>
              <div className="home-meta">
                {streak > 0 ? `${streak}-day streak` : 'Clear 3 tasks to start a streak'} · best {best}
              </div>
            </div>
          </div>
          <div className="streak-foot">
            <span className="streak-treats">
              {CAT_NAME} needs {toNext} {toNext === 1 ? 'treat' : 'treats'}
            </span>
            <span className="streak-paws">
              🐾 {motivation.paws} {CURRENCY}
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}
