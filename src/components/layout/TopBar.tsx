import { useConnectionStore } from '../../stores/connectionStore';
import { statusBadge } from '../../utils/format';

const surfaceBadge = {
  gateway: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  fallback: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  none: 'border-app-border bg-app-panel text-app-muted',
  verified: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  exploratory: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  idle: 'border-app-border bg-app-panel text-app-muted',
  socket_open: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  handshake_sent: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  ready: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  degraded: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  failed: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
} as const;

export function TopBar() {
  const { gateway, currentRun, activeAgent, activeModel } = useConnectionStore();
  const endpointStatus =
    gateway.state === 'connecting' && gateway.dataSource === 'none'
      ? 'fresh snapshot pending'
      : gateway.usingMockFallback
        ? 'fallback snapshot'
        : gateway.dataSource === 'gateway'
          ? 'live snapshot'
          : 'idle snapshot';

  return (
    <header className="sticky top-0 z-20 border-b border-app-border bg-app-panel/95 backdrop-blur">
      <div className="grid grid-cols-5 gap-3 px-4 py-3">
        <div className="rounded-md border border-app-border bg-app-panelAlt px-3 py-2">
          <p className="section-title">Gateway</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className={`rounded-full border px-2 py-1 text-xs font-medium ${statusBadge(gateway.state)}`}>
              {gateway.state}
            </span>
            <span className="text-xs text-app-muted">{gateway.endpoint}</span>
          </div>
          <p className="mt-2 text-[11px] text-app-muted">{endpointStatus}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${surfaceBadge[gateway.dataSource]}`}>
              source: {gateway.dataSource}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${surfaceBadge[gateway.protocolConfidence]}`}>
              protocol: {gateway.protocolConfidence}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${surfaceBadge[gateway.handshakePhase]}`}>
              handshake: {gateway.handshakePhase}
            </span>
          </div>
        </div>
        <div className="rounded-md border border-app-border bg-app-panelAlt px-3 py-2">
          <p className="section-title">Active agent</p>
          <p className="mt-2 truncate text-sm font-medium">{activeAgent}</p>
        </div>
        <div className="rounded-md border border-app-border bg-app-panelAlt px-3 py-2">
          <p className="section-title">Active model</p>
          <p className="mt-2 truncate text-sm font-medium">{activeModel}</p>
        </div>
        <div className="rounded-md border border-app-border bg-app-panelAlt px-3 py-2">
          <p className="section-title">Run status</p>
          <p className="mt-2 text-sm font-medium capitalize">{currentRun?.status ?? 'idle'}</p>
        </div>
        <div className="rounded-md border border-app-border bg-app-panelAlt px-3 py-2">
          <p className="section-title">Current run</p>
          <p className="mt-2 truncate text-sm font-medium">{currentRun?.label ?? 'No active run'}</p>
        </div>
      </div>
    </header>
  );
}
