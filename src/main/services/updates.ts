import type { UpdateResult } from '../../shared/types'

function parts(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, '')
    .split(/[.\-+\s]/)
    .map((piece) => Number.parseInt(piece, 10))
    .map((value) => (Number.isFinite(value) ? value : 0))
}

export function compareVersions(a: string, b: string): number {
  const left = parts(a)
  const right = parts(b)
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    const l = left[i] ?? 0
    const r = right[i] ?? 0
    if (l > r) return 1
    if (l < r) return -1
  }
  return 0
}

interface FeedShape {
  version?: string
  tag_name?: string
  notes?: string
  body?: string
  url?: string
  html_url?: string
  download?: string
  latest?: string | { version?: string; tag_name?: string; notes?: string; body?: string; url?: string; html_url?: string }
}

export async function checkForUpdates(current: string, feedUrl: string): Promise<UpdateResult> {
  const base: UpdateResult = {
    checkedAt: Date.now(),
    current,
    latest: null,
    available: false,
    notes: null,
    url: null,
    error: null
  }

  const trimmed = feedUrl.trim()
  if (!trimmed) {
    return { ...base, error: 'Add a JSON feed URL in settings to check for updates.' }
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(trimmed)
  } catch {
    return { ...base, error: 'That update feed URL is not valid.' }
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== '127.0.0.1' && parsedUrl.hostname !== 'localhost') {
    return { ...base, error: 'Use an https:// update feed.' }
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'Notcha/1.0' },
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) {
      return { ...base, error: `The update feed returned ${response.status}.` }
    }
    const data = (await response.json()) as FeedShape
    const nested = typeof data.latest === 'object' && data.latest !== null ? data.latest : null
    const latest =
      (typeof data.version === 'string' && data.version) ||
      (typeof data.tag_name === 'string' && data.tag_name) ||
      (typeof data.latest === 'string' && data.latest) ||
      nested?.version ||
      nested?.tag_name ||
      null

    if (!latest) {
      return { ...base, error: 'The update feed has no version field.' }
    }

    const notes = data.notes ?? data.body ?? nested?.notes ?? nested?.body ?? null
    const url = data.html_url ?? data.url ?? data.download ?? nested?.html_url ?? nested?.url ?? null

    return {
      ...base,
      latest,
      available: compareVersions(latest, current) > 0,
      notes: notes ? String(notes).slice(0, 2000) : null,
      url: url ? String(url) : null
    }
  } catch (error) {
    return { ...base, error: `Could not reach the update feed: ${(error as Error).message}` }
  }
}
