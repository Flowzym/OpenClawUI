import { mockChanges } from '../data/mockData';
import { GatewayStatusCard } from '../components/home/GatewayStatusCard';
import { Panel } from '../components/shared/Panel';
import { useConnectionStore } from '../stores/connectionStore';
import { useSessionStore } from '../stores/sessionStore';
import { formatDateTime, statusBadge } from '../utils/format';

export function HomePage() {
  const { currentRun } = useConnectionStore();
  const { sessions } = useSessionStore();

  return (
    <div className="space-y-4">
      <GatewayStatusCard />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr_1fr]">
        <Panel title="Current run" subtitle="Sticky operator context for active work.">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold">{currentRun?.label}</p>
                <p className="mt-1 text-sm text-app-muted">{currentRun?.agent} • {currentRun?.model}</p>
              </div>
              <span className={`rounded-full border px-2 py-1 text-xs ${statusBadge(currentRun?.status ?? 'idle')}`}>
                {currentRun?.status ?? 'idle'}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="panel-muted p-3">
                <p className="section-title">Started</p>
                <p className="mt-2 text-sm">{currentRun ? formatDateTime(currentRun.startedAt) : '—'}</p>
              </div>
              <div className="panel-muted p-3">
                <p className="section-title">Attached session</p>
                <p className="mt-2 text-sm">{currentRun?.sessionId ?? 'none'}</p>
              </div>
            </div>
          </div>
        </Panel>
        <Panel title="Recent sessions" subtitle="Quick access to active operator threads.">
          <div className="space-y-3">
            {sessions.slice(0, 4).map((session) => (
              <div key={session.id} className="rounded-md border border-app-border bg-app-panelAlt px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{session.title}</p>
                  <span className={`rounded-full border px-2 py-1 text-[11px] ${statusBadge(session.status)}`}>{session.status}</span>
                </div>
                <p className="mt-1 text-xs text-app-muted">{session.preview}</p>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Recent files" subtitle="Recently touched files and errors for triage.">
          <div className="space-y-3">
            <div className="rounded-md border border-app-border bg-app-panelAlt px-3 py-2 text-sm">src/pages/SessionsPage.tsx</div>
            <div className="rounded-md border border-app-border bg-app-panelAlt px-3 py-2 text-sm">src/stores/sessionStore.ts</div>
            <div className="rounded-md border border-app-border bg-app-panelAlt px-3 py-2 text-sm">README.md</div>
          </div>
          <div className="mt-4 space-y-2">
            <p className="section-title">Recent errors</p>
            {mockChanges.slice(0, 2).map((change) => (
              <div key={change.id} className="rounded-md border border-app-danger/40 bg-app-danger/10 px-3 py-2 text-xs text-app-danger">
                {change.filePath}: {change.summary}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
