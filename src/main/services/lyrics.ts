import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { LyricsPayload, LyricLine } from '../../shared/types'

const USER_AGENT = 'Notcha/1.0 (Windows desktop music widget)'
const TIMEOUT_MS = 8000

interface LrclibRecord {
  id: number
  trackName: string
  artistName: string
  albumName?: string
  duration?: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
}

export interface TrackQuery {
  title: string
  artist: string
  album: string
  duration: number
}

export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)]
    if (stamps.length === 0) continue
    const content = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const stamp of stamps) {
      const minutes = Number(stamp[1] ?? 0)
      const seconds = Number(stamp[2] ?? 0)
      const fractionRaw = stamp[3] ?? ''
      let fraction = 0
      if (fractionRaw.length === 3) fraction = Number(fractionRaw) / 1000
      else if (fractionRaw.length === 2) fraction = Number(fractionRaw) / 100
      else if (fractionRaw.length === 1) fraction = Number(fractionRaw) / 10
      const time = minutes * 60 + seconds + fraction
      if (Number.isFinite(time)) lines.push({ time, text: content })
    }
  }
  return lines.sort((a, b) => a.time - b.time)
}

function toPayload(record: LrclibRecord): LyricsPayload {
  const synced = typeof record.syncedLyrics === 'string' && record.syncedLyrics.trim().length > 0
  const lines = synced ? parseLrc(record.syncedLyrics ?? '') : []
  const plain = record.plainLyrics ?? null
  if (!synced && plain && plain.trim() && record.instrumental !== true) {
    // Unsynced fallback: no timings, rendered as a plain block.
    return {
      synced: false,
      lines: plain
        .split(/\r?\n/)
        .map((text) => text.trim())
        .filter(Boolean)
        .map((text) => ({ time: -1, text })),
      plain,
      instrumental: false,
      source: 'LRCLIB',
      trackName: record.trackName,
      artistName: record.artistName
    }
  }
  return {
    synced: lines.length > 0,
    lines,
    plain,
    instrumental: record.instrumental === true,
    source: 'LRCLIB',
    trackName: record.trackName,
    artistName: record.artistName
  }
}

function score(record: LrclibRecord, track: TrackQuery): number {
  let value = 0
  const title = record.trackName?.toLowerCase().trim() ?? ''
  const artist = record.artistName?.toLowerCase().trim() ?? ''
  if (title === track.title.toLowerCase().trim()) value += 4
  else if (title.includes(track.title.toLowerCase().trim())) value += 2
  if (track.artist && artist.includes(track.artist.toLowerCase().split(',')[0]?.trim() ?? '')) value += 3
  if (record.syncedLyrics) value += 2
  if (track.duration > 0 && record.duration) {
    const delta = Math.abs(record.duration - track.duration)
    if (delta <= 2) value += 4
    else if (delta <= 6) value += 1
  }
  return value
}

const NOISE_PATTERNS = [
  /\((?:official|lyric|lyrics|audio|video|visuali[sz]er|music video|mv|hd|hq|4k|8k|explicit|clean|remaster(?:ed)?|remastered \d{4})[^)]*\)/gi,
  /\[(?:official|lyric|lyrics|audio|video|hd|4k)[^\]]*\]/gi,
  /\s*[-–|]\s*topic\s*$/i,
  /\s*[\(\[]\s*(?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[\)\]]/gi,
  /\s+(?:feat\.?|ft\.?|featuring)\s+.*$/i
]

export function cleanTrackTitle(raw: string): string {
  let value = raw
  for (const pattern of NOISE_PATTERNS) value = value.replace(pattern, ' ')
  return value.replace(/\s{2,}/g, ' ').replace(/\s*[-–]\s*$/, '').trim()
}

function titleVariants(track: TrackQuery): TrackQuery[] {
  const cleaned = cleanTrackTitle(track.title) || track.title
  const variants: TrackQuery[] = []
  const dashed = cleaned.match(/^(.{2,60}?)\s+[-–]\s+(.{1,})$/) 
  if (dashed?.[1] && dashed[2]) {
    const left = dashed[1].trim()
    const right = dashed[2].trim()
    variants.push({ ...track, title: right, artist: left })
    variants.push({ ...track, title: right })
  }
  variants.push({ ...track, title: cleaned })

  const seen = new Set<string>()
  return variants.filter((variant) => {
    const key = `${variant.title.toLowerCase()}|${variant.artist.toLowerCase()}`
    if (!variant.title || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export class LyricsService {
  private inFlight = new Map<string, Promise<LyricsPayload | null>>()

  constructor(private cacheDirectory: string) {}

  async get(track: TrackQuery, enabled: boolean): Promise<LyricsPayload | null> {
    if (!enabled) return null
    if (!track.title || track.title.length < 1) return null

    const key = `${track.title}|${track.artist}|${track.album}|${Math.round(track.duration)}`
    const hash = createHash('sha1').update(key).digest('hex')

    const existing = this.inFlight.get(hash)
    if (existing) return existing

    const task = this.load(hash, track).finally(() => this.inFlight.delete(hash))
    this.inFlight.set(hash, task)
    return task
  }

  private async load(hash: string, track: TrackQuery): Promise<LyricsPayload | null> {
    const file = path.join(this.cacheDirectory, `${hash}.json`)
    try {
      const raw = await fs.readFile(file, 'utf8')
      const cached = JSON.parse(raw) as { payload?: LyricsPayload }
      if (cached?.payload) return cached.payload
    } catch {
      // not cached yet
    }

    const payload = await this.fetch(track)
    if (payload) {
      try {
        await fs.mkdir(this.cacheDirectory, { recursive: true })
        await fs.writeFile(file, JSON.stringify({ savedAt: Date.now(), payload }), 'utf8')
      } catch {
        // cache is best effort only
      }
    }
    return payload
  }

  private async fetch(track: TrackQuery): Promise<LyricsPayload | null> {
    const variants = titleVariants(track).slice(0, 2)

    for (const variant of variants) {
      const exact = (await this.request('get', variant)) as LrclibRecord | null
      if (exact && !Array.isArray(exact)) {
        const payload = toPayload(exact)
        if (payload.lines.length > 0 || payload.instrumental) return payload
      }
    }

    const base = variants[0] ?? track
    const query = [base.title, base.artist].filter(Boolean).join(' ').trim()
    if (!query) return null
    const results = (await this.request('search', base, new URLSearchParams({ q: query }))) as
      | LrclibRecord[]
      | null
    if (!results || !Array.isArray(results)) return null

    const best = results
      .filter((record) => record.syncedLyrics || record.plainLyrics || record.instrumental)
      .map((record) => ({ record, value: score(record, base) }))
      .filter(({ record, value }) => {
        if (value < 6) return false
        if (base.duration > 0 && record.duration) {
          return Math.abs(record.duration - base.duration) <= 8
        }
        return true
      })
      .sort((a, b) => b.value - a.value)[0]

    if (!best) return null
    return toPayload(best.record)
  }

  private async request(
    endpoint: 'get' | 'search',
    track: TrackQuery,
    paramsOverride?: URLSearchParams
  ): Promise<LrclibRecord | LrclibRecord[] | null> {
    const params = paramsOverride ?? new URLSearchParams()
    if (!paramsOverride) {
      params.set('track_name', track.title)
      if (track.artist) params.set('artist_name', track.artist)
      if (track.album) params.set('album_name', track.album)
      if (track.duration > 0) params.set('duration', String(Math.round(track.duration)))
    }
    const url = `https://lrclib.net/api/${endpoint}?${params.toString()}`
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Lrclib-Client': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
      if (response.status === 429) {
        const retry = Number(response.headers.get('retry-after') ?? '3')
        await new Promise((resolve) => setTimeout(resolve, Math.min(10, retry) * 1000))
        return null
      }
      if (!response.ok) return null
      const type = response.headers.get('content-type') ?? ''
      if (!type.includes('json')) return null
      const body = (await response.json()) as LrclibRecord | LrclibRecord[]
      if (Array.isArray(body)) return body
      if (body && typeof body === 'object') return body
      return null
    } catch {
      return null
    }
  }
}
