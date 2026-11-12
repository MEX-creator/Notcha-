import type { Notice } from '../state'
import {
  BatteryIcon,
  BoltIcon,
  CameraIcon,
  CapsIcon,
  DropletIcon,
  MicIcon,
  MuteIcon,
  SpeakerIcon,
  SunIcon,
  TimerIcon,
  WifiIcon,
  WifiOffIcon
} from './Icons'

function noticeIcon(notice: Notice) {
  switch (notice.kind) {
    case 'volume':
      return <SpeakerIcon size={15} />
    case 'mute':
      return <MuteIcon size={15} />
    case 'brightness':
      return <SunIcon size={15} />
    case 'caps':
      return <CapsIcon size={15} />
    case 'network':
      return notice.title === 'Connected' ? <WifiIcon size={15} /> : <WifiOffIcon size={15} />
    case 'mic':
      return <MicIcon size={15} />
    case 'camera':
      return <CameraIcon size={15} />
    case 'battery':
      return notice.title === 'Charging' ? <BoltIcon size={15} /> : <BatteryIcon size={15} />
    case 'timer':
      return <TimerIcon size={15} />
    case 'water':
      return <DropletIcon size={15} />
    default:
      return null
  }
}

function hasMeter(notice: Notice): boolean {
  return typeof notice.value === 'number' && (notice.kind === 'volume' || notice.kind === 'brightness' || notice.kind === 'battery' || notice.kind === 'mute')
}

export function NoticeInline({ notice }: { notice: Notice }) {
  return (
    <div className="notice-inline" key={notice.kind}>
      <span className="notice-inline-icon">{noticeIcon(notice)}</span>
      <span className="notice-inline-text">{notice.title}</span>
      {hasMeter(notice) ? (
        <>
          <span className="notice-inline-meter">
            <span style={{ width: `${Math.max(2, Math.min(100, notice.value ?? 0))}%` }} />
          </span>
          <span className="notice-inline-value">{notice.kind === 'battery' ? `${notice.value}%` : `${notice.value}%`}</span>
        </>
      ) : null}
    </div>
  )
}

export function NoticeBar({ notice }: { notice: Notice }) {
  return (
    <div className="notice-bar" key={notice.kind}>
      <span className="notice-icon">{noticeIcon(notice)}</span>
      <div className="notice-copy">
        <span className="notice-title">{notice.title}</span>
        {notice.detail ? <span className="notice-detail">{notice.detail}</span> : null}
      </div>
      {hasMeter(notice) ? (
        <div className="notice-meter">
          <span style={{ width: `${Math.max(2, Math.min(100, notice.value ?? 0))}%` }} />
        </div>
      ) : null}
    </div>
  )
}
