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
  themeSource: 'location' | 'timezone'
  crewCounts: RoverCrewCounts
  systemMode: 'live' | 'stopping' | 'idle'
  maturityTierLabel: string
  maturityPercent: number
}

export function ConsoleHUD({
  mission,
  iteration,
  iterationsCompleted,
  loopStatus,
  activeRunCount,
  loopNote,
  timeTheme,
  themeSource,
  crewCounts,
  systemMode,
  maturityTierLabel,
  maturityPercent,
}: ConsoleHUDProps) {
  const isLive = systemMode === 'live' || systemMode === 'stopping' || loopStatus === 'running'
  const phaseIcon = timeTheme === 'day' ? '☀' : '☾'
  const phaseLabel = timeTheme === 'day' ? 'DAY' : 'NIGHT'
  const phaseSource = themeSource === 'location' ? 'LOCAL SUN' : 'LOCAL TIME'
  const systemLabel = systemMode === 'stopping' ? 'STOPPING' : isLive ? 'RUNNING' : 'READY'

  // Ticker clock
  const [clock, setClock] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const clockDate = new Date(clock)
  const localClockLabel = clockDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const utcClockLabel = clockDate.toISOString().slice(11, 19)

  const displayText = loopNote ?? mission

  return (
    <div className="console-hud">
      {/* ── Top-left: company identity ── */}
      <div className="hud-brand">
        <span className="hud-phase-icon" aria-hidden="true">{phaseIcon}</span>
        <span className={`hud-dot ${isLive ? 'hud-dot--live' : ''} ${systemMode === 'stopping' ? 'hud-dot--hold' : ''}`} />
        <a className="hud-brand-home" href="/" aria-label="Go to dashboard home">
          <span className="hud-brand-name">blackLAB</span>
        </a>
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
          <span className="hud-project-maturity">{maturityTierLabel} · {maturityPercent}% maturity</span>
          <span className="hud-sep" />
          <span>{activeRunCount} run{activeRunCount !== 1 ? 's' : ''} live</span>
          <span className="hud-sep" />
          <span>{iterationsCompleted} cycles complete</span>
          <span className="hud-sep" />
          <span className="hud-clock">{localClockLabel}</span>
          <span className="hud-sep" />
          <span>{utcClockLabel} UTC</span>
        </div>
      </div>
    </div>
  )
}
