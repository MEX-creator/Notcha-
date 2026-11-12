import { useLayoutEffect, useRef, type ComponentType } from 'react'
import type { TabId } from '../../../shared/types'
import { useApp } from '../state'
import { titleDate } from '../lib/format'
import { NoticeBar } from './NoticeBar'
import NotificationCard from './NotificationCard'
import WelcomeTour from './WelcomeTour'
import {
  CalendarIcon,
  ChevronLeftIcon,
  CloseIcon,
  DropletIcon,
  GearIcon,
  HomeIcon,
  MusicIcon,
  ShelfIcon,
  SparkIcon,
  TasksIcon,
  TimerIcon,
  type IconProps
} from './Icons'
import HomeTab from './HomeTab'
import MediaTab from './MediaTab'
import CalendarTab from './CalendarTab'
import FocusTab from './FocusTab'
import WaterTab from './WaterTab'
import TasksTab from './TasksTab'
import ShelfTab from './ShelfTab'
import AgentTab from './AgentTab'
import SettingsView from './SettingsView'

/** `short` is what the active chip shows; `label` stays the tooltip. */
const TABS: { id: TabId; label: string; short: string; Icon: ComponentType<IconProps> }[] = [
  { id: 'home', label: 'Home', short: 'Home', Icon: HomeIcon },
  { id: 'media', label: 'Now playing', short: 'Music', Icon: MusicIcon },
  { id: 'calendar', label: 'Calendar', short: 'Calendar', Icon: CalendarIcon },
  { id: 'focus', label: 'Focus', short: 'Focus', Icon: TimerIcon },
  { id: 'water', label: 'Water', short: 'Water', Icon: DropletIcon },
  { id: 'tasks', label: 'Tasks', short: 'Tasks', Icon: TasksIcon },
  { id: 'shelf', label: 'Shelf', short: 'Shelf', Icon: ShelfIcon },
  { id: 'agent', label: 'Agent', short: 'Agent', Icon: SparkIcon }
]

/** Each icon the chip displaces holds still for this long before its turn comes,
 *  a little longer further out (capped), so the rail ripples outward. */
const SLIDE_HOLD = 0.014
const SLIDE_HOLD_MAX = 0.06

/** The rail is allowed to bounce a touch more than the glass. At the chip's own
 *  damping an icon crosses its slot by barely a pixel, which reads as an ease
 *  rather than a ripple, so the icons run slightly underdamped. */
const SLIDE_BOUNCE = 0.85

/** The pill's height; the notch springs open from here. Matches .island.is-pill. */
const PILL_HEIGHT = 32

interface GlideState {
  left: number
  width: number
  leftVelocity: number
  widthVelocity: number
}

/** Where a trailing icon is drawn, and where its slot has moved to. */
interface SlideState {
  x: number
  velocity: number
  target: number
  hold: number
}

export default function Panel() {
  const {
    api,
    ready,
    settings,
    view,
    setView,
    dismiss,
    notice,
    mode,
    now,
    media,
    activeNotification,
    answerNotification
  } = useApp()
  // One spring drives the chip, the notch height and the rail icons, so the
  // sliders in Settings retune all three at once.
  const { stiffness, damping } = settings.spring
  const iconDamping = damping * SLIDE_BOUNCE
  const settingsView = view === 'settings'
  const tourOpen = ready && !settings.general.welcomeSeen
  const heightPos = useRef<{ height: number; velocity: number } | null>(null)
  const heightTarget = useRef(0)
  const heightFrame = useRef(0)
  const heightLast = useRef(0)
  const collapsedHeight = useRef(PILL_HEIGHT)
  const lastMode = useRef(mode)
  const railRef = useRef<HTMLElement | null>(null)
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const slidePos = useRef<SlideState[]>([])
  const glideRef = useRef<HTMLSpanElement | null>(null)
  const glidePos = useRef<GlideState | null>(null)

  // The chip is one element that eases toward the selected tab, so switching
  // reads as the glass travelling rather than two boxes resizing in place.
  useLayoutEffect(() => {
    if (mode !== 'panel' || settingsView) return
    const rail = railRef.current
    const glide = glideRef.current
    const active = rail?.querySelector<HTMLElement>('.tab.is-active')
    // While the panel is collapsed the rail is hidden and measures as zero.
    if (!rail || !glide || !active || active.offsetWidth === 0) return

    if (!glidePos.current) {
      glidePos.current = {
        left: active.offsetLeft,
        width: active.offsetWidth,
        leftVelocity: 0,
        widthVelocity: 0
      }
      glide.style.width = `${active.offsetWidth}px`
      glide.style.transform = `translateX(${active.offsetLeft}px)`
    }

    let frame = 0
    let last = 0
    const tick = (now: number): void => {
      const pos = glidePos.current
      if (!pos) return
      // Frame-rate independent, and substepped so a long frame cannot make the
      // spring blow up.
      const elapsed = last === 0 ? 1 / 60 : Math.min(0.032, Math.max(0.002, (now - last) / 1000))
      last = now
      const targetLeft = active.offsetLeft
      const targetWidth = active.offsetWidth
      const steps = elapsed > 0.017 ? 2 : 1
      const dt = elapsed / steps
      for (let step = 0; step < steps; step += 1) {
        pos.leftVelocity += (stiffness * (targetLeft - pos.left) - damping * pos.leftVelocity) * dt
        pos.left += pos.leftVelocity * dt
        pos.widthVelocity +=
          (stiffness * (targetWidth - pos.width) - damping * pos.widthVelocity) * dt
        pos.width += pos.widthVelocity * dt
      }
      if (Math.abs(targetLeft - pos.left) < 0.08 && Math.abs(pos.leftVelocity) < 0.5) {
        pos.left = targetLeft
        pos.leftVelocity = 0
      }
      if (Math.abs(targetWidth - pos.width) < 0.08 && Math.abs(pos.widthVelocity) < 0.5) {
        pos.width = targetWidth
        pos.widthVelocity = 0
      }
      glide.style.width = `${pos.width}px`
      glide.style.transform = `translateX(${pos.left}px)`

      // The icons the chip displaces ride the very same spring, each one taking
      // its turn a beat after the one before it, so the row ripples outward and
      // settles with the same little bounce as the glass.
      const tabs = tabRefs.current
      const activeIndex = tabs.findIndex((tab) => tab === active)
      tabs.forEach((tab, index) => {
        if (!tab) return
        const target = tab.offsetLeft
        const state = slidePos.current[index]
        if (index === activeIndex) {
          slidePos.current[index] = { x: target, velocity: 0, target, hold: 0 }
          if (tab.style.transform) tab.style.transform = ''
          return
        }
        if (!state) {
          slidePos.current[index] = { x: target, velocity: 0, target, hold: 0 }
          return
        }
        if (state.target !== target) {
          // A new slot: wait its turn, then spring from where it is drawn now.
          const distance = Math.abs(index - activeIndex)
          state.hold = Math.min(SLIDE_HOLD_MAX, (distance - 1) * SLIDE_HOLD)
          state.target = target
          state.velocity = 0
        }
        if (state.hold > 0) {
          state.hold = Math.max(0, state.hold - elapsed)
        } else {
          for (let step = 0; step < steps; step += 1) {
            state.velocity +=
              (stiffness * (state.target - state.x) - iconDamping * state.velocity) * dt
            state.x += state.velocity * dt
          }
          if (Math.abs(state.target - state.x) < 0.08 && Math.abs(state.velocity) < 0.5) {
            state.x = state.target
            state.velocity = 0
          }
        }
        const trail = state.x - target
        tab.style.transform = Math.abs(trail) < 0.08 ? '' : `translateX(${trail.toFixed(2)}px)`
      })

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      tabRefs.current.forEach((tab) => {
        if (tab) tab.style.transform = ''
      })
    }
  }, [view, mode, settingsView, stiffness, damping])

  // No dead glass: the shell is told how tall the current tab really is, and the
  // panel is clamped between a notch's minimum and the point where it scrolls.
  useLayoutEffect(() => {
    const shell = document.querySelector<HTMLElement>('.panel')
    if (!shell) return
    const root = document.documentElement

    // The very same spring the chip travels on, so the glass and the chip share
    // one sense of speed: quick to arrive, a hair past it, then settled.
    const spring = (): void => {
      heightFrame.current = 0
      const pos = heightPos.current
      if (!pos) return
      const now = performance.now()
      const elapsed =
        heightLast.current === 0 ? 1 / 60 : Math.min(0.032, Math.max(0.002, (now - heightLast.current) / 1000))
      heightLast.current = now
      const target = heightTarget.current
      const steps = elapsed > 0.017 ? 2 : 1
      const dt = elapsed / steps
      for (let index = 0; index < steps; index += 1) {
        pos.velocity += (stiffness * (target - pos.height) - damping * pos.velocity) * dt
        pos.height += pos.velocity * dt
      }
      const settled = Math.abs(target - pos.height) < 0.2 && Math.abs(pos.velocity) < 1
      if (settled) {
        pos.height = target
        pos.velocity = 0
      }
      root.style.setProperty('--panel-h', `${pos.height.toFixed(2)}px`)
      if (!settled) {
        heightFrame.current = requestAnimationFrame(spring)
        return
      }
      // Landed: the body may scroll again and the window takes the exact height.
      delete shell.dataset['resizing']
      api.setPanelHeight(target)
      heightLast.current = 0
    }

    const report = (): void => {
      if (!shell.isConnected) return
      const pos = heightPos.current
      // The island's layers are absolutely positioned, so the island has no
      // content to measure; the panel inside it does. It is asked to size itself
      // to its contents for one synchronous read and put back before anything is
      // painted: that is what makes a tab's height its content's height, rather
      // than whatever the box happened to be at the time.
      const held = pos ? `${pos.height.toFixed(2)}px` : root.style.getPropertyValue('--panel-h')
      // Sizing the panel to its content for the read collapses every scroller to
      // the top, which made a tall tab like Settings impossible to scroll: the
      // probe runs every 300ms and undid each wheel step. Put the offsets back
      // in the same frame, before anything can paint.
      const scrollers = Array.from(
        shell.querySelectorAll<HTMLElement>('.panel-body, .settings-scroll, .calendar-scroll')
      )
      const offsets = scrollers.map((element) => element.scrollTop)
      root.style.setProperty('--panel-h', 'auto')
      const intrinsic = shell.offsetHeight
      root.style.setProperty('--panel-h', held || '336px')
      scrollers.forEach((element, index) => {
        const offset = offsets[index]
        if (offset !== undefined && element.scrollTop !== offset) element.scrollTop = offset
      })
      // The welcome tour is a full-bleed overlay, so it asks for its own height.
      const natural = tourOpen ? 322 : intrinsic
      const next = Math.round(Math.min(430, Math.max(208, natural)))
      if (next === heightTarget.current) return
      const previous = heightTarget.current
      heightTarget.current = next
      if (!pos) {
        // First measurement: open at the true height, then spring from there.
        heightPos.current = { height: next, velocity: 0 }
        root.style.setProperty('--panel-h', `${next}px`)
        api.setPanelHeight(next)
        return
      }
      // Clip the body while the glass is in motion: a scrollbar blinking in and
      // out over half a second would undo the point of easing.
      shell.dataset['resizing'] = 'true'
      // The window covers whichever end is taller, so the glass is never cut on
      // the way; the overshoot lands in the shadow padding around it.
      api.setPanelHeight(Math.max(Math.round(pos.height), next))
      if (!heightFrame.current) heightFrame.current = requestAnimationFrame(spring)
    }

    // Opening from the pill: start the glass at the pill's height so the notch
    // springs open rather than popping to the panel's size.
    if (mode !== 'panel') {
      collapsedHeight.current = document.querySelector<HTMLElement>('.island')?.offsetHeight || PILL_HEIGHT
    } else if (lastMode.current !== 'panel' && heightPos.current && heightTarget.current > 0) {
      heightPos.current.height = collapsedHeight.current
      heightPos.current.velocity = 0
      root.style.setProperty('--panel-h', `${collapsedHeight.current}px`)
      shell.dataset['resizing'] = 'true'
      api.setPanelHeight(Math.max(collapsedHeight.current, heightTarget.current))
      if (!heightFrame.current) heightFrame.current = requestAnimationFrame(spring)
    }
    lastMode.current = mode

    report()
    const timer = window.setInterval(report, 300)
    return () => window.clearInterval(timer)
  })
  const playing = media.active && media.status === 'playing'

  return (
    <div
      className="panel"
      onPointerDownCapture={(event) => {
        // The island is non-activating by default. Only a click on a text field
        // is worth taking the keyboard for; tabs and buttons never steal focus.
        const field = (event.target as HTMLElement | null)?.closest(
          'input, textarea, [contenteditable="true"]'
        ) as HTMLElement | null
        if (!field || document.hasFocus()) return
        api.activate()
        window.setTimeout(() => field.focus(), 60)
      }}
    >
      <div className="panel-head">
        {settingsView ? (
          <button type="button" className="head-back" onClick={() => setView('home')}>
            <ChevronLeftIcon size={14} />
            <span>Settings</span>
          </button>
        ) : (
          <nav ref={railRef} className="tabs" role="tablist" aria-label="Island sections">
            <span className="tab-glide" ref={glideRef} aria-hidden="true" />
            {TABS.map(({ id, label, short, Icon }, index) => (
              <button
                key={id}
                ref={(node) => {
                  tabRefs.current[index] = node
                }}
                type="button"
                role="tab"
                aria-selected={view === id}
                aria-label={label}
                className={`tab ${view === id ? 'is-active' : ''}`}
                onClick={() => setView(id)}
              >
                {id === 'media' && playing ? (
                  // The media tab carries the playing pulse itself: the title
                  // bar has no room to spare for it next to the date.
                  <span className="eq eq-small tab-eq" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <Icon size={16} />
                )}
                {/* Every tab keeps its name in place so switching can grow one
                    chip and shrink the other instead of popping between widths. */}
                <span className="tab-label" aria-hidden="true">
                  <span>{short}</span>
                </span>
                {view === id ? null : (
                  <span className="tab-tip" aria-hidden="true">
                    {label}
                  </span>
                )}
              </button>
            ))}
          </nav>
        )}

        <span className="head-divider" aria-hidden="true" />

        <div className="head-date">
          <span className="head-date-text" title={titleDate(new Date(now))}>
            {titleDate(new Date(now))}
          </span>
        </div>

        <div className="head-actions">
          <button
            type="button"
            className={`icon-btn ${settingsView ? 'is-active' : ''}`}
            title={settingsView ? 'Close settings' : 'Settings'}
            onClick={() => setView(settingsView ? 'home' : 'settings')}
          >
            <GearIcon size={16} />
          </button>
          <button
            type="button"
            className="icon-btn head-close"
            title="Close"
            onClick={() => {
              // Settings is a detour, not a tab: closing it returns to Home,
              // the same way Escape does.
              if (settingsView) setView('home')
              dismiss()
            }}
          >
            <CloseIcon size={15} />
          </button>
        </div>
      </div>

      {activeNotification ? (
        <div className="panel-notice">
          <NotificationCard
            key={activeNotification.id}
            notification={activeNotification}
            onAction={(actionId) => answerNotification(activeNotification.id, actionId)}
            onDismiss={() => answerNotification(activeNotification.id, null)}
          />
        </div>
      ) : notice ? (
        <NoticeBar notice={notice} />
      ) : null}

      {tourOpen ? <WelcomeTour /> : null}

      <div className="panel-body">
        {view === 'home' ? <HomeTab /> : null}
        {view === 'media' ? <MediaTab /> : null}
        {view === 'calendar' ? <CalendarTab /> : null}
        {view === 'focus' ? <FocusTab /> : null}
        {view === 'water' ? <WaterTab /> : null}
        {view === 'tasks' ? <TasksTab /> : null}
        {view === 'shelf' ? <ShelfTab /> : null}
        {view === 'agent' ? <AgentTab /> : null}
        {settingsView ? <SettingsView /> : null}
      </div>
    </div>
  )
}

