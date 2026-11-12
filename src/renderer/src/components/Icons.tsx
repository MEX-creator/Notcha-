import type { ReactNode } from 'react'

export interface IconProps {
  size?: number
  className?: string
}

function Svg({ size = 18, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.6 12 4l8 6.6" />
    <path d="M6 9.8V19a1 1 0 0 0 1 1h3.4v-4.6h3.2V20H17a1 1 0 0 0 1-1V9.8" />
  </Svg>
)

export const MusicIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18V6.6a1 1 0 0 1 .8-.98l8.4-1.6a1 1 0 0 1 1.2.98V16" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </Svg>
)

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.25" y="5" width="17.5" height="15.5" rx="3.2" />
    <path d="M3.25 10h17.5M8 3v4M16 3v4" />
    <path d="M7.5 14h2M14.5 14h2" />
  </Svg>
)

export const TimerIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.75v3.75l2.5 1.75M9.5 2.75h5" />
  </Svg>
)

export const DropletIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5c3.1 3.6 5.5 6.2 5.5 9.05A5.5 5.5 0 0 1 12 18a5.5 5.5 0 0 1-5.5-5.45C6.5 9.7 8.9 7.1 12 3.5Z" />
  </Svg>
)

export const TasksIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 6.5h11M9.5 12h11M9.5 17.5h11" />
    <path d="M3.5 6.4l1.4 1.4 2.4-2.6M3.5 11.9l1.4 1.4 2.4-2.6M3.5 17.4l1.4 1.4 2.4-2.6" />
  </Svg>
)

export const ShelfIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 7.5h17v10.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5Z" />
    <path d="M3 7.5l1.4-2.6a2 2 0 0 1 1.76-1.1h11.68a2 2 0 0 1 1.76 1.1L21 7.5" />
    <path d="M10 11.5h4" />
  </Svg>
)

export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 14.2a1.6 1.6 0 0 0 .32 1.76l.06.06a1.94 1.94 0 1 1-2.74 2.74l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.97 1.46v.17a1.94 1.94 0 0 1-3.88 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a1.94 1.94 0 1 1-2.74-2.74l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.97h-.17a1.94 1.94 0 0 1 0-3.88h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.76l-.06-.06A1.94 1.94 0 1 1 6.5 3.9l.06.06a1.6 1.6 0 0 0 1.76.32h.08a1.6 1.6 0 0 0 .97-1.46v-.17a1.94 1.94 0 0 1 3.88 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.76-.32l.06-.06a1.94 1.94 0 1 1 2.74 2.74l-.06.06a1.6 1.6 0 0 0-.32 1.76v.08a1.6 1.6 0 0 0 1.46.97h.17a1.94 1.94 0 0 1 0 3.88h-.09a1.6 1.6 0 0 0-1.46.97Z" />
  </Svg>
)

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Svg>
)

export const PlayIcon = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M8 5.6c0-.9 1-1.5 1.8-1L18.9 10a1.2 1.2 0 0 1 0 2.1L9.8 18.4c-.8.5-1.8-.1-1.8-1V5.6Z" fill="currentColor" />
  </svg>
)

export const PauseIcon = ({ size = 18, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
    <rect x="6.4" y="4.6" width="3.9" height="14.8" rx="1.5" fill="currentColor" />
    <rect x="13.7" y="4.6" width="3.9" height="14.8" rx="1.5" fill="currentColor" />
  </svg>
)

export const PrevIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18.5 6.2v11.6L9.8 12l8.7-5.8Z" fill="currentColor" stroke="none" />
    <rect x="5" y="5.5" width="2.2" height="13" rx="1.1" fill="currentColor" stroke="none" />
  </Svg>
)

export const NextIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 6.2v11.6L14.2 12 5.5 6.2Z" fill="currentColor" stroke="none" />
    <rect x="16.8" y="5.5" width="2.2" height="13" rx="1.1" fill="currentColor" stroke="none" />
  </Svg>
)

export const SpeakerIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5h3l4.2-3.6a.8.8 0 0 1 1.3.6v11a.8.8 0 0 1-1.3.6L7 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
    <path d="M16.5 8.7a4.6 4.6 0 0 1 0 6.6M19 6.2a8.1 8.1 0 0 1 0 11.6" />
  </Svg>
)

export const MuteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9.5h3l4.2-3.6a.8.8 0 0 1 1.3.6v11a.8.8 0 0 1-1.3.6L7 14.5H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1Z" />
    <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />
  </Svg>
)

export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4.1" />
    <path d="M12 2.8v2.1M12 19.1v2.1M4.5 12H2.4M21.6 12h-2.1M6.7 6.7 5.2 5.2M18.8 18.8l-1.5-1.5M17.3 6.7l1.5-1.5M5.2 18.8l1.5-1.5" />
  </Svg>
)

export const CapsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4 5.5 10.2h3.9v3.6h5.2v-3.6h3.9L12 4Z" />
    <path d="M8 19h8" />
  </Svg>
)

export const WifiOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 8.2a15 15 0 0 1 6-3.1M15.6 5.3a15 15 0 0 1 5.9 2.9M6.7 11.6a10 10 0 0 1 3.4-1.6M17.4 10a10 10 0 0 0-3.2-1.4" />
    <path d="M9.7 15a5 5 0 0 1 4.6 0" />
    <circle cx="12" cy="18.6" r="0.9" fill="currentColor" />
    <path d="M3 3l18 18" />
  </Svg>
)

export const WifiIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 8.2a15 15 0 0 1 19 0M6.2 11.7a10 10 0 0 1 11.6 0M9.6 15.1a5 5 0 0 1 4.8 0" />
    <circle cx="12" cy="18.6" r="0.9" fill="currentColor" />
  </Svg>
)

export const MicIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="2.8" width="6" height="10.4" rx="3" />
    <path d="M5.5 11.4a6.5 6.5 0 0 0 13 0M12 17.9V21M8.6 21h6.8" />
  </Svg>
)

export const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.8" y="6.4" width="12.6" height="11.2" rx="2.6" />
    <path d="M15.4 11.2l5-2.6v6.8l-5-2.6" />
  </Svg>
)

export const BatteryIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.6" y="7.4" width="16.4" height="9.2" rx="2.4" />
    <path d="M21.6 10.6v2.8" />
    <rect x="4.6" y="9.4" width="5.2" height="5.2" rx="1" fill="currentColor" stroke="none" />
  </Svg>
)

export const BoltIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.4 2.8 5.6 13.4h5.2l-.9 7.8 8-10.8h-5.2l.7-7.6Z" />
  </Svg>
)

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5.5v13M5.5 12h13" />
  </Svg>
)

export const MinusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 12h13" />
  </Svg>
)

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6" />
  </Svg>
)

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11.5a8 8 0 1 0-1.2 5.2" />
    <path d="M20.4 5.6v5.2h-5.2" />
  </Svg>
)

export const FolderIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.4 7.4a2 2 0 0 1 2-2h3.3l2 2.4h8a2 2 0 0 1 2 2v8.8a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2V7.4Z" />
  </Svg>
)

export const FileIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.4 3.2H7.2a2 2 0 0 0-2 2v13.6a2 2 0 0 0 2 2h9.6a2 2 0 0 0 2-2V8.6l-5.4-5.4Z" />
    <path d="M13.2 3.4v5.2h5.4" />
  </Svg>
)

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.8 12.6 9.4 17l9.8-10" />
  </Svg>
)

export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4.5h5.5V10M19.2 4.8l-8 8" />
    <path d="M18.4 14v4.4a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2V7.4a2 2 0 0 1 2-2H10" />
  </Svg>
)

export const SkipIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 6.4v11.2L13 12 5 6.4Z" fill="currentColor" stroke="none" />
    <path d="M19 5.5v13" />
  </Svg>
)

export const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.2l1.9 5.1 5.1 1.9-5.1 1.9L12 17.2l-1.9-5.1L5 10.2l5.1-1.9L12 3.2Z" />
    <path d="M18.4 16.2l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z" />
  </Svg>
)

export const SendIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 19V5M6.4 10.6 12 5l5.6 5.6" />
  </Svg>
)

export const StopIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="7" width="10" height="10" rx="2.2" fill="currentColor" stroke="none" />
  </Svg>
)

export const ResetIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.6 10.2A8 8 0 1 1 6 16.4" />
    <path d="M4 4.8v5.6h5.6" />
  </Svg>
)


export const ConvertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8.6h11.2l-2.7-2.7" />
    <path d="M20 15.4H8.8l2.7 2.7" />
  </Svg>
)
