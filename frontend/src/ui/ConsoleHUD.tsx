import { useEffect, useState } from 'react'
import type { RoverCrewCounts } from './roverPersona'

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
  crewCounts: RoverCrewCounts
  systemMode: 'live' | 'stopping' | 'idle'
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
  crewCounts,
  systemMode,
}: ConsoleHUDProps) {
  const isLive = systemMode === 'live' || systemMode === 'stopping' || loopStatus === 'running'
  const phaseIcon = timeTheme === 'day' ? '☀' : '☾'
  const phaseLabel = timeTheme === 'day' ? 'DAY' : 'NIGHT'
  const phaseSource = themeSource === 'location' ? 'LOCAL SUN' : 'LOCAL TIME'
  const systemLabel = systemMode === 'stopping' ? 'STOPPING' : isLive ? 'RUNNING' : 'READY'

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
        <span className={`hud-dot ${isLive ? 'hud-dot--live' : ''} ${systemMode === 'stopping' ? 'hud-dot--hold' : ''}`} />
        <span className="hud-brand-name">blackLAB</span>
        <span className="hud-brand-sep">·</span>
        <span className="hud-brand-status">{systemLabel}</span>
        <span className="hud-brand-sep">·</span>
        <span className="hud-phase-label">{phaseLabel}</span>
        <span className="hud-brand-sep">·</span>
        <span className="hud-phase-source">{phaseSource}</span>
      </div>

      {/* ── Top-right: iteration counter ── */}
      <div className="hud-iter-block">
        <span className="hud-iter-label">CYCLE</span>
        <span className="hud-iter-num">{iteration ?? iterationsCompleted}</span>
      </div>

      {/* ── Bottom: mission ribbon ── */}
      <div className="hud-ribbon">
        <div className="hud-crew-strip">
          <span className="hud-crew-pill">
            <small>HQ</small>
            <strong>{String(crewCounts.hq).padStart(2, '0')}</strong>
          </span>
          <span className="hud-crew-pill">
            <small>R&amp;D</small>
            <strong>{String(crewCounts.rnd).padStart(2, '0')}</strong>
          </span>
          <span className="hud-crew-pill">
            <small>OPERATIONS</small>
            <strong>{String(crewCounts.operations).padStart(2, '0')}</strong>
          </span>
          {systemMode === 'stopping' && (
            <span className="hud-crew-pill hud-crew-pill--hold">
              <small>SYSTEM</small>
              <strong>STOPPING</strong>
            </span>
          )}
        </div>
        {displayText && (
          <div className="hud-ribbon-mission">
            <span className="hud-small-tag">FOCUS</span>
            <span className="hud-ribbon-text">{displayText}</span>
          </div>
        )}
        <div className="hud-ribbon-meta">
          <span>{activeRunCount} run{activeRunCount !== 1 ? 's' : ''} live</span>
          <span className="hud-sep" />
          <span>{iterationsCompleted} cycles complete</span>
          <span className="hud-sep" />
          <span className="hud-clock">{localClockLabel}</span>
          <span className="hud-sep" />
          <span>{clock.slice(11, 19)} UTC</span>
        </div>
      </div>
    </div>
  )
}
