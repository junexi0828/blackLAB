import { useEffect, useState } from 'react'

interface ConsoleHUDProps {
  mission: string | null
  iteration: number | null
  iterationsCompleted: number
  loopStatus: string | null
  activeRunCount: number
  loopNote: string | null
  timeTheme: 'day' | 'night'
  localClockLabel: string
  themeSource: 'location' | 'timezone'
}

export function ConsoleHUD({
  mission,
  iteration,
  iterationsCompleted,
  loopStatus,
  activeRunCount,
  loopNote,
  timeTheme,
  localClockLabel,
  themeSource,
}: ConsoleHUDProps) {
  const isLive = loopStatus === 'running' || activeRunCount > 0
  const phaseIcon = timeTheme === 'day' ? '☀' : '☾'
  const phaseLabel = timeTheme === 'day' ? 'DAY SHIFT' : 'NIGHT SHIFT'
  const phaseSource = themeSource === 'location' ? 'GPS SOLAR' : 'TIMEZONE ESTIMATE'

  // Ticker clock
  const [clock, setClock] = useState(() => new Date().toISOString())
  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toISOString()), 1000)
    return () => clearInterval(id)
  }, [])

  const displayText = loopNote ?? mission

  return (
    <div className="console-hud" aria-hidden="true">
      {/* ── Top-left: company identity ── */}
      <div className="hud-brand">
        <span className="hud-phase-icon" aria-hidden="true">{phaseIcon}</span>
        <span className={`hud-dot ${isLive ? 'hud-dot--live' : ''}`} />
        <span className="hud-brand-name">blackLAB</span>
        <span className="hud-brand-sep">·</span>
        <span className="hud-brand-status">{isLive ? 'OPERATING' : 'STANDBY'}</span>
        <span className="hud-brand-sep">·</span>
        <span className="hud-phase-label">{phaseLabel}</span>
        <span className="hud-brand-sep">·</span>
        <span className="hud-phase-source">{phaseSource}</span>
      </div>

      {/* ── Top-right: iteration counter ── */}
      <div className="hud-iter-block">
        <span className="hud-iter-label">LOOP</span>
        <span className="hud-iter-num">{iteration ?? iterationsCompleted}</span>
      </div>

      {/* ── Bottom: mission ribbon ── */}
      <div className="hud-ribbon">
        {displayText && (
          <div className="hud-ribbon-mission">
            <span className="hud-small-tag">MISSION</span>
            <span className="hud-ribbon-text">{displayText}</span>
          </div>
        )}
        <div className="hud-ribbon-meta">
          <span>{activeRunCount} run{activeRunCount !== 1 ? 's' : ''} active</span>
          <span className="hud-sep" />
          <span>{iterationsCompleted} iterations done</span>
          <span className="hud-sep" />
          <span className="hud-clock">{localClockLabel} LOCAL</span>
          <span className="hud-sep" />
          <span>{clock.slice(11, 19)} UTC</span>
        </div>
      </div>
    </div>
  )
}
