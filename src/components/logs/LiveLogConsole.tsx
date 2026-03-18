import { useEffect } from 'react';
import { useLogsStore } from '../../stores/logsStore';
import { formatDateTime, statusTone } from '../../utils/format';

export function LiveLogConsole() {
  const { logs, filters, diagnostics, startStream, toggleFilter } = useLogsStore();

  useEffect(() => {
    const dispose = startStream();
    return () => dispose();
  }, [startStream]);

  const visibleLogs = logs.filter((entry) => filters[entry.level]);

  return (
    <div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="panel flex min-h-[520px] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Live log console</h2>
            <p className="mt-1 text-xs text-app-muted">Real-time console surface designed for gateway and workspace diagnostics.</p>
          </div>
          <div className="flex items-center gap-2">
            {(['info', 'warn', 'error'] as const).map((level) => (
              <button
                key={level}
                type="button"
                className={`rounded-full border px-3 py-1 text-xs ${filters[level] ? 'border-app-accent text-app-text' : 'border-app-border text-app-muted'}`}
                onClick={() => toggleFilter(level)}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[#09101a] p-4 font-mono text-xs leading-6">
          {visibleLogs.map((entry) => (
            <div key={entry.id} className="grid grid-cols-[110px_70px_90px_minmax(0,1fr)] gap-3 border-b border-app-border/50 py-1 last:border-b-0">
              <span className="text-app-muted">{formatDateTime(entry.timestamp)}</span>
              <span className={statusTone(entry.level)}>{entry.level.toUpperCase()}</span>
              <span className="text-app-muted">{entry.source}</span>
              <span className="text-app-text">{entry.message}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2 className="text-sm font-semibold">Connection diagnostics</h2>
        <p className="mt-1 text-xs text-app-muted">Operator-facing details useful when Windows ↔ WSL2 communication drifts.</p>
        <ul className="mt-4 space-y-2 text-sm text-app-muted">
          {diagnostics.map((item) => (
            <li key={item} className="rounded-md border border-app-border bg-app-panelAlt px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
