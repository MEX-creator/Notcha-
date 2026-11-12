import { useEffect, useState } from 'react'
import type { WeatherNow } from '../../../shared/types'
import { useApp } from '../state'

export function useWeather(): WeatherNow | null {
  const { api, settings } = useApp()
  const [weather, setWeather] = useState<WeatherNow | null>(null)
  const enabled = settings.weather.enabled && Boolean(settings.weather.place)
  const unit = settings.weather.unit
  const place = settings.weather.place

  useEffect(() => {
    if (!enabled) {
      setWeather(null)
      return
    }
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const next = await api.weather(false)
        if (alive) setWeather(next)
      } catch {
        /* weather is optional */
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 15 * 60_000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [api, enabled, place, unit])

  return weather
}
