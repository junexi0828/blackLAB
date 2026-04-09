import { NavLink, Outlet } from 'react-router-dom'

const links = [
  { to: '/', label: 'HQ Floor', end: true },
  { to: '/launch', label: 'Launch Bay' },
  { to: '/autopilot', label: 'Loop Reactor' },
  { to: '/runs', label: 'Run Vault' },
  { to: '/loops', label: 'Loop Vault' },
  { to: '/settings', label: 'Controls' },
]

export function Shell() {
  return (
    <div className="console-shell">
      <aside className="console-sidebar">
        <div>
          <p className="eyebrow">Autonomous Venture Studio</p>
          <h2>blackLAB Night Console</h2>
          <p className="sidebar-copy">
            A theatrical operating layer over the same Codex orchestration engine. Use it when you want to feel the company working.
          </p>
        </div>

        <div className="sidebar-signal">
          <span className="signal-dot" />
          <div>
            <strong>Live pulse</strong>
            <p>Agent floor, loop radar, and mission flow update from the backend runtime.</p>
          </div>
        </div>

        <nav className="console-nav">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => `console-nav-link${isActive ? ' is-active' : ''}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-note">
          <strong>Split of responsibilities</strong>
          <p>`/` stays the practical operator room. `/console` is the visual command center.</p>
        </div>
      </aside>

      <main className="console-main">
        <Outlet />
      </main>
    </div>
  )
}
