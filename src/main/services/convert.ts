import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import type {
  ConvertItemResult,
  ConvertKind,
  ConvertOptions,
  ConvertPlan,
  ConvertQuality,
  ConvertResult,
  ConvertTarget
} from '../../shared/types'

/**
 * Conversions run locally through a bundled ffmpeg. Nothing is uploaded, the
 * source file is never touched, and the result is written beside it under a
 * name that does not exist yet.
 */

const IMAGE_INPUT = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff', 'ico', 'avif']
const AUDIO_INPUT = ['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus', 'wma', 'aiff']
const VIDEO_INPUT = ['mp4', 'webm', 'mkv', 'mov', 'avi', 'm4v', 'wmv']

function targets(extensions: string[]): ConvertTarget[] {
  return extensions.map((extension) => ({ id: extension, label: extension.toUpperCase() }))
}

const TARGETS: Record<Exclude<ConvertKind, 'unknown'>, ConvertTarget[]> = {
  image: targets(['png', 'jpg', 'webp', 'bmp', 'gif', 'tiff']),
  audio: targets(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'opus']),
  // Video can also give up its sound track.
  video: targets(['mp4', 'webm', 'mkv', 'gif', 'mp3', 'wav'])
}

function extensionOf(target: string): string {
  return path.extname(target).replace(/^\./, '').toLowerCase()
}

function kindOf(extension: string): ConvertKind {
  if (IMAGE_INPUT.includes(extension)) return 'image'
  if (AUDIO_INPUT.includes(extension)) return 'audio'
  if (VIDEO_INPUT.includes(extension)) return 'video'
  return 'unknown'
}

export function planFor(target: string): ConvertPlan {
  const extension = extensionOf(target)
  const kind = kindOf(extension)
  if (kind === 'unknown') return { kind, targets: [] }
  const same = (id: string): boolean => id === extension || (extension === 'jpeg' && id === 'jpg')
  return { kind, targets: TARGETS[kind].filter((entry) => !same(entry.id)) }
}

/** The packaged binary lives outside the asar archive so it can be executed. */
function binary(): string | null {
  if (!ffmpegPath) return null
  return ffmpegPath.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
}

function normalize(options?: Partial<ConvertOptions>): ConvertOptions {
  const quality: ConvertQuality =
    options?.quality === 'high' || options?.quality === 'small' ? options.quality : 'balanced'
  const size = Number(options?.maxSize)
  return {
    quality,
    maxSize: Number.isFinite(size) && size >= 64 ? Math.min(8192, Math.round(size)) : null
  }
}

/**
 * Fits the frame inside a square of `limit` pixels without ever enlarging it, so
 * a small file stays its original size and a large one keeps its aspect ratio.
 */
function capFilter(limit: number | null): string | null {
  if (!limit) return null
  return `scale=w='min(iw,${limit})':h='min(ih,${limit})':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`
}

function imageArgs(target: string, quality: ConvertQuality, scale: string | null, head: string[], output: string): string[] {
  const resize = scale ? ['-vf', scale] : []
  const still = [...head, '-frames:v', '1', ...resize]
  switch (target) {
    case 'png':
      return [...still, '-c:v', 'png', '-compression_level', quality === 'high' ? '4' : quality === 'small' ? '9' : '6', output]
    case 'jpg':
      return [...still, '-q:v', quality === 'high' ? '2' : quality === 'small' ? '12' : '5', output]
    case 'webp':
      return [...still, '-quality', quality === 'high' ? '94' : quality === 'small' ? '62' : '82', output]
    case 'bmp':
      return [...still, '-c:v', 'bmp', output]
    case 'tiff':
      return [...still, '-c:v', 'tiff', output]
    case 'gif':
      return [...still, '-loop', '0', output]
    default:
      return []
  }
}

function audioArgs(target: string, quality: ConvertQuality): string[] {
  switch (target) {
    case 'mp3':
      return ['-vn', '-c:a', 'libmp3lame', '-q:a', quality === 'high' ? '0' : quality === 'small' ? '5' : '2']
    case 'wav':
      return ['-vn', '-c:a', 'pcm_s16le']
    case 'ogg':
      return ['-vn', '-c:a', 'libvorbis', '-q:a', quality === 'high' ? '7' : quality === 'small' ? '3' : '5']
    case 'flac':
      return ['-vn', '-c:a', 'flac', '-compression_level', quality === 'high' ? '5' : quality === 'small' ? '12' : '8']
    case 'm4a':
      return ['-vn', '-c:a', 'aac', '-b:a', quality === 'high' ? '256k' : quality === 'small' ? '128k' : '192k']
    case 'opus':
      return ['-vn', '-c:a', 'libopus', '-b:a', quality === 'high' ? '192k' : quality === 'small' ? '96k' : '128k']
    default:
      return []
  }
}

function videoArgs(
  target: string,
  quality: ConvertQuality,
  scale: string | null,
  head: string[],
  output: string
): string[] {
  const resize = scale ? ['-vf', scale] : []
  switch (target) {
    case 'mp4':
      return [
        ...head,
        ...resize,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        quality === 'high' ? '20' : quality === 'small' ? '28' : '23',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        '-movflags',
        '+faststart',
        output
      ]
    case 'webm':
      return [
        ...head,
        ...resize,
        '-c:v',
        'libvpx-vp9',
        '-crf',
        quality === 'high' ? '30' : quality === 'small' ? '38' : '32',
        '-b:v',
        '0',
        '-c:a',
        'libopus',
        '-b:a',
        '128k',
        output
      ]
    case 'mkv':
      return [
        ...head,
        ...resize,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        quality === 'high' ? '20' : quality === 'small' ? '28' : '23',
        '-c:a',
        'aac',
        '-b:a',
        '160k',
        output
      ]
    case 'gif': {
      const fps = `fps=${quality === 'high' ? '15' : quality === 'small' ? '8' : '12'}`
      const chain = [fps, scale, 'split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer']
        .filter(Boolean)
        .join(',')
      return [...head, '-vf', chain as string, '-loop', '0', output]
    }
    case 'mp3':
    case 'wav': {
      const audio = audioArgs(target, quality)
      return audio.length > 0 ? [...head, ...audio, output] : []
    }
    default:
      return []
  }
}

function argsFor(
  kind: ConvertKind,
  target: string,
  input: string,
  output: string,
  options: ConvertOptions
): string[] {
  const head = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', input]
  const scale = capFilter(options.maxSize)

  if (kind === 'image') return imageArgs(target, options.quality, scale, head, output)
  if (kind === 'audio') {
    const audio = audioArgs(target, options.quality)
    return audio.length > 0 ? [...head, ...audio, output] : []
  }
  if (kind === 'video') return videoArgs(target, options.quality, scale, head, output)
  return []
}

async function freeName(directory: string, base: string, extension: string): Promise<string> {
  let index = 0
  for (;;) {
    const suffix = index === 0 ? '' : index === 1 ? ' (converted)' : ` (converted ${index})`
    const candidate = path.join(directory, `${base}${suffix}.${extension}`)
    try {
      await fs.access(candidate)
    } catch {
      return candidate
    }
    index += 1
    if (index > 999) return path.join(directory, `${base} (converted).${extension}`)
  }
}

function run(binaryPath: string, args: string[], timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn(binaryPath, args, { windowsHide: true })
    let errors = ''
    child.stderr.on('data', (chunk: Buffer) => {
      errors = `${errors}${chunk.toString('utf8')}`.slice(-1200)
    })
    const timer = setTimeout(() => {
      child.kill()
      resolve('The conversion took too long and was stopped.')
    }, timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve(error.message)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(null)
      else resolve(errors.trim().split('\n').slice(-3).join(' ').slice(0, 400) || `ffmpeg exited with ${code}.`)
    })
  })
}

/** Formats that work for every file in the selection, so a batch never mixes kinds. */
export function planForMany(paths: string[]): ConvertPlan {
  const plans = paths.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => planFor(entry))
  if (plans.length === 0) return { kind: 'unknown', targets: [] }
  const kinds = new Set(plans.map((plan) => plan.kind))
  const targets = plans[0].targets.filter((target) => plans.every((plan) => plan.targets.some((entry) => entry.id === target.id)))
  return { kind: kinds.size === 1 ? plans[0].kind : 'unknown', targets }
}

/** Converts each file in turn; one failure does not stop the rest. */
export async function convertMany(
  paths: string[],
  format: string,
  options?: Partial<ConvertOptions>
): Promise<ConvertItemResult[]> {
  const results: ConvertItemResult[] = []
  for (const entry of paths.slice(0, 40)) {
    const result = await convertFile(entry, format, options)
    results.push({ path: entry, ok: result.ok, output: result.output, error: result.error })
  }
  return results
}

export async function convertFile(
  target: string,
  format: string,
  options?: Partial<ConvertOptions>
): Promise<ConvertResult> {
  try {
    const binaryPath = binary()
    if (!binaryPath) return { ok: false, output: null, error: 'The converter is unavailable in this build.' }

    const source = path.resolve(target)
    const extension = extensionOf(source)
    const kind = kindOf(extension)
    if (kind === 'unknown') return { ok: false, output: null, error: 'That kind of file cannot be converted.' }

    const allowed = TARGETS[kind].some((entry) => entry.id === format)
    if (!allowed) return { ok: false, output: null, error: 'That format is not available for this file.' }

    const stat = await fs.stat(source)
    if (!stat.isFile()) return { ok: false, output: null, error: 'Only files can be converted.' }

    const settings = normalize(options)
    const output = await freeName(path.dirname(source), path.basename(source, path.extname(source)), format)
    const args = argsFor(kind, format, source, output, settings)
    if (args.length === 0) return { ok: false, output: null, error: 'That conversion is not supported.' }

    const failure = await run(binaryPath, args, kind === 'video' ? 10 * 60_000 : 2 * 60_000)
    if (failure) {
      await fs.rm(output, { force: true }).catch(() => undefined)
      return { ok: false, output: null, error: failure }
    }
    return { ok: true, output, error: null }
  } catch (error) {
    return { ok: false, output: null, error: (error as Error).message }
  }
}
