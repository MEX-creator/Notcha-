import { statfsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { todayKey, type UsageDay } from '../shared/types'

export interface Perf {
  cpu: number
  ram: number
  disk: number | null
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function cpuTimes(): { idle: number; total: number } {
  let idle = 0
  let total = 0
  for (const cpu of os.cpus()) {
    const times = cpu.times
    idle += times.idle
    total += times.user + times.nice + times.sys + times.idle + times.irq
  }
  return { idle, total }
}

let previous = cpuTimes()

/** CPU is a delta between samples, so it needs the previous tick to mean anything. */
export function samplePerf(): Perf {
  const current = cpuTimes()
  const idleDelta = current.idle - previous.idle
  const totalDelta = current.total - previous.total
  previous = current
  const cpu = totalDelta > 0 ? clampPercent((1 - idleDelta / totalDelta) * 100) : 0

  const ram = clampPercent((1 - os.freemem() / os.totalmem()) * 100)

  let disk: number | null = null
  try {
    const root = path.parse(process.execPath).root || 'C:\\'
    const info = statfsSync(root)
    if (info.blocks > 0) disk = clampPercent((1 - info.bfree / info.blocks) * 100)
  } catch {
    disk = null
  }

  return { cpu, ram, disk }
}

/** Background processes never count as screen time. */
const IGNORED_APPS = new Set(['lockapp', 'logonui', 'notcha', 'electron', 'textinputhost'])

export function isTrackedApp(name: string | null | undefined): name is string {
  if (!name) return false
  const lower = name.toLowerCase()
  if (IGNORED_APPS.has(lower)) return false
  return lower.length > 0
}

/**
 * Adds `seconds` of screen time to today's usage. Older days are discarded, so
 * the stream of stats starts fresh at midnight.
 */
export function addUsage(usage: UsageDay, app: string, seconds: number, at = new Date()): UsageDay {
  const day = todayKey(at)
  const base: UsageDay =
    usage.day === day && Array.isArray(usage.hours) && usage.hours.length === 24
      ? usage
      : { day, total: 0, apps: [], hours: new Array(24).fill(0) }

  const hours = [...base.hours]
  hours[at.getHours()] = (hours[at.getHours()] ?? 0) + seconds

  const apps = base.apps.map((item) => ({ ...item }))
  const existing = apps.find((item) => item.name.toLowerCase() === app.toLowerCase())
  if (existing) existing.seconds += seconds
  else apps.push({ name: app, seconds })

  apps.sort((a, b) => b.seconds - a.seconds)

  return {
    day,
    total: base.total + seconds,
    apps: apps.slice(0, 8),
    hours
  }
}
