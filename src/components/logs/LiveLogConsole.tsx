import { useEffect } from 'react';
import { useLogsStore } from '../../stores/logsStore';
import { formatDateTime, statusTone } from '../../utils/format';

export function LiveLogConsole() {
  const { logs, protocolTrace, filters, diagnostics, startStream, toggleFilter } = useLogsStore();

  useEffect(() => {
    const dispose = startStream();
    return () => dispose();
  }, [startStream]);

  const visibleLogs = logs.filter((entry) => filters[entry.level]);

  return (
    <div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-h-0 gap-4">
        <section className="panel flex min-h-[360px] flex-col overflow-hidden">
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
            ))
            }
          </div>
        </section>
        <section className="panel flex min-h-[220px] flex-col overflow-hidden">
          <div className="border-b border-app-border px-4 py-3">
            <h2 className="text-sm font-semibold">Protocol trace</h2>
            <p className="mt-1 text-xs text-app-muted">Dense operator view of outbound guesses, inbound summaries, parse category, confidence, and handshake phase.</p>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-[#09101a] p-4 font-mono text-[11px] leading-5">
            {protocolTrace.length === 0 ? (
              <p className="text-app-muted">No protocol trace yet. Connect to start recording gateway traffic.</p>
            ) : (
              protocolTrace.map((entry) => (
                <div key={entry.id} className="grid grid-cols-[70px_92px_112px_88px_96px_minmax(0,1fr)] gap-2 border-b border-app-border/50 py-1 last:border-b-0">
                  <span className="text-app-muted">{entry.direction}</span>
                  <span className="text-app-muted">{entry.handshakePhase}</span>
                  <span className={entry.confidence === 'verified' ? 'text-app-success' : 'text-app-warn'}>{entry.confidence}</span>
                  <span className="text-app-muted">{entry.parseCategory ?? 'outbound'}</span>
                  <span className="text-app-muted">{entry.strategy ?? entry.commandKind ?? 'event'}</span>
                  <div className="min-w-0 text-app-text">
                    <p className="truncate">{entry.summary}</p>
                    <p className="truncate text-app-muted">
                      {entry.commandKind ? `${entry.commandKind}${entry.commandGroup ? `/${entry.commandGroup}` : ''} · ` : ''}
                      {entry.variant ? `${entry.variant} · ` : ''}
                      {entry.payloadSummary ?? 'no payload summary'}
                      {entry.strategyReason ? ` · ${entry.strategyReason}` : ''}
                      {entry.linkedAttemptId ? ` · ↪ ${entry.linkedAttemptId}` : ''}
                      {entry.responseTo?.length ? ` · ↩ ${entry.responseTo.join(', ')}` : ''}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
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
