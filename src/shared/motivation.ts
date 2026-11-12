import { todayKey, type MotivationState } from './types'

/** The cat has a name; the currency does not exist anywhere outside this app. */
export const CAT_NAME = 'Mochi'
export const CURRENCY = 'Paws'

/** Every three treats is one level, and a level pays out Paws. */
export const TREATS_PER_LEVEL = 3
export const PAWS_PER_LEVEL = 15

/** Tasks needed in a day for that day to count toward the streak. */
export const STREAK_GOAL = 3

export function emptyMotivation(): MotivationState {
  return { days: {}, credited: [], treats: 0, paws: 0, best: 0 }
}

export function levelFor(treats: number): number {
  return 1 + Math.floor(Math.max(0, treats) / TREATS_PER_LEVEL)
}

/** How far into the current level the cat is. */
export function levelProgress(treats: number): { into: number; need: number } {
  return { into: Math.max(0, treats) % TREATS_PER_LEVEL, need: TREATS_PER_LEVEL }
}

/** Paws still needed for the next level. */
export function treatsToNextLevel(treats: number): number {
  return TREATS_PER_LEVEL - (Math.max(0, treats) % TREATS_PER_LEVEL)
}

function dayKeyOffset(offset: number, from = new Date()): string {
  const date = new Date(from)
  date.setDate(date.getDate() + offset)
  return todayKey(date)
}

/**
 * Consecutive days that reached the goal, counting back from today. A day that
 * has not reached the goal yet does not break yesterday's streak: the streak is
 * still alive until the day actually ends.
 */
export function streakFor(days: Record<string, number>, goal = STREAK_GOAL): number {
  const count = (key: string): number => Math.max(0, Number(days[key]) || 0)
  let offset = count(todayKey()) >= goal ? 0 : -1
  let streak = 0
  while (count(dayKeyOffset(offset)) >= goal) {
    streak += 1
    offset -= 1
    if (streak > 4000) break
  }
  return streak
}

export interface CreditResult {
  motivation: MotivationState
  /** Treats the cat just earned. */
  treats: number
  /** Levels gained by this credit. */
  levels: number
  /** Paws paid out for those levels. */
  paws: number
}

/**
 * Credits every completed task that has not paid out before, so unticking and
 * re-ticking a task can never farm treats. The caller decides when to run it;
 * this is pure so the store and the renderer agree on the maths.
 */
export function creditTasks(
  current: MotivationState,
  doneIds: string[],
  day = todayKey()
): CreditResult {
  const credited = new Set(current.credited)
  const fresh = doneIds.filter((id) => id && !credited.has(id))
  if (fresh.length === 0) return { motivation: current, treats: 0, levels: 0, paws: 0 }

  const treats = current.treats + fresh.length
  const levels = levelFor(treats) - levelFor(current.treats)
  const paws = levels * PAWS_PER_LEVEL
  const days = {
    ...current.days,
    [day]: Math.max(0, Number(current.days[day]) || 0) + fresh.length
  }
  const next: MotivationState = {
    days,
    credited: [...current.credited, ...fresh].slice(-800),
    treats,
    paws: current.paws + paws,
    best: Math.max(current.best, streakFor(days))
  }
  return { motivation: next, treats: fresh.length, levels, paws }
}
