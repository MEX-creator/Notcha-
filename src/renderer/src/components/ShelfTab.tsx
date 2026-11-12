import { useEffect, useState, type DragEvent } from 'react'
import { useApp } from '../state'
import type {
  ConvertItemResult,
  ConvertPlan,
  ConvertQuality,
  ConvertResult,
  ShelfItem
} from '../../../shared/types'
import { Button, EmptyState } from './ui'
import { CloseIcon, ConvertIcon, FileIcon, FolderIcon, PlusIcon, ShelfIcon } from './Icons'

function fileName(target: string): string {
  return target.split(/[\\/]/).pop() ?? target
}

const QUALITIES: { id: ConvertQuality; label: string; detail: string }[] = [
  { id: 'high', label: 'High', detail: 'Best quality, largest file' },
  { id: 'balanced', label: 'Balanced', detail: 'Sensible quality and size' },
  { id: 'small', label: 'Small', detail: 'Smallest file, visible trade-off' }
]

const IMAGE_SIZES = [2048, 1280, 800]
const VIDEO_SIZES = [
  { id: 1080, label: '1080p' },
  { id: 720, label: '720p' },
  { id: 480, label: '480p' }
]

export default function ShelfTab() {
  const { api, state, updateState } = useApp()
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [convert, setConvert] = useState<ShelfItem | null>(null)
  const [batchPaths, setBatchPaths] = useState<string[] | null>(null)
  const [plan, setPlan] = useState<ConvertPlan | null>(null)
  const [format, setFormat] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<ConvertResult | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [quality, setQuality] = useState<ConvertQuality>('balanced')
  const [maxSize, setMaxSize] = useState<number | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])

  const open = Boolean(convert) || (batchPaths !== null && batchPaths.length > 0)

  useEffect(() => {
    setPlan(null)
    setFormat(null)
    setResult(null)
    setSummary(null)
    setQuality('balanced')
    setMaxSize(null)
    const paths = convert ? [convert.path] : (batchPaths ?? [])
    if (paths.length === 0) return
    let alive = true
    const request = paths.length === 1 ? api.convertPlan(paths[0]) : api.convertPlanMany(paths)
    request
      .then((next) => {
        if (!alive) return
        setPlan(next)
        setFormat(next.targets[0]?.id ?? null)
      })
      .catch((caught: Error) => {
        if (alive) setError(caught.message)
      })
    return () => {
      alive = false
    }
  }, [api, convert, batchPaths])

  const addFiles = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const next = await api.shelfAdd()
      await updateState({ shelf: next.shelf })
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleDrop = async (event: DragEvent<HTMLDivElement>): Promise<void> => {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length === 0) return
    const paths = files.map((file) => api.pathForFile(file)).filter(Boolean)
    if (paths.length === 0) {
      setError('Those items could not be read.')
      return
    }
    try {
      const next = await api.shelfAddPaths(paths)
      await updateState({ shelf: next.shelf })
      setError(null)
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  const remove = async (id: string): Promise<void> => {
    const next = await api.shelfRemove(id)
    await updateState({ shelf: next.shelf })
  }

  const toggle = (id: string): void => {
    setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]))
  }

  const closeSheet = (): void => {
    setConvert(null)
    setBatchPaths(null)
  }

  const runConvert = async (): Promise<void> => {
    if (!format) return
    if (!convert) {
      const paths = batchPaths ?? []
      if (paths.length === 0) return
      setRunning(true)
      setSummary(null)
      try {
        const results: ConvertItemResult[] = await api.convertBatch(paths, format, { quality, maxSize })
        const ok = results.filter((entry) => entry.ok).length
        const firstError = results.find((entry) => !entry.ok)?.error
        setSummary(
          ok === results.length
            ? `Converted ${ok} ${ok === 1 ? 'file' : 'files'}`
            : `Converted ${ok} of ${results.length} · ${firstError ?? 'some files failed'}`
        )
        if (ok === results.length) setSelected([])
      } catch (caught) {
        setError((caught as Error).message)
      } finally {
        setRunning(false)
      }
      return
    }
    setRunning(true)
    setResult(null)
    try {
      setResult(await api.convertRun(convert.path, format, { quality, maxSize }))
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const sizes =
    plan?.kind === 'video' ? VIDEO_SIZES : IMAGE_SIZES.map((size) => ({ id: size, label: `${size}px` }))
  const batchCount = batchPaths?.length ?? 0
  const title = convert ? convert.name : `${batchCount} ${batchCount === 1 ? 'file' : 'files'}`

  return (
    <div className="view view-shelf">
      <div
        className={`dropzone ${dragging ? 'is-dragging' : ''} ${state.shelf.length === 0 ? 'is-empty' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => void handleDrop(event)}
      >
        {state.shelf.length === 0 ? (
          <EmptyState
            icon={<ShelfIcon size={24} />}
            title="Drop files here"
            detail="Keep a file, folder or shortcut one hover away. Nothing is copied or uploaded."
          >
            <Button variant="primary" onClick={() => void addFiles()} disabled={busy}>
              <PlusIcon size={14} /> Choose files
            </Button>
          </EmptyState>
        ) : (
          <div className="shelf-list">
            {state.shelf.map((item) => {
              const picked = selected.includes(item.id)
              return (
                <div className={`shelf-item ${picked ? 'is-selected' : ''}`} key={item.id}>
                  <button
                    type="button"
                    className="shelf-open"
                    onClick={() => {
                      if (selecting && item.kind === 'file') {
                        toggle(item.id)
                        return
                      }
                      api.shelfOpen(item.path)
                    }}
                    title={item.path}
                  >
                    <span className="shelf-icon">
                      {selecting && item.kind === 'file' ? (
                        <span className={`shelf-tick ${picked ? 'is-on' : ''}`} />
                      ) : item.kind === 'folder' ? (
                        <FolderIcon size={16} />
                      ) : (
                        <FileIcon size={16} />
                      )}
                    </span>
                    <span className="shelf-copy">
                      <span className="shelf-name">{item.name}</span>
                      <span className="shelf-path">{item.path}</span>
                    </span>
                  </button>
                  {selecting ? null : (
                    <>
                      {item.kind === 'file' ? (
                        <button
                          type="button"
                          className={`row-action ${convert?.id === item.id ? 'is-active' : ''}`}
                          title="Convert"
                          onClick={() => setConvert(convert?.id === item.id ? null : item)}
                        >
                          <ConvertIcon size={13} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="row-action"
                        title="Show in folder"
                        onClick={() => api.shelfReveal(item.path)}
                      >
                        <FolderIcon size={13} />
                      </button>
                      <button
                        type="button"
                        className="row-action"
                        title="Remove from shelf"
                        onClick={() => void remove(item.id)}
                      >
                        <CloseIcon size={13} />
                      </button>
                    </>
                  )}
                </div>
              )
            })}
            <div className="shelf-tools">
              <button type="button" className="shelf-add" onClick={() => void addFiles()} disabled={busy}>
                <PlusIcon size={14} /> Add files
              </button>
              {state.shelf.some((item) => item.kind === 'file') ? (
                <button
                  type="button"
                  className="shelf-batch"
                  onClick={() => {
                    setSelecting(!selecting)
                    setSelected([])
                    closeSheet()
                  }}
                >
                  {selecting ? 'Done' : 'Select'}
                </button>
              ) : null}
            </div>
            {selecting ? (
              <div className="batch-bar">
                <span className="hint">{selected.length} selected</span>
                <Button
                  variant="primary"
                  disabled={selected.length === 0}
                  onClick={() =>
                    setBatchPaths(
                      state.shelf.filter((item) => selected.includes(item.id)).map((item) => item.path)
                    )
                  }
                >
                  Convert
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {open ? (
        <div className="convert-sheet">
          <div className="convert-head">
            <span className="convert-name" title={convert?.path ?? undefined}>
              {title}
            </span>
            <button type="button" className="row-action" title="Close" onClick={closeSheet}>
              <CloseIcon size={12} />
            </button>
          </div>
          {plan === null ? (
            <p className="hint">Reading formats…</p>
          ) : plan.targets.length === 0 ? (
            <p className="hint">
              {convert ? 'No conversion available for this kind of file.' : 'No format is common to every selected file.'}
            </p>
          ) : (
            <>
              <div className="convert-row">
                <span className="convert-label">Quality</span>
                <div className="convert-targets">
                  {QUALITIES.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`chip ${quality === entry.id ? 'is-active' : ''}`}
                      title={entry.detail}
                      onClick={() => setQuality(entry.id)}
                      disabled={running}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
              {plan.kind === 'audio' ? null : (
                <div className="convert-row">
                  <span className="convert-label">Size</span>
                  <div className="convert-targets">
                    <button
                      type="button"
                      className={`chip ${maxSize === null ? 'is-active' : ''}`}
                      title="Keep the original dimensions"
                      onClick={() => setMaxSize(null)}
                      disabled={running}
                    >
                      Original
                    </button>
                    {sizes.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className={`chip ${maxSize === entry.id ? 'is-active' : ''}`}
                        title={`Fit inside ${entry.id} pixels`}
                        onClick={() => setMaxSize(entry.id)}
                        disabled={running}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="convert-row">
                <span className="convert-label">Format</span>
                <div className="convert-targets">
                  {plan.targets.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className={`chip ${format === entry.id ? 'is-active' : ''}`}
                      onClick={() => setFormat(entry.id)}
                      disabled={running}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
              <Button variant="primary" onClick={() => void runConvert()} disabled={!format || running}>
                {running
                  ? 'Converting…'
                  : `Convert ${convert ? '' : `${batchCount} ${batchCount === 1 ? 'file' : 'files'} `}to ${
                      format ? format.toUpperCase() : ''
                    }`}
              </Button>
            </>
          )}
          {summary ? <p className="hint convert-summary">{summary}</p> : null}
          {result ? (
            result.ok && result.output ? (
              <div className="convert-result">
                <span className="hint">Saved {fileName(result.output)}</span>
                <button
                  type="button"
                  className="row-action"
                  title="Show in folder"
                  onClick={() => api.shelfReveal(result.output as string)}
                >
                  <FolderIcon size={13} />
                </button>
              </div>
            ) : (
              <p className="form-error">{result.error}</p>
            )
          ) : null}
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}
      {selecting ? null : <p className="hint">Tip: drag a shortcut from the desktop straight onto the shelf.</p>}
    </div>
  )
}
