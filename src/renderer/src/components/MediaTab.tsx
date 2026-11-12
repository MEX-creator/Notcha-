import { useEffect, useMemo, useState, type PointerEvent } from 'react'
import type { LyricsPayload } from '../../../shared/types'
import { useApp, useTicker } from '../state'
import { duration as formatDuration } from '../lib/format'
import { EmptyState, Spinner } from './ui'
import { MusicIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from './Icons'

const LINE_HEIGHT = 29
const CENTER = 104

export default function MediaTab() {
  const { media, api, settings, updateSettings } = useApp()
  const tick = useTicker(200)
  const [lyrics, setLyrics] = useState<LyricsPayload | null>(null)
  const [lyricsStatus, setLyricsStatus] = useState<'idle' | 'loading' | 'ready' | 'none'>('idle')
  const [pendingSeek, setPendingSeek] = useState<number | null>(null)

  useEffect(() => {
    setPendingSeek(null)
  }, [media.sampledAt])

  const position = useMemo(() => {
    if (pendingSeek !== null) return pendingSeek
    if (!media.active) return 0
    const live =
      media.status === 'playing'
        ? media.position + Math.max(0, tick - media.sampledAt) / 1000
        : media.position
    if (media.duration > 0) return Math.min(media.duration, live)
    return live
  }, [media, tick, pendingSeek])

  useEffect(() => {
    if (!media.active || !media.title || !settings.lyrics.enabled) {
      setLyrics(null)
      setLyricsStatus('idle')
      return
    }
    let alive = true
    setLyricsStatus('loading')
    api
      .lyrics({
        title: media.title,
        artist: media.artist,
        album: media.album,
        duration: media.duration
      })
      .then((result) => {
        if (!alive) return
        setLyrics(result)
        setLyricsStatus(result && result.lines.length > 0 ? 'ready' : 'none')
      })
      .catch(() => {
        if (!alive) return
        setLyrics(null)
        setLyricsStatus('none')
      })
    return () => {
      alive = false
    }
  }, [api, media.trackKey, media.active, media.title, media.artist, media.album, media.duration, settings.lyrics.enabled])

  const activeIndex = useMemo(() => {
    if (!lyrics?.synced) return -1
    let index = -1
    for (let i = 0; i < lyrics.lines.length; i += 1) {
      const line = lyrics.lines[i]
      if (line && line.time <= position + 0.25) index = i
      else break
    }
    return index
  }, [lyrics, position])

  const offset = activeIndex >= 0 ? CENTER - activeIndex * LINE_HEIGHT - LINE_HEIGHT / 2 : 12
  const progress = media.duration > 0 ? Math.max(0, Math.min(1, position / media.duration)) : 0
  const playing = media.status === 'playing'

  const seek = (event: PointerEvent<HTMLDivElement>): void => {
    if (!media.canSeek || media.duration <= 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    const target = ratio * media.duration
    setPendingSeek(target)
    api.media('seek', target)
  }

  const seekTo = (time: number): void => {
    if (!media.canSeek || time < 0) return
    setPendingSeek(time)
    api.media('seek', time)
  }

  if (!media.active) {
    return (
      <div className="view view-media">
        <EmptyState
          icon={<MusicIcon size={26} />}
          title="Nothing playing"
          detail="Start a song in Spotify, a browser, or any Windows media player and it will appear here."
        />
      </div>
    )
  }

  return (
    <div className="view view-media">
      {media.artwork ? (
        <div
          className="art-glow"
          style={{ backgroundImage: `url(${media.artwork})` }}
          aria-hidden="true"
        />
      ) : null}

      <div className="track">
        <div className="art">
          {media.artwork ? <img src={media.artwork} alt="" draggable={false} /> : <MusicIcon size={22} />}
        </div>
        <div className="track-meta">
          <div className="track-title" title={media.title}>
            {media.title || 'Unknown track'}
          </div>
          <div className="track-artist" title={media.artist}>
            {media.artist || 'Unknown artist'}
          </div>
          {media.album ? (
            <div className="track-album" title={media.album}>
              {media.album}
            </div>
          ) : null}
        </div>
        <span className="source-chip" title={`Now playing from ${media.appName}`}>
          {media.appName}
        </span>
      </div>

      <div className="progress-row">
        <span className="time">{formatDuration(position)}</span>
        <div
          className={`progress ${media.canSeek && media.duration > 0 ? 'is-seekable' : ''}`}
          onPointerDown={seek}
          role="slider"
          aria-label="Playback position"
          aria-valuemin={0}
          aria-valuemax={Math.round(media.duration)}
          aria-valuenow={Math.round(position)}
        >
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
            <div className="progress-knob" style={{ left: `${progress * 100}%` }} />
          </div>
        </div>
        <span className="time">{formatDuration(media.duration)}</span>
      </div>

      <div className="controls">
        <button
          type="button"
          className="ctrl"
          onClick={() => api.media('prev')}
          disabled={!media.canPrev}
          title="Previous"
        >
          <PrevIcon size={19} />
        </button>
        <button
          type="button"
          className="ctrl ctrl-play"
          onClick={() => api.media('playpause')}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing ? <PauseIcon size={19} /> : <PlayIcon size={19} />}
        </button>
        <button
          type="button"
          className="ctrl"
          onClick={() => api.media('next')}
          disabled={!media.canNext}
          title="Next"
        >
          <NextIcon size={19} />
        </button>
      </div>

      <div className="lyrics">
        {!settings.lyrics.enabled ? (
          <div className="lyrics-note">
            <span>Lyrics lookup is off.</span>
            <button
              type="button"
              className="link-btn"
              onClick={() => void updateSettings({ lyrics: { enabled: true } })}
            >
              Turn on
            </button>
          </div>
        ) : lyricsStatus === 'loading' ? (
          <div className="lyrics-note">
            <Spinner size={13} />
            <span>Finding lyrics…</span>
          </div>
        ) : lyricsStatus === 'none' || !lyrics ? (
          <div className="lyrics-note">
            <span>No synced lyrics found for this track.</span>
          </div>
        ) : lyrics.instrumental ? (
          <div className="lyrics-note">
            <span>Instrumental</span>
          </div>
        ) : lyrics.synced ? (
          <div className="lyrics-window">
            <div
              className="lyrics-track"
              style={{ transform: `translateY(${offset}px)` }}
            >
              {lyrics.lines.map((line, index) => {
                const distance = activeIndex < 0 ? 99 : index - activeIndex
                const state = distance === 0 ? 'is-active' : distance < 0 ? 'is-past' : 'is-next'
                return (
                  <div
                    key={`${line.time}-${index}`}
                    className={`lyric ${state}`}
                    onClick={() => seekTo(line.time)}
                    style={{ transitionDelay: '0ms' }}
                  >
                    {line.text || '♪'}
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="lyrics-plain">
            {lyrics.lines.map((line, index) => (
              <p key={index}>{line.text}</p>
            ))}
          </div>
        )}
        <div className="lyrics-source">
          {settings.lyrics.enabled && lyricsStatus === 'ready' && lyrics ? `Lyrics from ${lyrics.source}` : ''}
        </div>
      </div>
    </div>
  )
}
