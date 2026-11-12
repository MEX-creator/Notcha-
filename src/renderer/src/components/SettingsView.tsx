import { useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS, type DisplayInfo, type UpdateResult } from '../../../shared/types'
import { CAT_NAME, CURRENCY, TREATS_PER_LEVEL } from '../../../shared/motivation'
import { THEMES } from '../../../shared/themes'
import { useApp } from '../state'
import { Button, SectionLabel, Segmented, Stepper, Switch } from './ui'
import { ExternalIcon } from './Icons'

function Row({
  title,
  detail,
  children
}: {
  title: string
  detail?: string
  children?: ReactNode
}) {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <span className="setting-title">{title}</span>
        {detail ? <span className="setting-detail">{detail}</span> : null}
      </div>
      {children ? <div className="setting-control">{children}</div> : null}
    </div>
  )
}

export default function SettingsView() {
  const {
    api,
    settings,
    updateSettings,
    google,
    setGoogle,
    agent,
    setAgent,
    version,
    demo,
    capabilities,
    state,
    buyTheme,
    applyTheme
  } = useApp()
  const [displays, setDisplays] = useState<DisplayInfo[]>([])
  const [clientId, setClientId] = useState(settings.google.clientId)
  const [connecting, setConnecting] = useState(false)
  const [place, setPlace] = useState(settings.weather.place)
  const [geo, setGeo] = useState<{ name: string; latitude: number; longitude: number }[]>([])
  const [searching, setSearching] = useState(false)
  const [feedUrl, setFeedUrl] = useState(settings.updates.feedUrl)
  const [checking, setChecking] = useState(false)
  const [updateResult, setUpdateResult] = useState<UpdateResult | null>(null)
  const [savedClientId, setSavedClientId] = useState(false)
  const [agentKey, setAgentKey] = useState('')
  const [agentSaving, setAgentSaving] = useState(false)
  const [agentSaved, setAgentSaved] = useState(false)
  const [agentModel, setAgentModel] = useState(settings.agent.model)
  const [agentBase, setAgentBase] = useState(settings.agent.baseUrl)

  useEffect(() => {
    api
      .displays()
      .then((list) => setDisplays(list))
      .catch(() => setDisplays([]))
  }, [api])

  useEffect(() => {
    setClientId(settings.google.clientId)
  }, [settings.google.clientId])

  useEffect(() => {
    setPlace(settings.weather.place)
  }, [settings.weather.place])

  useEffect(() => {
    setAgentModel(settings.agent.model)
    setAgentBase(settings.agent.baseUrl)
  }, [settings.agent.model, settings.agent.baseUrl])

  const saveAgentKey = async (): Promise<void> => {
    const value = agentKey.trim()
    if (!value) return
    setAgentSaving(true)
    try {
      const status = await api.agentSetKey(value)
      setAgent(status)
      if (status.hasKey) {
        setAgentKey('')
        setAgentSaved(true)
        window.setTimeout(() => setAgentSaved(false), 1800)
      }
    } finally {
      setAgentSaving(false)
    }
  }

  const saveAgentEndpoint = (): void => {
    void updateSettings({
      agent: { model: agentModel.trim(), baseUrl: agentBase.trim(), channel: settings.agent.channel }
    })
  }

  const searchPlace = async (): Promise<void> => {
    const query = place.trim()
    if (!query) return
    setSearching(true)
    try {
      const results = await api.geocode(query)
      setGeo(results)
      if (results.length === 0) {
        void updateSettings({ weather: { ...settings.weather, place: query, latitude: null, longitude: null } })
      }
    } finally {
      setSearching(false)
    }
  }

  const connectGoogle = async (): Promise<void> => {
    setConnecting(true)
    try {
      if (clientId.trim() !== settings.google.clientId) {
        await updateSettings({ google: { clientId: clientId.trim() } })
        setSavedClientId(true)
        window.setTimeout(() => setSavedClientId(false), 1800)
      }
      const status = await api.googleConnect()
      setGoogle(status)
    } finally {
      setConnecting(false)
    }
  }

  const checkUpdates = async (): Promise<void> => {
    setChecking(true)
    try {
      if (feedUrl.trim() !== settings.updates.feedUrl) {
        await updateSettings({ updates: { ...settings.updates, feedUrl: feedUrl.trim() } })
      }
      const result = await api.checkUpdates()
      setUpdateResult(result)
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="view view-settings">
      <div className="settings-scroll">
        <SectionLabel>Look & behaviour</SectionLabel>
        <Row title="Show seconds" detail="Precision clock in the notch">
          <Switch
            checked={settings.general.showSeconds}
            onChange={(next) => void updateSettings({ general: { ...settings.general, showSeconds: next } })}
            label="Show seconds"
          />
        </Row>
        <Row title="Show on" detail="Which screen the notch lives on">
          <div className="display-chips">
            {displays.length === 0 ? <span className="setting-detail">Primary display</span> : null}
            {displays.map((display) => {
              const selected =
                settings.general.displayId === display.id ||
                (settings.general.displayId === null && display.primary)
              return (
                <button
                  key={display.id}
                  type="button"
                  className={`chip ${selected ? 'is-active' : ''}`}
                  onClick={() => void updateSettings({ general: { ...settings.general, displayId: display.id } })}
                  title={display.label}
                >
                  {display.primary ? 'Main' : display.label}
                </button>
              )
            })}
          </div>
        </Row>
        <Row title="Start with Windows" detail="Installed builds can start quietly with your PC">
          <Switch
            checked={settings.general.startAtLogin}
            onChange={(next) => void updateSettings({ general: { ...settings.general, startAtLogin: next } })}
            label="Start with Windows"
          />
        </Row>

        <SectionLabel>Now playing</SectionLabel>
        <Row
          title="Synced lyrics"
          detail="Looks up lyrics for the current track. Sends only title, artist and album to LRCLIB."
        >
          <Switch
            checked={settings.lyrics.enabled}
            onChange={(next) => void updateSettings({ lyrics: { enabled: next } })}
            label="Synced lyrics"
          />
        </Row>

        <SectionLabel>Weather</SectionLabel>
        <Row title="Show weather" detail="Open-Meteo, no account or API key">
          <Switch
            checked={settings.weather.enabled}
            onChange={(next) => void updateSettings({ weather: { ...settings.weather, enabled: next } })}
            label="Show weather"
          />
        </Row>
        {settings.weather.enabled ? (
          <div className="setting-block">
            <div className="field-row">
              <input
                value={place}
                onChange={(event) => setPlace(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void searchPlace()
                }}
                placeholder="City or town"
                maxLength={80}
                spellCheck={false}
              />
              <Button onClick={() => void searchPlace()} disabled={searching || !place.trim()}>
                {searching ? 'Finding…' : 'Find'}
              </Button>
            </div>
            {geo.length > 0 ? (
              <div className="geo-list">
                {geo.map((result) => (
                  <button
                    key={`${result.latitude}-${result.longitude}-${result.name}`}
                    type="button"
                    className="geo-item"
                    onClick={() => {
                      void updateSettings({
                        weather: {
                          ...settings.weather,
                          place: result.name,
                          latitude: result.latitude,
                          longitude: result.longitude
                        }
                      })
                      setGeo([])
                    }}
                  >
                    {result.name}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="inline-row">
              <span className="setting-detail">Units</span>
              <Segmented
                compact
                value={settings.weather.unit}
                options={[
                  { value: 'c', label: '°C' },
                  { value: 'f', label: '°F' }
                ]}
                onChange={(next) => void updateSettings({ weather: { ...settings.weather, unit: next } })}
              />
            </div>
            {!settings.weather.place ? (
              <p className="hint">Pick a place to show temperature in the notch and on the calendar tab.</p>
            ) : null}
          </div>
        ) : null}

        <SectionLabel>Google Calendar & Tasks</SectionLabel>
        <Row
          title={google.connected ? 'Connected' : 'Not connected'}
          detail={google.connected ? (google.email ?? 'Signed in') : 'Optional. Read-only calendar, read-write tasks.'}
        >
          {google.connected ? (
            <Button onClick={() => void api.googleDisconnect().then(setGoogle)}>Disconnect</Button>
          ) : (
            <Button variant="primary" onClick={() => void connectGoogle()} disabled={connecting || !clientId.trim()}>
              {connecting ? 'Waiting…' : 'Connect'}
            </Button>
          )}
        </Row>
        <div className="setting-block">
          <div className="field-row">
            <input
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              placeholder="Google OAuth client ID"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          {savedClientId ? <p className="hint">Client ID saved.</p> : null}
          <p className="hint">
            Create an OAuth client of type <em>Desktop app</em> in Google Cloud, then paste its client ID
            here. Enable the Calendar and Tasks APIs first.{' '}
            <button
              type="button"
              className="link-btn"
              onClick={() => api.openExternal('https://console.cloud.google.com/apis/credentials')}
            >
              Open Google Cloud <ExternalIcon size={11} />
            </button>
          </p>
          {google.error ? <p className="form-error">{google.error}</p> : null}
        </div>

        <SectionLabel>Agent</SectionLabel>
        <Row
          title={agent.hasKey ? 'Key saved' : 'No API key yet'}
          detail="Encrypted on this PC. Messages go only to the provider you configure."
        >
          {agent.hasKey ? (
            <Button onClick={() => void api.agentClearKey().then(setAgent)}>Remove</Button>
          ) : null}
        </Row>
        <div className="setting-block">
          <div className="field-row">
            <input
              type="password"
              value={agentKey}
              onChange={(event) => setAgentKey(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void saveAgentKey()
              }}
              placeholder={agent.hasKey ? 'Replace API key' : 'Paste your API key'}
              spellCheck={false}
              autoComplete="off"
            />
            <Button
              variant="primary"
              onClick={() => void saveAgentKey()}
              disabled={agentSaving || !agentKey.trim()}
            >
              {agentSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
          {agentSaved ? <p className="hint">Key saved.</p> : null}
          <div className="field-row">
            <input
              value={agentModel}
              onChange={(event) => setAgentModel(event.target.value)}
              onBlur={saveAgentEndpoint}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveAgentEndpoint()
              }}
              placeholder="Model"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <div className="field-row">
            <input
              value={agentBase}
              onChange={(event) => setAgentBase(event.target.value)}
              onBlur={saveAgentEndpoint}
              onKeyDown={(event) => {
                if (event.key === 'Enter') saveAgentEndpoint()
              }}
              placeholder="API base URL"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
          <p className="hint">
            Any OpenAI-compatible endpoint works. The default uses Z.ai&apos;s GLM models.{' '}
            <button
              type="button"
              className="link-btn"
              onClick={() => api.openExternal('https://z.ai')}
            >
              Get a key <ExternalIcon size={11} />
            </button>
          </p>
          {agent.error ? <p className="form-error">{agent.error}</p> : null}
        </div>

        <SectionLabel>Focus timer</SectionLabel>
        <Row title="Focus length">
          <Stepper
            value={settings.focus.workMinutes}
            min={5}
            max={120}
            step={5}
            suffix=" min"
            onChange={(next) => void updateSettings({ focus: { ...settings.focus, workMinutes: next } })}
          />
        </Row>
        <Row title="Short break">
          <Stepper
            value={settings.focus.breakMinutes}
            min={1}
            max={30}
            suffix=" min"
            onChange={(next) => void updateSettings({ focus: { ...settings.focus, breakMinutes: next } })}
          />
        </Row>
        <Row title="Long break">
          <Stepper
            value={settings.focus.longBreakMinutes}
            min={5}
            max={60}
            step={5}
            suffix=" min"
            onChange={(next) => void updateSettings({ focus: { ...settings.focus, longBreakMinutes: next } })}
          />
        </Row>
        <Row title="Long break after" detail={`${settings.focus.sessionsUntilLongBreak} focus sessions`}>
          <Stepper
            value={settings.focus.sessionsUntilLongBreak}
            min={2}
            max={8}
            onChange={(next) =>
              void updateSettings({ focus: { ...settings.focus, sessionsUntilLongBreak: next } })
            }
          />
        </Row>
        <Row title="Auto-continue" detail="Start the next phase automatically">
          <Switch
            checked={settings.focus.autoContinue}
            onChange={(next) => void updateSettings({ focus: { ...settings.focus, autoContinue: next } })}
            label="Auto-continue"
          />
        </Row>

        <SectionLabel>Updates</SectionLabel>
        <Row title="Check for updates" detail="Off by default. Never contacts anything unless enabled.">
          <Switch
            checked={settings.updates.enabled}
            onChange={(next) => void updateSettings({ updates: { ...settings.updates, enabled: next } })}
            label="Check for updates"
          />
        </Row>
        {settings.updates.enabled ? (
          <div className="setting-block">
            <div className="field-row">
              <input
                value={feedUrl}
                onChange={(event) => setFeedUrl(event.target.value)}
                placeholder="https://example.com/notch/latest.json"
                spellCheck={false}
                autoComplete="off"
              />
              <Button onClick={() => void checkUpdates()} disabled={checking}>
                {checking ? 'Checking…' : 'Check'}
              </Button>
            </div>
            {updateResult ? (
              <p className={`hint ${updateResult.error ? 'is-error' : ''}`}>
                {updateResult.error
                  ? updateResult.error
                  : updateResult.available
                    ? `Version ${updateResult.latest} is available (you have ${updateResult.current}).`
                    : `You're up to date on ${updateResult.current}.`}
              </p>
            ) : (
              <p className="hint">
                A JSON feed with <code>version</code> and an optional <code>url</code>.
              </p>
            )}
          </div>
        ) : null}

        <SectionLabel>Theme store</SectionLabel>
        <div className="store-head">
          <span className="store-balance">
            🐾 {state.motivation.paws} {CURRENCY}
          </span>
          <span className="setting-detail">
            Earned when {CAT_NAME} levels up — {TREATS_PER_LEVEL} treats per level, one treat per task done.
          </span>
        </div>
        <div className="theme-grid">
          {THEMES.map((theme) => {
            const owned = state.themes.owned.includes(theme.id)
            const active = state.themes.active === theme.id
            const afford = state.motivation.paws >= theme.price
            return (
              <div key={theme.id} className={`theme-card ${active ? 'is-active' : ''}`} data-theme-id={theme.id}>
                <span
                  className="theme-swatch"
                  style={{ background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})` }}
                />
                <div className="theme-copy">
                  <span className="theme-name">{theme.name}</span>
                  <span className="theme-note">{theme.note}</span>
                </div>
                {active ? (
                  <span className="theme-state">In use</span>
                ) : owned ? (
                  <Button variant="ghost" onClick={() => applyTheme(theme.id)}>
                    Use
                  </Button>
                ) : (
                  <Button variant="primary" disabled={!afford} onClick={() => buyTheme(theme.id)}>
                    🐾 {theme.price}
                  </Button>
                )}
              </div>
            )
          })}
        </div>

        <SectionLabel>Privacy</SectionLabel>
        <Row title="Camera & microphone alerts" detail="Uses Windows' own privacy registry on this PC">
          <Switch
            checked={settings.privacy.monitorDevices}
            onChange={(next) => void updateSettings({ privacy: { ...settings.privacy, monitorDevices: next } })}
            label="Camera and microphone alerts"
          />
        </Row>
        <p className="privacy-note">
          No account, no telemetry, no analytics. Everything Notcha remembers lives in a single file in your
          user data folder. Network access is limited to the features you switch on above.
        </p>

        <SectionLabel>About</SectionLabel>
        <Row
          title={`Notcha ${version}`}
          detail={
            demo
              ? 'Browser preview — some panels are simulated'
              : capabilities.bridge === 'ready'
                ? 'Windows media and system integration active'
                : capabilities.bridge === 'failed'
                  ? 'Windows integration unavailable'
                  : 'Connecting to Windows…'
          }
        >
          <Button variant="ghost" onClick={() => api.quit()}>
            Quit
          </Button>
        </Row>
        <p className="hint">
          Hover the notch to open it, move away to close. Press Esc to dismiss.
        </p>

        <SectionLabel>Developer</SectionLabel>
        <Row title="Chip stiffness" detail="How hard the glass springs toward the tab">
          <div className="spring-slider">
            <input
              type="range"
              min={60}
              max={420}
              step={5}
              value={settings.spring.stiffness}
              aria-label="Chip stiffness"
              onChange={(event) =>
                void updateSettings({
                  spring: { ...settings.spring, stiffness: Number(event.target.value) }
                })
              }
            />
            <span>{settings.spring.stiffness}</span>
          </div>
        </Row>
        <Row title="Chip damping" detail="Lower bounces more, higher feels heavier">
          <div className="spring-slider">
            <input
              type="range"
              min={4}
              max={60}
              // 0.1 so the 17.7 default is a real position on the track.
              step={0.1}
              value={settings.spring.damping}
              aria-label="Chip damping"
              onChange={(event) =>
                void updateSettings({ spring: { ...settings.spring, damping: Number(event.target.value) } })
              }
            />
            <span>{settings.spring.damping}</span>
          </div>
        </Row>
        <div className="inline-row">
          <span className="setting-detail">Chip and notch height share this spring; the rail icons bounce a little more.</span>
          <Button
            variant="ghost"
            onClick={() => void updateSettings({ spring: { ...DEFAULT_SETTINGS.spring } })}
          >
            Reset
          </Button>
        </div>
      </div>
    </div>
  )
}
