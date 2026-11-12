import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useApp } from '../state'
import CollapsedBar from './CollapsedBar'
import NotificationCard from './NotificationCard'
import { CloseIcon } from './Icons'
import Panel from './Panel'

/** Gap the toast wrapper keeps above and below its cards. */
const TOAST_PADDING = 22
/** Notifications are a queue: the card on top is answered first. */
export default function Island() {
  const {
    api,
    mode,
    ready,
    setPointerHover,
    demo,
    notifications,
    activeNotification,
    answerNotification
  } = useApp()
  const stackRef = useRef<HTMLDivElement | null>(null)
  const [toastHeight, setToastHeight] = useState(96)
  const [capHeight, setCapHeight] = useState(0)

  // The toast is only as tall as its contents: one card takes a sliver, extra
  // notifications fill the space that a fixed height used to waste.
  useLayoutEffect(() => {
    if (mode !== 'toast') return
    const node = stackRef.current
    if (!node) return

    const report = (): void => {
      const rows = [...node.children] as HTMLElement[]
      const first = rows[0]?.offsetHeight ?? 0
      const second = rows[1]?.offsetHeight ?? 0
      // One card keeps the toast tight, a second is allowed to grow it, and from
      // the third on the height holds still and the stack scrolls instead.
      const cap = second > 0 ? first + 5 + second : 0
      setCapHeight(cap)
      const natural = node.getBoundingClientRect().height
      const next = Math.ceil(cap > 0 ? Math.min(natural, cap) : natural) + TOAST_PADDING
      setToastHeight(next)
      api.setToastHeight(next)
    }

    report()
    const observer = new ResizeObserver(report)
    observer.observe(node)
    return () => observer.disconnect()
  }, [api, mode, notifications.length])

  // Every queued notification is a scrollable row; no "+n more" needed.
  const later = notifications.slice(1)

  return (
    <div
      className={`island is-${mode} ${ready ? 'is-ready' : 'is-booting'} ${demo ? 'is-demo' : ''}`}
      style={{ '--toast-h': `${toastHeight}px` } as CSSProperties}
      onPointerEnter={() => setPointerHover(true)}
      onPointerLeave={() => setPointerHover(false)}
    >
      <div className={`layer layer-pill ${mode === 'pill' ? '' : 'is-hidden'}`} aria-hidden={mode !== 'pill'}>
        <CollapsedBar />
      </div>
      <div
        className={`layer layer-toast ${mode === 'toast' ? '' : 'is-hidden'}`}
        aria-hidden={mode !== 'toast'}
        aria-live="polite"
      >
        {activeNotification ? (
          <div className="toast-wrap">
            <div
              className="toast-stack"
              ref={stackRef}
              style={capHeight > 0 ? { maxHeight: capHeight } : undefined}
            >
              <NotificationCard
                key={activeNotification.id}
                notification={activeNotification}
                compact
                onAction={(actionId) => answerNotification(activeNotification.id, actionId)}
                onDismiss={() => answerNotification(activeNotification.id, null)}
              />
              {later.map((item) => (
                <div className="note-mini" key={item.id}>
                  <span className="note-mini-title">{item.title}</span>
                  <button
                    type="button"
                    className="note-mini-close"
                    title="Dismiss"
                    onClick={() => answerNotification(item.id, null)}
                  >
                    <CloseIcon size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className={`layer layer-panel ${mode === 'panel' ? '' : 'is-hidden'}`} aria-hidden={mode !== 'panel'}>
        <Panel />
      </div>
    </div>
  )
}
