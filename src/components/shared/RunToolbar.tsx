import { useConnectionStore } from '../../stores/connectionStore';
import { formatDateTime, statusBadge } from '../../utils/format';

export function RunToolbar() {
  const { currentRun, stopRun } = useConnectionStore();

  return (
    <div className="sticky top-[89px] z-10 border-b border-app-border bg-[#101829]/95 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`rounded-full border px-2 py-1 text-xs font-medium ${statusBadge(currentRun?.status ?? 'idle')}`}>
            {currentRun?.status ?? 'idle'}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{currentRun?.label ?? 'No run in progress'}</p>
            <p className="text-xs text-app-muted">
              {currentRun ? `Started ${formatDateTime(currentRun.startedAt)} • ${currentRun.agent} • ${currentRun.model}` : 'Ready for operator tasks'}
            </p>
          </div>
        </div>
        <button type="button" className="button-danger shrink-0 disabled:cursor-not-allowed disabled:opacity-60" disabled={!currentRun} onClick={() => void stopRun()}>
          Abort / Stop
        </button>
      </div>
    </div>
  );
}
