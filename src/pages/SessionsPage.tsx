import { ChatThread } from '../components/sessions/ChatThread';
import { MessageComposer } from '../components/sessions/MessageComposer';
import { SessionList } from '../components/sessions/SessionList';
import { Panel } from '../components/shared/Panel';
import { useSessionStore } from '../stores/sessionStore';
import { formatDateTime, statusBadge } from '../utils/format';

export function SessionsPage() {
  const { sessions, selectedSessionId, stopSessionRun, error, dataSource, isLoading, protocolConfidence } = useSessionStore();
  const session = sessions.find((item) => item.id === selectedSessionId);

  return (
    <div className="grid min-h-[calc(100vh-180px)] gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
      <Panel title="Sessions" subtitle="Searchable session index with virtualization-ready architecture." className="min-h-0">
        {isLoading ? <p className="mb-3 text-xs text-app-muted">Loading sessions from gateway…</p> : null}
        {dataSource === 'none' ? <p className="mb-3 text-xs text-app-muted">No gateway session data yet.</p> : null}
        {dataSource === 'fallback' ? <p className="mb-3 text-xs text-app-warn">Explicit fallback mode is active for session data.</p> : null}
        {dataSource === 'gateway' ? <p className="mb-3 text-xs text-app-muted">Gateway session feed active ({protocolConfidence} protocol path).</p> : null}
        {error ? <p className="mb-3 text-xs text-app-danger">{error}</p> : null}
        <div className="h-[calc(100vh-260px)]">
          <SessionList />
        </div>
      </Panel>
      <div className="flex min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <ChatThread />
        </div>
        <MessageComposer />
      </div>
      <Panel
        title="Session inspector"
        subtitle="Agent, model, mode, and execution metadata."
        actions={
          <button type="button" className="button-danger" onClick={() => session && void stopSessionRun(session.id)} disabled={!session}>
            Stop session
          </button>
        }
      >
        {session ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-md border border-app-border bg-app-panelAlt p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{session.title}</p>
                <span className={`rounded-full border px-2 py-1 text-[11px] ${statusBadge(session.status)}`}>{session.status}</span>
              </div>
              <p className="mt-2 text-xs text-app-muted">Updated {formatDateTime(session.updatedAt)}</p>
            </div>
            <dl className="space-y-3">
              <div className="rounded-md border border-app-border bg-app-panelAlt p-3">
                <dt className="section-title">Agent</dt>
                <dd className="mt-2">{session.metadata.agent}</dd>
              </div>
              <div className="rounded-md border border-app-border bg-app-panelAlt p-3">
                <dt className="section-title">Model</dt>
                <dd className="mt-2">{session.metadata.model}</dd>
              </div>
              <div className="rounded-md border border-app-border bg-app-panelAlt p-3">
                <dt className="section-title">Mode</dt>
                <dd className="mt-2">{session.metadata.mode}</dd>
              </div>
              <div className="rounded-md border border-app-border bg-app-panelAlt p-3">
                <dt className="section-title">Working directory</dt>
                <dd className="mt-2 break-all font-mono text-xs">{session.metadata.cwd}</dd>
              </div>
              <div className="rounded-md border border-app-border bg-app-panelAlt p-3">
                <dt className="section-title">Branch</dt>
                <dd className="mt-2">{session.metadata.branch}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="text-app-muted">No session selected.</p>
        )}
      </Panel>
    </div>
  );
}
