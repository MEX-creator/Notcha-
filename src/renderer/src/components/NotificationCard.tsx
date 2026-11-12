import type { NotchNotification } from '../../../shared/types'
import { CloseIcon } from './Icons'

const GLYPHS: Record<NotchNotification['kind'], string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  timer: '◷',
  agent: '✦',
  question: '?',
  permission: '⚿'
}

export default function NotificationCard({
  notification,
  compact = false,
  onAction,
  onDismiss
}: {
  notification: NotchNotification
  compact?: boolean
  onAction: (actionId: string) => void
  onDismiss: () => void
}) {
  const { actions } = notification

  return (
    <div
      className={`note-card is-${notification.kind}${compact ? ' is-compact' : ''}${
        actions.length === 0 ? ' is-passive' : ''
      }`}
      onClick={actions.length === 0 ? onDismiss : undefined}
      role={actions.length === 0 ? 'button' : undefined}
      tabIndex={actions.length === 0 ? 0 : undefined}
      onKeyDown={
        actions.length === 0
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') onDismiss()
            }
          : undefined
      }
    >
      <span className="note-icon" aria-hidden="true">
        {GLYPHS[notification.kind] ?? '•'}
      </span>
      <div className="note-copy">
        <div className="note-title">{notification.title}</div>
        {notification.detail ? <div className="note-detail">{notification.detail}</div> : null}
        {actions.length > 0 ? (
          <div className="note-actions">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={`note-btn is-${action.style ?? 'default'}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onAction(action.id)
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {notification.source ? <span className="note-source">{notification.source}</span> : null}
      <button
        type="button"
        className="note-close"
        title="Dismiss"
        onClick={(event) => {
          event.stopPropagation()
          onDismiss()
        }}
      >
        <CloseIcon size={11} />
      </button>
    </div>
  )
}
