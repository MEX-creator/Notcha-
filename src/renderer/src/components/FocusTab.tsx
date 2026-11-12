import { useApp } from '../state'
import { countdown } from '../lib/format'
import { Button, Ring } from './ui'
import { ResetIcon, SkipIcon } from './Icons'

export default function FocusTab() {
  const { state, focusRemaining, focusTotal, startFocus, pauseFocus, resetFocus, skipFocus, settings } = useApp()
  const focus = state.focus
  const progress = focusTotal > 0 ? 1 - focusRemaining / focusTotal : 0
  const running = focus.running

  const modeLabel =
    focus.mode === 'work' ? 'Focus session' : focus.mode === 'long' ? 'Long break' : 'Short break'
  const statusLabel = running ? 'remaining' : focusRemaining < focusTotal ? 'paused' : 'ready'

  return (
    <div className="view view-focus">
      <div className="focus-head">
        <span className="focus-mode">{modeLabel}</span>
        <span className="focus-round">
          {focus.completed} {focus.completed === 1 ? 'session' : 'sessions'} today
        </span>
      </div>

      <Ring progress={progress} size={148} thickness={5}>
        <span className="focus-time">{countdown(focusRemaining)}</span>
        <span className="focus-status">{statusLabel}</span>
      </Ring>

      <div className="focus-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={resetFocus}
          title="Reset timer"
        >
          <ResetIcon size={16} />
        </button>
        <Button variant="primary" onClick={running ? pauseFocus : startFocus}>
          {running ? 'Pause' : focusRemaining < focusTotal ? 'Resume' : 'Start focus'}
        </Button>
        <button type="button" className="icon-btn" onClick={skipFocus} title="Skip to next phase">
          <SkipIcon size={16} />
        </button>
      </div>

      <div className="focus-plan">
        <div>
          <strong>{settings.focus.workMinutes} min</strong>
          <span>focus</span>
        </div>
        <div>
          <strong>{settings.focus.breakMinutes} min</strong>
          <span>break</span>
        </div>
        <div>
          <strong>{settings.focus.longBreakMinutes} min</strong>
          <span>long break</span>
        </div>
      </div>

      <p className="hint">
        {settings.focus.autoContinue
          ? 'Sessions continue automatically.'
          : 'Durations, long-break rhythm and auto-continue are in Settings.'}
      </p>
    </div>
  )
}
