import { useMemo } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { formatDateTime, statusBadge } from '../../utils/format';

export function SessionList() {
  const { sessions, selectedSessionId, selectSession, searchTerm, setSearchTerm, virtualWindow } = useSessionStore();

  const filtered = useMemo(
    () =>
      sessions.filter((session) =>
        [session.title, session.preview, session.metadata.agent].join(' ').toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [searchTerm, sessions],
  );

  const visible = filtered.slice(virtualWindow.start, virtualWindow.end);

  return (
    <div className="flex h-full flex-col gap-3">
      <input
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder="Search sessions, agents, or summaries"
        className="input"
      />
      <div className="rounded-lg border border-app-border bg-app-panelAlt px-3 py-2 text-xs text-app-muted">
        Virtualized list placeholder window: {virtualWindow.start}–{Math.min(virtualWindow.end, filtered.length)} of {filtered.length}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="space-y-2">
          {visible.map((session) => (
            <button
              key={session.id}
              type="button"
              onClick={() => selectSession(session.id)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                selectedSessionId === session.id
                  ? 'border-app-accent bg-app-accent/10'
                  : 'border-app-border bg-app-panel hover:border-app-accent/60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-app-text">{session.title}</p>
                  <p className="mt-1 text-xs text-app-muted">{session.metadata.agent}</p>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[11px] ${statusBadge(session.status)}`}>{session.status}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-app-muted">{session.preview}</p>
              <div className="mt-3 flex items-center justify-between text-[11px] text-app-muted">
                <span>{formatDateTime(session.updatedAt)}</span>
                <span>{session.unreadCount} unread</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
