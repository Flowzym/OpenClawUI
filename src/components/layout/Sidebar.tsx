import { NavLink } from 'react-router-dom';

const links = [
  ['/', 'Home'],
  ['/sessions', 'Sessions'],
  ['/projects', 'Projects'],
  ['/changes', 'Changes'],
  ['/logs', 'Logs'],
  ['/settings', 'Settings'],
] as const;

export function Sidebar() {
  return (
    <aside className="flex w-64 flex-col border-r border-app-border bg-[#0a0f1b] px-3 py-4">
      <div className="mb-6 px-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">OpenClaw</p>
        <h1 className="mt-2 text-lg font-semibold">Operator UI</h1>
        <p className="mt-1 text-xs text-app-muted">Windows-first console for OpenClaw over WSL2.</p>
      </div>
      <nav className="space-y-1">
        {links.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center rounded-md px-3 py-2 text-sm transition ${
                isActive ? 'bg-app-accent/15 text-app-text' : 'text-app-muted hover:bg-app-panelAlt hover:text-app-text'
              }`
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto rounded-lg border border-app-border bg-app-panel p-3 text-xs text-app-muted">
        <p className="font-semibold text-app-text">Workspace posture</p>
        <ul className="mt-2 space-y-1">
          <li>Dense layouts for long operator sessions</li>
          <li>Mock gateway + file services behind abstractions</li>
          <li>Ready to replace default UI incrementally</li>
        </ul>
      </div>
    </aside>
  );
}
