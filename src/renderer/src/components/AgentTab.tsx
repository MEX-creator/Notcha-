import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, useTicker } from '../state'
import { Spinner } from './ui'
import Cat from './Cat'
import { SendIcon, SparkIcon, StopIcon } from './Icons'

const SUGGESTIONS = [
  'Plan my next hour',
  'What should I do first?',
  'Summarise my day',
  'What am I listening to?'
]

export default function AgentTab() {
  const {
    agent,
    agentMessages,
    agentStreaming,
    agentLinkWaiting,
    agentError,
    sendAgentMessage,
    stopAgent,
    clearAgent,
    setAgent,
    updateSettings,
    api,
    setView,
    state,
    media,
    settings
  } = useApp()
  const [text, setText] = useState('')
  const feedRef = useRef<HTMLDivElement | null>(null)
  const tick = useTicker(500)
  const [startedAt, setStartedAt] = useState(0)

  useEffect(() => {
    if (agentStreaming && startedAt === 0) setStartedAt(Date.now())
    if (!agentStreaming && startedAt !== 0) setStartedAt(0)
  }, [agentStreaming, startedAt])

  useEffect(() => {
    const feed = feedRef.current
    if (feed) feed.scrollTop = feed.scrollHeight
  }, [agentMessages, agentStreaming])

  const context = useMemo(() => {
    const openTasks = state.tasks.filter((task) => !task.done).length
    const chips: string[] = []
    if (media.active && media.title) chips.push(`${media.title} · ${media.artist || media.appName}`)
    chips.push(openTasks > 0 ? `${openTasks} open task${openTasks === 1 ? '' : 's'}` : 'no open tasks')
    chips.push(`${state.water.count}/${settings.water.goal} water`)
    chips.push(state.focus.running ? 'focus running' : `${Math.round(state.focus.remainingMs / 60_000)} min focus`)
    return chips
  }, [media, state.tasks, state.water, state.focus, settings.water.goal])

  const local = !agent.hasKey || agent.channel === 'local'
  const busy = agentStreaming || agentLinkWaiting
  const elapsed = startedAt > 0 ? Math.max(0, Math.round((tick - startedAt) / 1000)) : 0
  const lastMessage = agentMessages[agentMessages.length - 1]
  const waiting = agentStreaming && lastMessage?.role !== 'assistant'

  const submit = (event: React.FormEvent): void => {
    event.preventDefault()
    const value = text.trim()
    if (!value) return
    sendAgentMessage(value)
    setText('')
  }

  return (
    <div className="view view-agent">
      <div className="agent-status">
        {agentLinkWaiting ? (
          <>
            <Spinner size={12} />
            <span className="agent-status-text">Sent to your agent…</span>
          </>
        ) : agentStreaming ? (
          <>
            <Spinner size={12} />
            <span className="agent-status-text">
              {waiting ? 'Thinking…' : 'Writing…'}
              {elapsed > 0 ? ` ${elapsed}s` : ''}
            </span>
          </>
        ) : (
          <>
            <SparkIcon size={12} />
            <span className="agent-status-text">{local ? 'Local agent' : agent.model}</span>
          </>
        )}
        {!busy ? (
          <button
            type="button"
            className="link-btn agent-reset"
            onClick={() => {
              if (!agent.hasKey) {
                setView('settings')
                return
              }
              const next = local ? 'api' : 'local'
              void api.agentSetChannel(next).then(setAgent)
              void updateSettings({ agent: { ...settings.agent, channel: next } })
            }}
            title={local ? 'Answer with the model from Settings' : 'Talk to the coding agent on this PC'}
          >
            {local ? (agent.hasKey ? 'Use model' : 'Add a model') : 'Use local agent'}
          </button>
        ) : null}
        {agentMessages.length > 0 && !busy ? (
          <button type="button" className="link-btn agent-reset" onClick={clearAgent}>
            New chat
          </button>
        ) : null}
      </div>

      <div className="agent-feed" ref={feedRef}>
        {agentMessages.length === 0 ? (
          <div className="agent-intro">
            <div className="agent-mascot">
              <Cat size={26} mood={busy ? 'alert' : 'idle'} />
            </div>
            <p className="agent-intro-copy">
              {local
                ? 'Messages go straight to the coding agent on this PC and answers come right back here. It sees the summary below.'
                : 'Ask about your day, your music or what to do next. It only knows the summary below.'}
            </p>
            <div className="agent-chips">
              {context.map((chip) => (
                <span className="agent-chip" key={chip}>
                  {chip}
                </span>
              ))}
            </div>
            {local ? (
              <p className="agent-hint">
                Keep <code>node tools/notcha-agent.mjs --listen</code> running in the project to answer
                from the terminal.
              </p>
            ) : null}
            <div className="agent-suggestions">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="agent-suggestion"
                  onClick={() => sendAgentMessage(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          agentMessages.map((message, index) => (
            <div
              key={message.id}
              className={`agent-msg is-${message.role}${message.error ? ' is-error' : ''}`}
            >
              {message.text}
              {agentStreaming && index === agentMessages.length - 1 && message.role === 'assistant' ? (
                <span className="agent-caret" aria-hidden="true" />
              ) : null}
            </div>
          ))
        )}
        {waiting ? (
          <div className="agent-msg is-assistant is-waiting" aria-live="polite">
            <span className="typing">
              <i />
              <i />
              <i />
            </span>
          </div>
        ) : null}
      </div>

      {agentError ? <p className="form-error">{agentError}</p> : null}

      <form className="agent-compose" onSubmit={submit}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={local ? 'Message your agent…' : 'Ask anything…'}
          maxLength={500}
          spellCheck={false}
          autoComplete="off"
        />
        {busy ? (
          <button type="button" className="agent-send" onClick={stopAgent} title="Stop">
            <StopIcon size={13} />
          </button>
        ) : (
          <button type="submit" className="agent-send" disabled={!text.trim()} title="Send">
            <SendIcon size={14} />
          </button>
        )}
      </form>
    </div>
  )
}
