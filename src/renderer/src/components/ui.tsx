import { useId, type ReactNode } from 'react'
import { MinusIcon, PlusIcon } from './Icons'

export function Switch({
  checked,
  onChange,
  disabled = false,
  label
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="switch-knob" />
    </button>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: ReactNode
  title?: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  compact = false
}: {
  value: T
  options: SegmentOption<T>[]
  onChange: (next: T) => void
  compact?: boolean
}) {
  return (
    <div className={`segmented${compact ? ' is-compact' : ''}`} role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          title={option.title}
          className={option.value === value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Stepper({
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange
}: {
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (next: number) => void
}) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(Math.max(min, value - step))} aria-label="Decrease">
        <MinusIcon size={14} />
      </button>
      <span>
        {value}
        {suffix ? <em>{suffix}</em> : null}
      </span>
      <button type="button" onClick={() => onChange(Math.min(max, value + step))} aria-label="Increase">
        <PlusIcon size={14} />
      </button>
    </div>
  )
}

export function Ring({
  progress,
  size = 148,
  thickness = 5,
  children
}: {
  progress: number
  size?: number
  thickness?: number
  children?: ReactNode
}) {
  const gradientId = useId()
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(1, progress))
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8fadff" />
            <stop offset="100%" stopColor="#b9a2ff" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.07)" strokeWidth={thickness} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 400ms cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="ring-inner">{children}</div>
    </div>
  )
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="Loading" />
}

export function EmptyState({
  icon,
  title,
  detail,
  children
}: {
  icon?: ReactNode
  title: string
  detail?: string
  children?: ReactNode
}) {
  return (
    <div className="empty">
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <div className="empty-title">{title}</div>
      {detail ? <div className="empty-detail">{detail}</div> : null}
      {children ? <div className="empty-actions">{children}</div> : null}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  title,
  type = 'button'
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'ghost'
  disabled?: boolean
  title?: string
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} className={`btn btn-${variant}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}

export function SectionLabel({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="section-label">
      <span>{children}</span>
      {trailing}
    </div>
  )
}
