import { useConnectionStore } from '../../stores/connectionStore';
import { formatDateTime, statusBadge } from '../../utils/format';
import { Panel } from '../shared/Panel';

export function GatewayStatusCard() {
  const { gateway, connect, disconnect } = useConnectionStore();

  return (
    <Panel
      title="Gateway status"
      subtitle="OpenClaw local gateway for Windows UI ↔ WSL2 agent traffic"
      actions={
        gateway.state === 'connected' ? (
          <button type="button" className="button-secondary" onClick={() => void disconnect()}>
            Disconnect
          </button>
        ) : (
          <button type="button" className="button-primary" onClick={() => void connect()}>
            Connect
          </button>
        )
      }
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="panel-muted p-3">
          <p className="section-title">State</p>
          <span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusBadge(gateway.state)}`}>
            {gateway.state}
          </span>
          {gateway.usingMockFallback ? <p className="mt-2 text-xs text-app-muted">Mock fallback active</p> : null}
        </div>
        <div className="panel-muted p-3">
          <p className="section-title">Endpoint</p>
          <p className="mt-2 font-mono text-xs">{gateway.endpoint}</p>
        </div>
        <div className="panel-muted p-3">
          <p className="section-title">Latency</p>
          <p className="mt-2 text-lg font-semibold">{gateway.latencyMs} ms</p>
        </div>
        <div className="panel-muted p-3">
          <p className="section-title">Last heartbeat</p>
          <p className="mt-2 text-sm">{formatDateTime(gateway.lastHeartbeat)}</p>
        </div>
      </div>
      {gateway.lastError ? (
        <div className="mt-4 rounded-md border border-app-danger/40 bg-app-danger/10 px-3 py-3 text-sm text-app-danger">
          {gateway.lastError}
        </div>
      ) : null}
      <div className="mt-4 space-y-2">
        <p className="section-title">Diagnostics</p>
        <ul className="space-y-2 text-sm text-app-muted">
          {gateway.diagnostics.map((item) => (
            <li key={item} className="rounded-md border border-app-border bg-app-panelAlt px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}
