import { useApp } from '../state'
import { clockTime, countdown } from '../lib/format'
import { NoticeInline } from './NoticeBar'
import Cat from './Cat'

export default function CollapsedBar() {
  const { now, settings, media, state, notice } = useApp()
  const playing = media.active && media.status === 'playing'
  const timerRunning = state.focus.running

  if (notice) {
    return (
      <div className="pill">
        <NoticeInline notice={notice} />
      </div>
    )
  }

  return (
    <div className="pill">
      <div className="pill-main">
        <Cat size={15} />
        <span className="pill-time">{clockTime(new Date(now), settings.general.showSeconds)}</span>
        {timerRunning ? (
          <span className="pill-timer">
            <span className="pill-timer-dot" />
            {countdown(state.focus.endsAt ? state.focus.endsAt - now : state.focus.remainingMs)}
          </span>
        ) : null}
        {playing ? (
          <span className="eq" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        ) : null}
      </div>
    </div>
  )
}
