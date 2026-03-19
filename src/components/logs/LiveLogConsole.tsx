import { useEffect, useMemo } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useLogsStore } from '../../stores/logsStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { deriveVerificationSummary, verificationScenarioLabels } from '../../utils/protocolVerification';
import { formatDateTime, statusTone } from '../../utils/format';
import type { VerificationScenarioId, VerificationStatus } from '../../services/gateway/types';

const verificationActionOrder: VerificationScenarioId[] = [
  'handshake_probe',
  'session_snapshot',
  'send_test_message',
  'run_current',
  'run_stop',
  'subscribe_bootstrap',
];

const verificationStatusTone: Record<VerificationStatus, string> = {
  'not tested': 'border-app-border bg-app-panelAlt text-app-muted',
  observed: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  'likely working': 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  'still exploratory': 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  'no evidence': 'border-app-danger/40 bg-app-danger/10 text-app-danger',
};

export function LiveLogConsole() {
  const { logs, protocolTrace, filters, diagnostics, startStream, toggleFilter, verificationMessage, setVerificationMessage, runVerificationScenario, verificationPendingScenario } = useLogsStore();
  const protocolVerification = useSettingsStore((state) => state.settings.advanced.protocolVerification);
  const toggleAdvanced = useSettingsStore((state) => state.toggleAdvanced);
  const gateway = useConnectionStore((state) => state.gateway);
  const currentRun = useConnectionStore((state) => state.currentRun);

  useEffect(() => {
    const dispose = startStream();
    return () => dispose();
  }, [startStream]);

  const visibleLogs = logs.filter((entry) => filters[entry.level]);
  const verificationSummary = useMemo(() => deriveVerificationSummary(protocolTrace), [protocolTrace]);
  const verificationActions = useMemo(
    () => verificationActionOrder.map((scenarioId) => ({ scenarioId, label: verificationScenarioLabels[scenarioId] })),
    [],
  );

  return (
    <div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
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
            ))}
          </div>
        </section>
        <section className="panel flex min-h-[260px] flex-col overflow-hidden">
          <div className="border-b border-app-border px-4 py-3">
            <h2 className="text-sm font-semibold">Protocol trace</h2>
            <p className="mt-1 text-xs text-app-muted">Dense operator view of outbound guesses, inbound summaries, parse category, confidence, handshake phase, and manual verification evidence.</p>
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
                  <span className="text-app-muted">{entry.strategy ?? entry.commandKind ?? entry.eventType ?? 'event'}</span>
                  <div className="min-w-0 text-app-text">
                    <p className="truncate">{entry.summary}</p>
                    <p className="truncate text-app-muted">
                      {entry.manualVerification && entry.verificationScenarioLabel ? `manual verification · ${entry.verificationScenarioLabel} · ` : ''}
                      {entry.commandKind ? `${entry.commandKind}${entry.commandGroup ? `/${entry.commandGroup}` : ''} · ` : entry.eventType ? `${entry.eventType} · ` : ''}
                      {entry.variant ? `${entry.variant} · ` : ''}
                      {entry.verificationStage ? `${entry.verificationStage} · ` : ''}
                      {entry.payloadSummary ?? 'no payload summary'}
                      {entry.strategyReason ? ` · ${entry.strategyReason}` : ''}
                      {entry.linkedAttemptId ? ` · ↪ ${entry.linkedAttemptId}` : ''}
                      {entry.responseTo?.length ? ` · ↩ ${entry.responseTo.join(', ')}` : ''}
                      {entry.explicitVerifiedSignal ? ' · explicit verified signal' : ''}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
      <div className="space-y-4">
        <section className="panel">
          <div className="border-b border-app-border px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Protocol verification</h2>
                <p className="mt-1 text-xs text-app-muted">Dense manual workflow for testing a real local OpenClaw gateway without changing the normal app path.</p>
              </div>
              <button type="button" className="button-secondary" onClick={() => toggleAdvanced('protocolVerification')}>
                {protocolVerification ? 'Mode on' : 'Mode off'}
              </button>
            </div>
          </div>
          <div className="space-y-4 p-4">
            <div className={`rounded-md border px-3 py-3 text-xs ${protocolVerification ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
              <p className="section-title text-current">Verification mode</p>
              <p className="mt-2 leading-5 text-current/90">
                {protocolVerification
                  ? 'Manual protocol probes are enabled. Each action creates explicit trace annotations so operator testing remains separate from normal gateway traffic.'
                  : 'Manual protocol probes are disabled. Turn this on before using the one-click verification actions.'}
              </p>
              <p className="mt-2 leading-5 text-current/80">Gateway state: <span className="font-mono">{gateway.state}</span> · handshake <span className="font-mono">{gateway.handshakePhase}</span> · confidence <span className="font-mono">{gateway.protocolConfidence}</span></p>
              <p className="mt-2 leading-5 text-current/80">Target: <span className="font-mono break-all">{gateway.endpoint}</span></p>
              {currentRun ? <p className="mt-2 leading-5 text-current/80">Current run hint: <span className="font-mono">{currentRun.id}</span> ({currentRun.status})</p> : null}
            </div>

            <div className="space-y-3">
              <div>
                <p className="section-title">Manual actions</p>
                <p className="mt-2 text-xs text-app-muted">Trace remains the source of truth. These buttons only trigger small verification probes against the current gateway client.</p>
              </div>
              <label className="grid gap-2">
                <span className="text-xs text-app-muted">Test message content</span>
                <textarea
                  className="input min-h-24 resize-none text-xs"
                  value={verificationMessage}
                  onChange={(event) => setVerificationMessage(event.target.value)}
                  disabled={!protocolVerification}
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {verificationActions.map((action) => (
                  <button
                    key={action.scenarioId}
                    type="button"
                    className="button-secondary justify-start text-left"
                    disabled={!protocolVerification || verificationPendingScenario === action.scenarioId}
                    onClick={() => void runVerificationScenario(action.scenarioId)}
                  >
                    {verificationPendingScenario === action.scenarioId ? 'Running…' : action.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <p className="section-title">Evidence summary</p>
                <p className="mt-2 text-xs text-app-muted">Careful heuristic rollup from trace evidence. It does not claim certainty without explicit protocol signals.</p>
              </div>
              <div className="space-y-2">
                {verificationSummary.map((item) => (
                  <div key={item.scenarioId} className={`rounded-md border px-3 py-3 text-xs ${verificationStatusTone[item.status]}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-current">{item.commandGroup}</p>
                        <p className="mt-1 text-current/80">{item.label}</p>
                      </div>
                      <span className="rounded-full border border-current/30 px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-current">{item.status}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-current/80">
                      <span className="rounded-full border border-current/20 px-2 py-1">primary: {item.attemptedPrimary ? 'yes' : 'no'}</span>
                      <span className="rounded-full border border-current/20 px-2 py-1">fallback: {item.attemptedFallback ? 'yes' : 'no'}</span>
                      <span className="rounded-full border border-current/20 px-2 py-1">inbound after: {item.observedInbound}</span>
                      <span className="rounded-full border border-current/20 px-2 py-1">explicit verified signal: {item.explicitVerifiedSignal ? 'yes' : 'no'}</span>
                    </div>
                    <ul className="mt-3 space-y-1 text-current/90">
                      {item.details.length > 0 ? item.details.map((detail) => <li key={detail}>• {detail}</li>) : <li>• No manual evidence yet.</li>}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="border-b border-app-border px-4 py-3">
            <h2 className="text-sm font-semibold">Connection diagnostics</h2>
            <p className="mt-1 text-xs text-app-muted">Operator-facing details useful when Windows ↔ WSL2 communication drifts.</p>
          </div>
          <div className="p-4">
            <ul className="space-y-2 text-sm text-app-muted">
              {diagnostics.map((item) => (
                <li key={item} className="rounded-md border border-app-border bg-app-panelAlt px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
