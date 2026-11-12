import type { Settings, WeatherNow } from '../../shared/types'

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const CACHE_MS = 10 * 60_000

export interface GeoResult {
  name: string
  label: string
  latitude: number
  longitude: number
}

interface GeoApiResponse {
  results?: {
    name: string
    latitude: number
    longitude: number
    admin1?: string
    country?: string
  }[]
}

interface ForecastResponse {
  current?: {
    temperature_2m?: number
    relative_humidity_2m?: number
    weather_code?: number
    is_day?: number
    wind_speed_10m?: number
  }
  daily?: {
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
  }
}

export class WeatherService {
  private cache: { at: number; payload: WeatherNow } | null = null

  async geocode(query: string): Promise<GeoResult[]> {
    const place = query.trim()
    if (!place) return []
    const url = `${GEO_URL}?name=${encodeURIComponent(place)}&count=6&language=en&format=json`
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!response.ok) return []
      const data = (await response.json()) as GeoApiResponse
      return (data.results ?? []).map((item) => ({
        name: item.name,
        label: [item.name, item.admin1, item.country].filter(Boolean).join(', '),
        latitude: item.latitude,
        longitude: item.longitude
      }))
    } catch {
      return []
    }
  }

  async get(settings: Settings, force = false): Promise<WeatherNow | null> {
    if (!settings.weather.enabled) return null
    if (this.cache && !force && Date.now() - this.cache.at < CACHE_MS) return this.cache.payload

    let latitude = settings.weather.latitude
    let longitude = settings.weather.longitude
    if (latitude === null || longitude === null) {
      if (!settings.weather.place) return null
      const matches = await this.geocode(settings.weather.place)
      const first = matches[0]
      if (!first) return null
      latitude = first.latitude
      longitude = first.longitude
    }

    const unit = settings.weather.unit
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: 'temperature_2m,relative_humidity_2m,weather_code,is_day,wind_speed_10m',
      daily: 'temperature_2m_max,temperature_2m_min',
      timezone: 'auto',
      forecast_days: '1'
    })
    if (unit === 'f') {
      params.set('temperature_unit', 'fahrenheit')
      params.set('wind_speed_unit', 'mph')
    }

    try {
      const response = await fetch(`${FORECAST_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(10_000)
      })
      if (!response.ok) return null
      const data = (await response.json()) as ForecastResponse
      const current = data.current
      if (!current || typeof current.temperature_2m !== 'number') return null

      const payload: WeatherNow = {
        place: settings.weather.place || 'Here',
        temperature: Math.round(current.temperature_2m),
        unit: unit === 'f' ? 'F' : 'C',
        code: current.weather_code ?? 0,
        isDay: current.is_day !== 0,
        high: Math.round(data.daily?.temperature_2m_max?.[0] ?? current.temperature_2m),
        low: Math.round(data.daily?.temperature_2m_min?.[0] ?? current.temperature_2m),
        humidity: Math.round(current.relative_humidity_2m ?? 0),
        wind: Math.round(current.wind_speed_10m ?? 0),
        updatedAt: Date.now()
      }
      this.cache = { at: Date.now(), payload }
      return payload
    } catch {
      return null
    }
  }

  clear(): void {
    this.cache = null
  }
}
