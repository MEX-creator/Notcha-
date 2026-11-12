import { useApp } from '../state'
import { todayKey } from '../../../shared/types'
import { Button, SectionLabel, Stepper, Switch } from './ui'
import { DropletIcon, MinusIcon, PlusIcon } from './Icons'

export default function WaterTab() {
  const { state, settings, addWater, resetWater, updateSettings } = useApp()
  const water = state.water.day === todayKey() ? state.water : { ...state.water, count: 0 }
  const goal = Math.max(1, settings.water.goal)
  const count = Math.min(water.count, goal)
  const percent = Math.round((count / goal) * 100)

  return (
    <div className="view view-water">
      <div className="water-head">
        <div className="water-count">
          <span className="water-number">{water.count}</span>
          <span className="water-goal">of {goal} glasses</span>
        </div>
        <span className="water-percent">{percent}%</span>
      </div>

      <div className="water-bar">
        <span style={{ width: `${Math.max(3, percent)}%` }} />
      </div>

      <div className="water-glasses">
        {Array.from({ length: goal }).map((_, index) => (
          <span key={index} className={`glass ${index < count ? 'is-full' : ''}`} title={`Glass ${index + 1}`}>
            <DropletIcon size={15} />
          </span>
        ))}
      </div>

      <div className="water-actions">
        <Button variant="primary" onClick={() => addWater(1)}>
          <PlusIcon size={15} /> Add a glass
        </Button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => addWater(-1)}
          title="Remove a glass"
          disabled={water.count === 0}
        >
          <MinusIcon size={16} />
        </button>
        <button type="button" className="link-btn" onClick={resetWater}>
          Reset today
        </button>
      </div>

      <SectionLabel>Reminders</SectionLabel>
      <div className="setting-row">
        <div className="setting-copy">
          <span className="setting-title">Water reminders</span>
          <span className="setting-detail">
            {settings.water.startHour}:00 – {settings.water.endHour}:00
          </span>
        </div>
        <Switch
          checked={settings.water.remindersEnabled}
          onChange={(next) => void updateSettings({ water: { ...settings.water, remindersEnabled: next } })}
          label="Water reminders"
        />
      </div>
      <div className="setting-row">
        <div className="setting-copy">
          <span className="setting-title">Every</span>
          <span className="setting-detail">A nudge if you haven't logged a glass</span>
        </div>
        <Stepper
          value={settings.water.intervalMinutes}
          min={10}
          max={180}
          step={5}
          suffix=" min"
          onChange={(next) => void updateSettings({ water: { ...settings.water, intervalMinutes: next } })}
        />
      </div>
      <div className="setting-row">
        <div className="setting-copy">
          <span className="setting-title">Daily goal</span>
          <span className="setting-detail">Glasses per day (250 ml each)</span>
        </div>
        <Stepper
          value={settings.water.goal}
          min={1}
          max={16}
          onChange={(next) => void updateSettings({ water: { ...settings.water, goal: next } })}
        />
      </div>
    </div>
  )
}
