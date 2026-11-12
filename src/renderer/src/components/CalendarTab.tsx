import { useMemo, useState } from 'react'
import type { CalendarEvent } from '../../../shared/types'
import { describeWeather } from '../../../shared/weather'
import { useApp } from '../state'
import { useWeather } from '../hooks/useWeather'
import { clockTime, dayLabel } from '../lib/format'
import { Button, EmptyState, SectionLabel, Spinner } from './ui'
import { CalendarIcon, RefreshIcon } from './Icons'

interface Group {
  key: string
  label: string
  events: CalendarEvent[]
}

export default function CalendarTab() {
  const { api, google, setGoogle, setView, settings, calendarEvents, calendarError, calendarLoading, refreshCalendar } =
    useApp()
  const weather = useWeather()
  const [connecting, setConnecting] = useState(false)

  const connect = async (): Promise<void> => {
    setConnecting(true)
    try {
      const status = await api.googleConnect()
      setGoogle(status)
    } finally {
      setConnecting(false)
    }
  }

  const groups = useMemo<Group[]>(() => {
    const buckets = new Map<string, Group>()
    for (const event of calendarEvents) {
      const date = new Date(event.start)
      if (Number.isNaN(date.getTime())) continue
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
      const label = dayLabel(event.start)
      const existing = buckets.get(key)
      if (existing) existing.events.push(event)
      else buckets.set(key, { key, label, events: [event] })
    }
    return [...buckets.values()].sort((a, b) => {
      const first = a.events[0]
      const second = b.events[0]
      if (!first || !second) return 0
      return new Date(first.start).getTime() - new Date(second.start).getTime()
    })
  }, [calendarEvents])

  const weatherInfo = weather ? describeWeather(weather.code, weather.isDay) : null

  return (
    <div className="view view-calendar">
      {settings.weather.enabled && weather && weatherInfo ? (
        <div className="weather-card">
          <div className="weather-main">
            <span className="weather-temp">
              {weather.temperature}
              <em>°{weather.unit}</em>
            </span>
            <div className="weather-copy">
              <span className="weather-label">{weatherInfo.label}</span>
              <span className="weather-place">{weather.place}</span>
            </div>
          </div>
          <div className="weather-stats">
            <span>
              H {weather.high}° · L {weather.low}°
            </span>
            <span>{weather.humidity}% humidity</span>
            <span>{weather.wind} km/h</span>
          </div>
        </div>
      ) : null}

      {!google.configured ? (
        <EmptyState
          icon={<CalendarIcon size={24} />}
          title="Connect your calendar"
          detail="Add a Google OAuth client ID in Settings to see your events and tasks. Notcha only reads your calendar."
        >
          <Button variant="primary" onClick={() => setView('settings')}>
            Open settings
          </Button>
        </EmptyState>
      ) : !google.connected ? (
        <EmptyState
          icon={<CalendarIcon size={24} />}
          title="Google isn't connected"
          detail="Sign in once and Notcha will keep your next week of events here. Nothing is stored on a server."
        >
          <Button variant="primary" onClick={() => void connect()} disabled={connecting}>
            {connecting ? 'Waiting for browser…' : 'Connect Google'}
          </Button>
          {google.error ? <p className="form-error">{google.error}</p> : null}
        </EmptyState>
      ) : calendarLoading && calendarEvents.length === 0 ? (
        <div className="centered">
          <Spinner size={18} />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<CalendarIcon size={24} />}
          title="Nothing scheduled"
          detail="Your next seven days are clear."
        />
      ) : (
        <div className="calendar-scroll">
          {calendarError ? <p className="form-error">{calendarError}</p> : null}
          {groups.map((group) => (
            <div key={group.key} className="event-group">
              <SectionLabel
                trailing={
                  group === groups[0] ? (
                    <button
                      type="button"
                      className="icon-btn tiny"
                      title="Refresh"
                      onClick={() => refreshCalendar()}
                    >
                      <RefreshIcon size={13} />
                    </button>
                  ) : null
                }
              >
                {group.label}
              </SectionLabel>
              {group.events.map((event) => (
                <div className="event" key={`${event.id}-${event.start}`}>
                  <span className="event-time">
                    {event.allDay ? 'All day' : clockTime(new Date(event.start))}
                  </span>
                  <div className="event-body">
                    <span className="event-title">{event.title}</span>
                    <span className="event-meta">
                      {event.calendarName}
                      {event.location ? ` · ${event.location}` : ''}
                    </span>
                  </div>
                  <span
                    className="event-dot"
                    style={{ background: event.color ?? 'rgba(255,255,255,0.35)' }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
