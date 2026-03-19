import type { ProtocolTraceEntry, VerificationScenarioId, VerificationStatus } from '../services/gateway/types';

export interface VerificationSummaryItem {
  scenarioId: VerificationScenarioId;
  label: string;
  commandGroup: string;
  status: VerificationStatus;
  attemptedPrimary: boolean;
  attemptedFallback: boolean;
  observedInbound: number;
  explicitVerifiedSignal: boolean;
  details: string[];
}

export const verificationScenarioLabels: Record<VerificationScenarioId, string> = {
  handshake_probe: 'Handshake probe',
  session_snapshot: 'Session snapshot request',
  send_test_message: 'Send test message',
  run_current: 'Current run request',
  run_stop: 'Stop current run',
  subscribe_bootstrap: 'Subscribe/bootstrap trigger',
};

const parseSessionCount = (summary: string) => {
  const match = summary.match(/sessions snapshot \((\d+)\)/i);
  return match ? Number(match[1]) : undefined;
};

const outboundForScenario = (trace: ProtocolTraceEntry[], scenarioId: VerificationScenarioId) =>
  trace.filter((entry) => entry.manualVerification && entry.verificationScenarioId === scenarioId && entry.direction === 'outbound');

const inboundForScenario = (trace: ProtocolTraceEntry[], scenarioId: VerificationScenarioId) =>
  trace.filter((entry) => entry.manualVerification && entry.verificationScenarioId === scenarioId && entry.direction === 'inbound');

const buildBase = (trace: ProtocolTraceEntry[], scenarioId: VerificationScenarioId, commandGroup: string): VerificationSummaryItem => {
  const outbound = outboundForScenario(trace, scenarioId);
  const inbound = inboundForScenario(trace, scenarioId);

  return {
    scenarioId,
    label: verificationScenarioLabels[scenarioId],
    commandGroup,
    status: outbound.length === 0 ? 'not tested' : 'no evidence',
    attemptedPrimary: outbound.some((entry) => entry.strategy === 'primary'),
    attemptedFallback: outbound.some((entry) => entry.strategy === 'fallback'),
    observedInbound: inbound.length,
    explicitVerifiedSignal: inbound.some((entry) => entry.explicitVerifiedSignal),
    details: [],
  };
};

export const deriveVerificationSummary = (trace: ProtocolTraceEntry[]): VerificationSummaryItem[] => {
  const handshake = buildBase(trace, 'handshake_probe', 'handshake/connect');
  const handshakeInbound = inboundForScenario(trace, 'handshake_probe');
  if (handshake.status !== 'not tested') {
    if (handshake.explicitVerifiedSignal) {
      handshake.status = 'likely working';
      handshake.details.push('Explicit verified handshake signal appeared after the manual probe.');
    } else if (handshakeInbound.length > 0) {
      handshake.status = 'observed';
      handshake.details.push('Inbound traffic followed the manual handshake probe, but no explicit verified acknowledgement was observed.');
    } else {
      handshake.details.push('Manual handshake probe was attempted without correlated inbound evidence yet.');
    }
    if (handshake.attemptedFallback) {
      handshake.details.push('A fallback handshake command was also attempted and remains exploratory.');
    }
  }

  const sessions = buildBase(trace, 'session_snapshot', 'sessions.list');
  const sessionInbound = inboundForScenario(trace, 'session_snapshot');
  const sessionSnapshots = sessionInbound.filter((entry) => entry.eventType === 'sessions_snapshot');
  if (sessions.status !== 'not tested') {
    if (sessionSnapshots.length > 0) {
      sessions.status = 'likely working';
      const count = parseSessionCount(sessionSnapshots[0].summary);
      sessions.details.push(
        typeof count === 'number'
          ? `A sessions snapshot response was observed (${count} session${count === 1 ? '' : 's'}).`
          : 'A sessions snapshot response was observed after the manual request.',
      );
    } else if (sessionInbound.length > 0) {
      sessions.status = 'observed';
      sessions.details.push('Related inbound traffic followed sessions.list, but no normalized session snapshot was confirmed.');
    } else {
      sessions.details.push('The manual sessions.list request produced no correlated session evidence yet.');
    }
  }

  const sendMessage = buildBase(trace, 'send_test_message', 'sendMessage');
  const sendInbound = inboundForScenario(trace, 'send_test_message');
  const sendCorrelated = sendInbound.filter((entry) => entry.eventType === 'message' || entry.eventType === 'message_delta');
  if (sendMessage.status !== 'not tested') {
    if (sendCorrelated.length > 0) {
      sendMessage.status = 'likely working';
      sendMessage.details.push('A correlated inbound message or delta followed the manual send test.');
    } else if (sendInbound.length > 0) {
      sendMessage.status = 'observed';
      sendMessage.details.push('Inbound traffic followed the manual send, but no correlated message/delta was confirmed.');
    } else {
      sendMessage.details.push('The manual send test produced no correlated inbound message evidence yet.');
    }
    if (sendMessage.attemptedFallback) {
      sendMessage.details.push('A send fallback command was attempted because the protocol path is still exploratory.');
    }
  }

  const runCurrent = buildBase(trace, 'run_current', 'run.current');
  const runCurrentInbound = inboundForScenario(trace, 'run_current');
  const runSnapshots = runCurrentInbound.filter((entry) => entry.eventType === 'run');
  if (runCurrent.status !== 'not tested') {
    if (runSnapshots.length > 0) {
      runCurrent.status = 'likely working';
      runCurrent.details.push('A run snapshot/update followed the manual run.current request.');
    } else if (runCurrentInbound.length > 0) {
      runCurrent.status = 'observed';
      runCurrent.details.push('Inbound traffic followed run.current, but a normalized run snapshot was not clearly confirmed.');
    } else {
      runCurrent.details.push('The manual run.current request produced no correlated run evidence yet.');
    }
  }

  const runStop = buildBase(trace, 'run_stop', 'run.stop');
  const runStopInbound = inboundForScenario(trace, 'run_stop');
  const runStopChanges = runStopInbound.filter(
    (entry) => entry.eventType === 'run' && /(stopping|idle|run cleared|error)/i.test(entry.summary),
  );
  if (runStop.status !== 'not tested') {
    if (runStopChanges.length > 0) {
      runStop.status = 'likely working';
      runStop.details.push('A run-state change followed the manual run.stop request.');
    } else if (runStopInbound.some((entry) => entry.eventType === 'run')) {
      runStop.status = 'observed';
      runStop.details.push('A run event followed run.stop, but the impact on run state remains ambiguous.');
    } else if (runStopInbound.length > 0) {
      runStop.status = 'still exploratory';
      runStop.details.push('Inbound traffic followed run.stop, but no run-state effect was evident.');
    } else {
      runStop.details.push('The manual run.stop request produced no correlated run-state evidence yet.');
    }
  }

  const subscribe = buildBase(trace, 'subscribe_bootstrap', 'subscribe');
  const subscribeInbound = inboundForScenario(trace, 'subscribe_bootstrap');
  const usefulSubscribeEvents = subscribeInbound.filter((entry) => ['session', 'sessions_snapshot', 'message', 'message_delta', 'run', 'tool_event', 'log'].includes(entry.eventType ?? ''));
  if (subscribe.status !== 'not tested') {
    if (usefulSubscribeEvents.length > 0) {
      subscribe.status = 'likely working';
      subscribe.details.push('Useful inbound stream events followed the manual subscribe/bootstrap trigger.');
    } else if (subscribeInbound.length > 0) {
      subscribe.status = 'observed';
      subscribe.details.push('Inbound traffic followed subscribe, but it is still unclear whether the subscription enabled a useful stream.');
    } else {
      subscribe.details.push('The manual subscribe/bootstrap trigger produced no correlated stream evidence yet.');
    }
  }

  return [handshake, sessions, sendMessage, runCurrent, runStop, subscribe];
};
