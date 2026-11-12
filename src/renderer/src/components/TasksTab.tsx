import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GoogleTask } from '../../../shared/types'
import { useApp } from '../state'
import { Button, EmptyState, Segmented, Spinner } from './ui'
import { CheckIcon, CloseIcon, PlusIcon, TasksIcon } from './Icons'

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function TasksTab() {
  const { api, state, saveTasks, google, setView } = useApp()
  const [mode, setMode] = useState<'local' | 'google'>('local')
  const [text, setText] = useState('')
  const [googleTasks, setGoogleTasks] = useState<GoogleTask[]>([])
  const [googleError, setGoogleError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const loadGoogle = useCallback(async () => {
    if (!google.connected) return
    setLoading(true)
    try {
      const result = await api.googleTasks()
      setGoogleTasks(result.tasks)
      setGoogleError(result.error)
    } catch (error) {
      setGoogleError((error as Error).message)
    } finally {
      setLoading(false)
    }
  }, [api, google.connected])

  useEffect(() => {
    if (mode === 'google') void loadGoogle()
  }, [mode, loadGoogle])

  const localTasks = useMemo(
    () => [...state.tasks].sort((a, b) => Number(a.done) - Number(b.done) || b.createdAt - a.createdAt),
    [state.tasks]
  )

  const remaining = localTasks.filter((task) => !task.done).length

  const submit = async (): Promise<void> => {
    const value = text.trim()
    if (!value) return
    if (mode === 'google') {
      if (!google.connected) return
      const result = await api.googleAddTask(value)
      if (!result.ok) {
        setGoogleError(result.error)
        return
      }
      setText('')
      await loadGoogle()
      return
    }
    saveTasks([
      { id: uid(), text: value.slice(0, 300), done: false, createdAt: Date.now(), due: null },
      ...state.tasks
    ])
    setText('')
  }

  const toggleLocal = (id: string): void => {
    saveTasks(state.tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)))
  }

  const removeLocal = (id: string): void => {
    saveTasks(state.tasks.filter((task) => task.id !== id))
  }

  const toggleGoogle = async (task: GoogleTask): Promise<void> => {
    const result = await api.googleSetTask(task.listId, task.id, !task.done)
    if (!result.ok) setGoogleError(result.error)
    else await loadGoogle()
  }

  const removeGoogle = async (task: GoogleTask): Promise<void> => {
    const result = await api.googleDeleteTask(task.listId, task.id)
    if (!result.ok) setGoogleError(result.error)
    else await loadGoogle()
  }

  const googleMode = mode === 'google'

  return (
    <div className="view view-tasks">
      <div className="tasks-top">
        <Segmented
          compact
          value={mode}
          options={[
            { value: 'local', label: 'Local' },
            { value: 'google', label: 'Google' }
          ]}
          onChange={(next) => setMode(next)}
        />
        <span className="tasks-count">
          {googleMode
            ? `${googleTasks.filter((task) => !task.done).length} open`
            : `${remaining} open`}
        </span>
      </div>

      {googleMode && !google.connected ? (
        <EmptyState
          icon={<TasksIcon size={24} />}
          title="Google Tasks isn't connected"
          detail="Connect a Google account in Settings to sync tasks with your phone."
        >
          <Button variant="primary" onClick={() => setView('settings')}>
            Open settings
          </Button>
        </EmptyState>
      ) : (
        <>
          <form
            className="task-add"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <input
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={googleMode ? 'Add to Google Tasks…' : 'Add a task…'}
              maxLength={300}
              spellCheck={false}
            />
            <button type="submit" className="add-btn" disabled={!text.trim()} title="Add task">
              <PlusIcon size={15} />
            </button>
          </form>

          <div className="task-list">
            {googleMode ? (
              loading && googleTasks.length === 0 ? (
                <div className="centered">
                  <Spinner size={16} />
                </div>
              ) : googleTasks.length === 0 ? (
                <EmptyState title="No Google tasks" detail="Tasks you add here appear in Google Tasks." />
              ) : (
                googleTasks.map((task) => (
                  <div className={`task ${task.done ? 'is-done' : ''}`} key={task.id}>
                    <button
                      type="button"
                      className="check"
                      onClick={() => void toggleGoogle(task)}
                      aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {task.done ? <CheckIcon size={11} /> : null}
                    </button>
                    <span className="task-text">{task.title}</span>
                    <button
                      type="button"
                      className="row-action"
                      onClick={() => void removeGoogle(task)}
                      title="Delete task"
                    >
                      <CloseIcon size={13} />
                    </button>
                  </div>
                ))
              )
            ) : localTasks.length === 0 ? (
              <EmptyState
                icon={<TasksIcon size={24} />}
                title="No tasks yet"
                detail="Type above and press Enter. Tasks stay on this PC."
              />
            ) : (
              localTasks.map((task) => (
                <div className={`task ${task.done ? 'is-done' : ''}`} key={task.id}>
                  <button
                    type="button"
                    className="check"
                    onClick={() => toggleLocal(task.id)}
                    aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}
                  >
                    {task.done ? <CheckIcon size={11} /> : null}
                  </button>
                  <span className="task-text">{task.text}</span>
                  <button type="button" className="row-action" onClick={() => removeLocal(task.id)} title="Delete task">
                    <CloseIcon size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
          {googleMode && googleError ? <p className="form-error">{googleError}</p> : null}
        </>
      )}
    </div>
  )
}
