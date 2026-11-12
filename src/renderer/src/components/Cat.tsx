export type CatMood = 'idle' | 'alert'

interface CatProps {
  size?: number
  className?: string
  mood?: CatMood
}

/**
 * Notcha's mascot. It is alive: a slow breath, an occasional look around, a
 * blink, and a springy hop when something needs attention.
 */
export default function Cat({ size = 16, className, mood = 'idle' }: CatProps) {
  return (
    <svg
      className={`cat cat--${mood}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <g className="cat-bob">
        <g className="cat-tilt" fill="currentColor">
          <path d="M3.9 13.2 4.2 4.6 9.7 8.2a7 7 0 0 1 4.6 0l5.5-3.6.3 8.6a8.1 7.9 0 0 1-16.2 0Z" />
        </g>
        <g className="cat-eye-layer" fill="#0f1117">
          <rect className="cat-eye" x="8.4" y="12.6" width="1.8" height="2.7" rx=".9" />
          <rect className="cat-eye" x="13.8" y="12.6" width="1.8" height="2.7" rx=".9" />
          <path className="cat-mouth" d="M11.15 16.7h1.7l-.85 1Z" />
        </g>
      </g>
    </svg>
  )
}
