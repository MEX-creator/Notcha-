import { useEffect, useRef, useState } from 'react'
import { useApp } from '../state'
import Cat from './Cat'

/** The cat climbing out of the moving box on the first card. */
function CatInBox() {
  return (
    <svg className="welcome-box" width="216" height="196" viewBox="0 0 200 180" aria-hidden="true">
      <defs>
        <clipPath id="welcome-behind-rim">
          <rect x="0" y="0" width="200" height="100" />
        </clipPath>
        <radialGradient id="welcome-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(150,170,255,0.34)" />
          <stop offset="100%" stopColor="rgba(150,170,255,0)" />
        </radialGradient>
      </defs>

      <circle cx="100" cy="74" r="62" fill="url(#welcome-glow)" />

      {/* the lid, popping open */}
      <g className="welcome-flap welcome-flap-left">
        <path d="M52 100 56 60l30 6-2 34Z" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.28)" strokeLinejoin="round" />
      </g>
      <g className="welcome-flap welcome-flap-right">
        <path d="M148 100 144 60l-30 6 2 34Z" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.28)" strokeLinejoin="round" />
      </g>

      {/* the cat, hidden behind the rim until it climbs out */}
      <g className="welcome-cat" clipPath="url(#welcome-behind-rim)">
        <g transform="translate(68 44) scale(2.6)" fill="currentColor">
          <rect x="2" y="11" width="20" height="12" rx="5" />
          <path d="M3.9 13.2 4.2 4.6 9.7 8.2a7 7 0 0 1 4.6 0l5.5-3.6.3 8.6a8.1 7.9 0 0 1-16.2 0Z" />
        </g>
        <g fill="#0f1117">
          <rect className="cat-eye" x="89.4" y="68.6" width="5" height="7.2" rx="2.5" />
          <rect className="cat-eye" x="103.6" y="68.6" width="5" height="7.2" rx="2.5" />
          <path d="M95.9 79.4h4.2l-2.1 2.8Z" />
        </g>
      </g>

      {/* the box */}
      <ellipse cx="100" cy="166" rx="62" ry="6" fill="rgba(0,0,0,0.45)" />
      <rect x="44" y="100" width="112" height="62" rx="9" fill="rgba(255,255,255,0.13)" stroke="rgba(255,255,255,0.22)" />
      <rect x="44" y="100" width="112" height="11" rx="5.5" fill="rgba(255,255,255,0.16)" />
      <rect x="90" y="111" width="20" height="51" fill="rgba(255,255,255,0.05)" />
      <rect x="58" y="118" width="30" height="3" rx="1.5" fill="rgba(255,255,255,0.14)" />
      <rect x="58" y="127" width="18" height="3" rx="1.5" fill="rgba(255,255,255,0.1)" />
    </svg>
  )
}

function PillArt() {
  return (
    <div className="welcome-pill" aria-hidden="true">
      <Cat size={15} />
      <span>12:41</span>
      <span className="welcome-pill-cursor" />
    </div>
  )
}

function TabsArt() {
  const tabs = ['Home', 'Music', 'Calendar', 'Focus', 'Water', 'Tasks', 'Shelf', 'Agent']
  return (
    <div className="welcome-tabs" aria-hidden="true">
      {tabs.map((tab) => (
        <span key={tab} className={tab === 'Agent' ? 'is-accent' : undefined}>
          {tab}
        </span>
      ))}
    </div>
  )
}

function AgentArt() {
  return (
    <div className="welcome-agent" aria-hidden="true">
      <Cat size={34} />
      <span className="welcome-bubble">On it — ask me anything.</span>
    </div>
  )
}

const STEPS = [
  {
    title: 'Hi, I’m Notcha',
    body: 'A tiny island that lives at the top of your screen. Hover it and I open up; move away and I get out of the way.',
    art: 'box'
  },
  {
    title: 'Quiet by default',
    body: 'When nothing is happening I’m just a clock. Volume, brightness, music and messages appear only when they change.',
    art: 'pill'
  },
  {
    title: 'Your whole day in one notch',
    body: 'A home dashboard for screen time, system and weather, then music, calendar, focus, water, tasks, a file shelf and an agent.',
    art: 'tabs'
  },
  {
    title: 'Every task feeds Mochi',
    body: 'Tick tasks off and the cat gets a treat. Three treats is a level, and every level pays Paws — spend them on themes in Settings.',
    art: 'agent'
  },
  {
    title: 'Connect your agent',
    body: 'There is no Notcha account: the Agent tab talks to the agent on this PC, or to a model you bring a key for. Connect one now — the tour finishes here.',
    art: 'agent',
    connect: true
  }
] as const

export default function WelcomeTour() {
  const { settings, updateSettings, agent, setAgent, api, agentMessages } = useApp()
  const [step, setStep] = useState(0)
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [pinged, setPinged] = useState(false)
  const [localReady, setLocalReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pingBase = useRef(0)

  const last = step === STEPS.length - 1
  const current = STEPS[step]
  const connectStep = 'connect' in current && current.connect === true
  const connected = agent.hasKey || localReady

  // A reply from the local agent is the only proof that the CLI is listening.
  useEffect(() => {
    if (!pinged || localReady) return
    if (agentMessages.length > pingBase.current) setLocalReady(true)
  }, [pinged, localReady, agentMessages.length])

  useEffect(() => {
    if (!pinged || localReady) return
    const timer = window.setTimeout(
      () => setError('No agent answered. Start the local agent, or use an API key instead.'),
      9000
    )
    return () => window.clearTimeout(timer)
  }, [pinged, localReady])

  const connectKey = async (): Promise<void> => {
    const value = key.trim()
    if (!value) return
    setSaving(true)
    setError(null)
    try {
      const status = await api.agentSetKey(value)
      setAgent(status)
      if (!status.hasKey) {
        setError('That key was rejected. Check it and try again.')
        return
      }
      const next = await api.agentSetChannel('api')
      setAgent(next)
      void updateSettings({ agent: { ...settings.agent, channel: 'api' } })
      setKey('')
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const pingLocal = async (): Promise<void> => {
    setError(null)
    pingBase.current = agentMessages.length
    setPinged(true)
    const result = await api.agentLinkSend('Notcha is setting up. Reply if you can hear this.')
    if (!result?.ok) {
      setPinged(false)
      setError('Could not reach the local agent bridge.')
    }
  }

  const finish = (): void => {
    if (!connected) return
    void updateSettings({ general: { ...settings.general, welcomeSeen: true } })
  }

  return (
    <div className="welcome">
      {last ? null : (
        <button type="button" className="welcome-skip" onClick={() => void updateSettings({ general: { ...settings.general, welcomeSeen: true } })}>
          Skip
        </button>
      )}

      <div className="welcome-art" key={step}>
        {current.art === 'box' ? <CatInBox /> : null}
        {current.art === 'pill' ? <PillArt /> : null}
        {current.art === 'tabs' ? <TabsArt /> : null}
        {current.art === 'agent' ? <AgentArt /> : null}
      </div>

      <div className="welcome-copy">
        <h2>{current.title}</h2>
        <p>{current.body}</p>

        {connectStep ? (
          <div className="welcome-connect">
            <div className="welcome-connect-row">
              <button type="button" className="welcome-back" onClick={() => void pingLocal()}>
                {pinged && !localReady ? 'Waiting for your agent…' : 'Ping the local agent'}
              </button>
              {localReady ? <span className="welcome-connect-ok">Local agent connected</span> : null}
            </div>
            <div className="welcome-connect-row">
              <input
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder="…or paste an API key"
                spellCheck={false}
                autoComplete="off"
                type="password"
              />
              <button type="button" className="welcome-back" onClick={() => void connectKey()} disabled={saving || !key.trim()}>
                {saving ? 'Saving…' : 'Use key'}
              </button>
            </div>
            {connected ? <span className="welcome-connect-ok">Agent connected — you can finish.</span> : null}
            {error ? <p className="form-error">{error}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="welcome-dots" aria-hidden="true">
        {STEPS.map((item, index) => (
          <span key={item.title} className={index === step ? 'is-active' : undefined} />
        ))}
      </div>

      <div className="welcome-actions">
        {step > 0 ? (
          <button type="button" className="welcome-back" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="welcome-next"
          disabled={last && !connected}
          onClick={() => (last ? finish() : setStep(step + 1))}
        >
          {last ? (connected ? 'Start using Notcha' : 'Connect to finish') : 'Next'}
        </button>
      </div>
    </div>
  )
}
