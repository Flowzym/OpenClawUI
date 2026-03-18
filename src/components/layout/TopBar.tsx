import { useConnectionStore } from '../../stores/connectionStore';
import { statusBadge } from '../../utils/format';

export function TopBar() {
  const { gateway, currentRun, activeAgent, activeModel } = useConnectionStore();

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
