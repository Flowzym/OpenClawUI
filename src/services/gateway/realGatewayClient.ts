import type { ConnectionState, RunInfo, Session } from '../../types';
import { createLogEntry, parseGatewayMessage, summarizeRawPayload } from './adapters';
import type {
  GatewayClient,
  DiagnosticEventKind,
  GatewayDataSource,
  GatewayEvent,
  GatewaySnapshot,
  HandshakePhase,
  OutboundCommandStrategy,
  ProtocolTraceEntry,
  SendMessageInput,
  StopRunInput,
} from './types';

const DEFAULT_ENDPOINT = 'ws://127.0.0.1:18789';
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000];
const SESSION_REQUEST_TIMEOUT_MS = 4000;
const HEARTBEAT_INTERVAL_MS = 15000;
const HANDSHAKE_NOTICE_TIMEOUT_MS = 4000;
const HANDSHAKE_BOOTSTRAP_DELAY_MS = 350;
const SEND_MESSAGE_FALLBACK_DELAY_MS = 650;
const TRACE_LIMIT = 80;
const RESPONSE_CORRELATION_WINDOW_MS = 5000;

const isBrowser = typeof window !== 'undefined' && typeof window.WebSocket !== 'undefined';

interface SendOptions {
  note: string;
  commandKind: string;
  purpose: string;
  variant?: string;
  strategy: OutboundCommandStrategy;
  strategyReason?: string;
  commandGroup?: string;
  linkedAttemptId?: string;
  correlationId?: string;
}

class RealGatewayClient implements GatewayClient {
  private socket: WebSocket | null = null;
  private socketEndpoint: string | null = null;
  private endpoint = DEFAULT_ENDPOINT;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private handshakeTimer: number | null = null;
  private reconnectAttempt = 0;
  private manuallyDisconnected = false;
  private logSubscribers = new Set<(entry: ReturnType<typeof createLogEntry>) => void>();
  private eventSubscribers = new Set<(event: GatewayEvent) => void>();
  private traceSubscribers = new Set<(entry: ProtocolTraceEntry) => void>();
  private requestResolvers = new Set<(sessions: Session[]) => void>();
  private protocolTrace: ProtocolTraceEntry[] = [];
  private recentOutboundTrace: ProtocolTraceEntry[] = [];
  private recentInboundSignals: Array<{ at: number; correlationId?: string; responseTo?: string[] }> = [];
  private snapshot: GatewaySnapshot = {
    connectionState: 'disconnected',
    handshakePhase: 'idle',
    currentRun: null,
    sessions: [],
    dataSource: 'none',
    usingMockFallback: false,
    lastHeartbeat: null,
    latencyMs: null,
    endpoint: DEFAULT_ENDPOINT,
    diagnostics: ['Waiting for a verified OpenClaw gateway handshake.'],
    lastError: undefined,
    protocolConfidence: 'exploratory',
    protocolTrace: [],
  };

  async connect(url: string) {
    const nextEndpoint = url || DEFAULT_ENDPOINT;
    const previousEndpoint = this.endpoint;
    const endpointChanged = nextEndpoint !== this.endpoint;
    this.endpoint = nextEndpoint;
    this.snapshot.endpoint = this.endpoint;
    this.manuallyDisconnected = false;

    if (!isBrowser) {
      this.transitionConnection('error', {
        lastError: 'Browser WebSocket API is unavailable in the current environment.',
        handshakePhase: 'failed',
      });
      this.activateFallback('Browser WebSocket API unavailable; explicit fallback activated.');
      return this.snapshot.connectionState;
    }

    if (endpointChanged) {
      this.clearReconnectTimer();
      await this.resetActiveSocket(`gateway endpoint changed to ${this.endpoint}`);
      this.resetSnapshotForEndpointChange(previousEndpoint, this.endpoint);
    }

    if (
      this.socket &&
      this.socketEndpoint === this.endpoint &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return this.snapshot.connectionState;
    }

    this.clearReconnectTimer();
    this.transitionConnection('connecting', {
      handshakePhase: 'idle',
      diagnostics: ['Opening gateway socket.', 'Protocol verification still pending.'],
      dataSource: this.snapshot.dataSource,
      protocolConfidence: this.snapshot.protocolConfidence,
      lastError: undefined,
      replaceDiagnostics: !endpointChanged,
    });

    try {
      await this.openSocket(this.endpoint);
      this.beginHandshake();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to connect to the OpenClaw gateway.';
      this.transitionConnection('error', {
        lastError: message,
        handshakePhase: 'failed',
      });
      this.logDiagnostic('handshake_failure', 'error', `Connection handshake failed before socket readiness: ${message}`);
      this.activateFallback(`Socket open failed: ${message}`);
      this.scheduleReconnect();
    }

    return this.snapshot.connectionState;
  }

  async disconnect() {
    this.manuallyDisconnected = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();
    this.clearHandshakeTimer();

    if (this.socket) {
      this.socket.close(1000, 'operator disconnect');
      this.socket = null;
      this.socketEndpoint = null;
    }

    this.transitionConnection('disconnected', {
      handshakePhase: 'idle',
      lastError: undefined,
      diagnostics: ['Gateway disconnected by operator.'],
    });
  }

  async stopRun(target?: string | StopRunInput) {
    const payload = typeof target === 'string' ? { runId: target } : target ?? {};

    // TODO(openclaw-protocol): Verify the stop/abort command schema accepted by the real gateway.
    this.safeSend(
      { type: 'run.stop', payload },
      {
        note: 'exploratory stop run command',
        commandKind: 'run.stop',
        purpose: 'request run cancellation',
        strategy: 'primary',
        strategyReason: 'Only the dotted run.stop command is retained until the gateway confirms a competing stop schema.',
        commandGroup: 'run.stop',
      },
    );

    const runId = payload.runId ?? this.snapshot.currentRun?.id;
    if (runId && this.snapshot.currentRun?.id === runId) {
      this.snapshot.currentRun = { ...this.snapshot.currentRun, status: 'stopping' };
      this.emit({ type: 'run', run: this.snapshot.currentRun, confidence: 'exploratory' });
    }
  }

  async listSessions() {
    if (this.snapshot.connectionState === 'connecting' && this.snapshot.sessions.length === 0) {
      return [];
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      const gatewaySessions = await this.requestSessionsSnapshot();
      if (gatewaySessions.length > 0) {
        return gatewaySessions;
      }
    }

    return this.snapshot.sessions;
  }

  subscribeLogs(callback: (entry: ReturnType<typeof createLogEntry>) => void) {
    this.logSubscribers.add(callback);
    return () => this.logSubscribers.delete(callback);
  }

  subscribeTrace(callback: (entry: ProtocolTraceEntry) => void) {
    this.traceSubscribers.add(callback);
    this.protocolTrace.slice().reverse().forEach((entry) => callback(entry));
    return () => this.traceSubscribers.delete(callback);
  }

  async getCurrentRun(): Promise<RunInfo | null> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      // TODO(openclaw-protocol): Verify the current-run request schema accepted by the real gateway.
      this.safeSend(
        { type: 'run.current' },
        {
          note: 'exploratory current run command',
          commandKind: 'run.current',
          purpose: 'request current run snapshot',
          strategy: 'primary',
          strategyReason: 'Single exploratory current-run request retained until the gateway exposes a confirmed alternate schema.',
          commandGroup: 'run.current',
        },
      );
    }

    return this.snapshot.currentRun;
  }

  subscribeEvents(callback: (event: GatewayEvent) => void) {
    this.eventSubscribers.add(callback);
    callback({
      type: 'connection',
      state: this.snapshot.connectionState,
      handshakePhase: this.snapshot.handshakePhase,
      diagnostics: this.snapshot.diagnostics,
      latencyMs: this.snapshot.latencyMs,
      lastHeartbeat: this.snapshot.lastHeartbeat,
      usingMockFallback: this.snapshot.usingMockFallback,
      dataSource: this.snapshot.dataSource,
      lastError: this.snapshot.lastError,
      confidence: this.snapshot.protocolConfidence,
      protocolConfidence: this.snapshot.protocolConfidence,
    });
    callback({ type: 'run', run: this.snapshot.currentRun, confidence: this.snapshot.protocolConfidence });
    callback({
      type: 'sessions_snapshot',
      sessions: this.snapshot.sessions,
      source: this.snapshot.dataSource,
      confidence: this.snapshot.protocolConfidence,
    });
    return () => this.eventSubscribers.delete(callback);
  }

  async sendMessage(input: SendMessageInput) {
    const sessionId = input.sessionId ?? this.snapshot.currentRun?.sessionId ?? this.snapshot.sessions[0]?.id ?? `session-${Date.now()}`;
    const clientRequestId = input.clientRequestId ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const clientMessageId = input.clientMessageId ?? `user-${Date.now()}`;
    const assistantPlaceholderId = input.assistantPlaceholderId ?? `assistant-pending-${Date.now()}`;

    // TODO(openclaw-protocol): Verify the send-message command schema and whether client correlation IDs are echoed back.
    const primaryTraceId = this.safeSend(
      {
        type: 'session.message',
        payload: {
          session_id: sessionId,
          content: input.content,
          client_request_id: clientRequestId,
          client_message_id: clientMessageId,
        },
      },
      {
        note: 'exploratory session.message payload',
        commandKind: 'session.message',
        purpose: 'send operator message to a session',
        variant: 'primary',
        strategy: 'primary',
        strategyReason: 'Preferred exploratory send path because the current gateway traffic leans toward dotted command types with nested payload envelopes.',
        commandGroup: 'sendMessage',
        correlationId: clientRequestId,
      },
    );

    if (primaryTraceId && this.shouldStageSendMessageFallback()) {
      window.setTimeout(() => {
        if (!this.shouldSendMessageFallback(primaryTraceId, clientRequestId)) {
          return;
        }

        // TODO(openclaw-protocol): Verify whether the gateway expects snake_case action names instead of dotted types.
        this.safeSend(
          {
            action: 'send_message',
            session_id: sessionId,
            content: input.content,
            client_request_id: clientRequestId,
            client_message_id: clientMessageId,
          },
          {
            note: 'exploratory send_message fallback action',
            commandKind: 'send_message',
            purpose: 'send operator message to a session',
            variant: 'fallback',
            strategy: 'fallback',
            strategyReason:
              'Fallback retained only while handshake/message correlation remain exploratory and no matching inbound response was observed after the primary send.',
            commandGroup: 'sendMessage',
            linkedAttemptId: primaryTraceId,
            correlationId: clientRequestId,
          },
        );
      }, SEND_MESSAGE_FALLBACK_DELAY_MS);
    }

    return { sessionId, messageId: clientMessageId, clientRequestId, clientMessageId, assistantPlaceholderId };
  }

  getSnapshot() {
    return {
      ...this.snapshot,
      diagnostics: [...this.snapshot.diagnostics],
      protocolTrace: this.snapshot.protocolTrace.map((entry) => ({
        ...entry,
        responseTo: entry.responseTo ? [...entry.responseTo] : undefined,
      })),
      sessions: this.snapshot.sessions.map((session) => ({ ...session, metadata: { ...session.metadata }, messages: [...session.messages] })),
      currentRun: this.snapshot.currentRun ? { ...this.snapshot.currentRun } : null,
    };
  }

  private async openSocket(url: string) {
    await new Promise<void>((resolve, reject) => {
      const socket = new window.WebSocket(url);
      let settled = false;

      socket.onopen = () => {
        settled = true;
        this.socket = socket;
        this.socketEndpoint = url;
        this.reconnectAttempt = 0;
        this.transitionConnection('connecting', {
          handshakePhase: 'socket_open',
          diagnostics: ['Socket opened. Starting explicit gateway handshake.', 'Gateway data remains unverified until initialization completes.'],
          lastError: undefined,
        });
        this.pushLog('info', `Connected socket to ${url}; waiting for handshake readiness.`);
        resolve();
      };

      socket.onmessage = (event) => {
        this.onMessage(event.data);
      };

      socket.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error(`Failed to open WebSocket ${url}`));
          return;
        }
        this.pushLog('error', `Gateway socket error on ${url}`);
      };

      socket.onclose = (event) => {
        this.stopHeartbeat();
        this.clearHandshakeTimer();
        this.socket = null;
        this.socketEndpoint = null;
        const intentional = this.manuallyDisconnected || event.code === 1000;
        if (intentional) {
          this.transitionConnection('disconnected', {
            handshakePhase: 'idle',
            lastError: undefined,
            diagnostics: ['Socket closed cleanly.'],
          });
          return;
        }

        const reason = event.reason || `Socket closed with code ${event.code}`;
        this.transitionConnection('error', {
          lastError: reason,
          handshakePhase: this.snapshot.handshakePhase === 'ready' ? 'degraded' : 'failed',
        });
        this.pushLog('warn', `Gateway disconnected: ${reason}`);
        if (this.snapshot.sessions.length === 0 && this.snapshot.currentRun === null) {
          this.activateFallback(`Socket closed before verified data arrived: ${reason}`);
        }
        this.scheduleReconnect();
      };
    });
  }

  private beginHandshake() {
    if (this.socket?.readyState !== WebSocket.OPEN) return;

    this.transitionConnection('connecting', {
      handshakePhase: 'handshake_sent',
      diagnostics: ['Socket open.', 'Sending exploratory initialization messages while protocol details are verified.'],
      protocolConfidence: 'exploratory',
    });

    // TODO(openclaw-protocol): Verify the exact connect/auth/init payload required by the gateway before considering the socket ready.
    this.safeSend(
      { type: 'gateway.connect', payload: {} },
      {
        note: 'exploratory gateway.connect handshake',
        commandKind: 'gateway.connect',
        purpose: 'attempt protocol handshake',
        variant: 'primary',
        strategy: 'primary',
        strategyReason: 'Preferred exploratory handshake guess while explicit gateway readiness remains unverified.',
        commandGroup: 'handshake',
      },
    );
    // TODO(openclaw-protocol): Verify whether the real gateway expects an auth/init envelope instead of the guessed type above.
    this.safeSend(
      { action: 'connect', capabilities: ['sessions', 'messages', 'runs', 'logs'] },
      {
        note: 'exploratory connect handshake',
        commandKind: 'connect',
        purpose: 'attempt protocol handshake',
        variant: 'fallback',
        strategy: 'fallback',
        strategyReason: 'Small retained fallback because the connect/auth envelope is still unconfirmed.',
        commandGroup: 'handshake',
      },
    );

    this.clearHandshakeTimer();
    this.handshakeTimer = window.setTimeout(() => {
      if (this.snapshot.handshakePhase !== 'ready') {
        this.transitionConnection('connecting', {
          handshakePhase: 'degraded',
          diagnostics: [
            'No verified handshake acknowledgement observed yet.',
            'Continuing with cautious bootstrap requests instead of assuming the socket is ready.',
          ],
        });
        this.logDiagnostic('handshake_notice', 'warn', 'Handshake acknowledgement still unverified; continuing in degraded exploratory mode.');
      }
    }, HANDSHAKE_NOTICE_TIMEOUT_MS);

    window.setTimeout(() => this.requestBootstrapData(), HANDSHAKE_BOOTSTRAP_DELAY_MS);
    this.startHeartbeat();
  }

  private onMessage(data: unknown) {
    let parsed: unknown;
    try {
      parsed = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON from gateway.';
      this.recordTrace({
        direction: 'inbound',
        confidence: 'exploratory',
        parseCategory: 'parse_failure',
        summary: `parse failure: ${message}`,
        payloadSummary: summarizeRawPayload(data),
        responseTo: this.findRecentOutboundMatches(),
      });
      this.emit({
        type: 'error',
        kind: 'parse_failure',
        message: `Protocol parsing error: ${message}`,
        raw: data,
        confidence: 'exploratory',
        parseCategory: 'parse_failure',
      });
      this.logDiagnostic('parse_failure', 'error', `Protocol parsing error: ${message}`);
      this.logDiagnostic('unknown_raw_event', 'warn', `Raw gateway payload preserved after parse failure: ${summarizeRawPayload(data)}`);
      return;
    }

    const events = parseGatewayMessage(parsed);
    const inboundSummary = summarizeRawPayload(parsed);
    this.pushLog('info', `Gateway recv ${inboundSummary}`);
    for (const event of events) {
      const parseCategory = event.parseCategory ?? 'exploratory_parse';
      const inboundCorrelationId =
        ('clientRequestId' in event && typeof event.clientRequestId === 'string' ? event.clientRequestId : undefined) ??
        ('correlationId' in event && typeof event.correlationId === 'string' ? event.correlationId : undefined);
      const responseTo = this.findRecentOutboundMatches(inboundCorrelationId);
      this.recordTrace({
        direction: 'inbound',
        confidence: event.confidence,
        parseCategory,
        summary: this.describeInboundEvent(event),
        payloadSummary: inboundSummary,
        correlationId: inboundCorrelationId,
        responseTo,
      });
      this.noteInboundSignal(inboundCorrelationId, responseTo);
      this.pushLog(
        parseCategory === 'parse_failure' || parseCategory === 'unknown_raw' ? 'warn' : 'info',
        `Gateway parser result [${parseCategory}] ${this.describeInboundEvent(event)}`,
      );
      this.applyEvent(event);
      this.emit(event);
    }
  }

  private applyEvent(event: GatewayEvent) {
    if (
      this.snapshot.handshakePhase !== 'ready' &&
      (event.verificationSignal === 'explicit_ack' || event.verificationSignal === 'explicit_verified_flag')
    ) {
      this.promoteHandshakeReady(
        event.verificationSignal === 'explicit_ack'
          ? 'Verified gateway handshake acknowledgement observed.'
          : 'Verified gateway protocol flag observed during initialization.',
      );
    }

    switch (event.type) {
      case 'connection':
        this.snapshot.connectionState = event.state;
        this.snapshot.handshakePhase = event.handshakePhase ?? this.snapshot.handshakePhase;
        this.snapshot.lastHeartbeat = event.lastHeartbeat ?? this.snapshot.lastHeartbeat;
        this.snapshot.latencyMs = event.latencyMs ?? this.snapshot.latencyMs;
        this.snapshot.usingMockFallback = event.usingMockFallback ?? this.snapshot.usingMockFallback;
        this.snapshot.dataSource = event.dataSource ?? this.snapshot.dataSource;
        this.snapshot.lastError = event.lastError;
        this.snapshot.protocolConfidence = event.protocolConfidence ?? event.confidence ?? this.snapshot.protocolConfidence;
        if (event.diagnostics?.length) {
          this.snapshot.diagnostics = this.mergeDiagnostics(event.diagnostics);
        }
        if (event.lastHeartbeat) {
          this.markHeartbeat(event.lastHeartbeat, event.latencyMs ?? null);
        }
        break;
      case 'run':
        this.snapshot.currentRun = event.run;
        this.setGatewayDataMode('gateway', event.confidence);
        if (event.run?.sessionId) {
          this.patchSession(event.run.sessionId, { status: event.run.status, updatedAt: new Date().toISOString() });
        }
        break;
      case 'sessions_snapshot':
        this.snapshot.sessions = event.sessions;
        this.setGatewayDataMode(event.source, event.confidence);
        this.resolveSessionRequests(event.sessions);
        break;
      case 'session':
        this.upsertSession(event.session);
        this.setGatewayDataMode(event.source, event.confidence);
        break;
      case 'message':
        this.upsertMessage(event.sessionId, event.message, event.mode);
        this.setGatewayDataMode(event.source, event.confidence);
        break;
      case 'message_delta':
        this.appendMessageDelta(event.sessionId, event.messageId, event.delta, event.timestamp, event.role);
        this.setGatewayDataMode(event.source, event.confidence);
        break;
      case 'tool_event':
        this.attachToolEvent(event.sessionId, event.messageId, event.toolEvent);
        this.setGatewayDataMode(event.source, event.confidence);
        break;
      case 'raw_event':
        this.logDiagnostic(event.kind, 'warn', event.summary);
        break;
      case 'log':
        this.logSubscribers.forEach((subscriber) => subscriber(event.entry));
        break;
      case 'error':
        this.snapshot.lastError = event.message;
        this.snapshot.diagnostics = this.mergeDiagnostics([event.message]);
        this.logDiagnostic(event.kind ?? 'parse_failure', event.fatal ? 'error' : 'warn', event.message);
        break;
    }
  }

  private requestBootstrapData() {
    if (this.socket?.readyState !== WebSocket.OPEN) return;

    // TODO(openclaw-protocol): Verify the subscription message and topic names supported by the real gateway.
    this.safeSend(
      { type: 'subscribe', payload: { topics: ['sessions', 'messages', 'runs', 'logs'] } },
      {
        note: 'exploratory subscribe command',
        commandKind: 'subscribe',
        purpose: 'request stream subscriptions',
        variant: 'primary',
        strategy: 'primary',
        strategyReason: 'Single exploratory subscribe request retained because there is no concrete evidence for an alternate topic-subscription envelope yet.',
        commandGroup: 'subscribe',
      },
    );
    void this.requestSessionsSnapshot();
    void this.getCurrentRun();
  }

  private requestSessionsSnapshot() {
    return new Promise<Session[]>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        this.requestResolvers.delete(resolver);
        this.logDiagnostic(
          'handshake_notice',
          'warn',
          'Session snapshot request timed out; keeping current gateway state and waiting for later events instead of activating fallback immediately.',
        );
        resolve([]);
      }, SESSION_REQUEST_TIMEOUT_MS);

      const resolver = (sessions: Session[]) => {
        window.clearTimeout(timeoutId);
        this.requestResolvers.delete(resolver);
        resolve(sessions);
      };

      this.requestResolvers.add(resolver);

      // TODO(openclaw-protocol): Verify the session-list request schema accepted by the real gateway.
      this.safeSend(
        { type: 'sessions.list' },
        {
          note: 'exploratory sessions.list command',
          commandKind: 'sessions.list',
          purpose: 'request session snapshot',
          strategy: 'primary',
          strategyReason: 'Only the sessions.list request is retained; no extra guessed list variant is sent without protocol evidence.',
          commandGroup: 'sessions.list',
        },
      );
    });
  }

  private resolveSessionRequests(sessions: Session[]) {
    this.requestResolvers.forEach((resolver) => resolver(sessions));
    this.requestResolvers.clear();
  }

  private safeSend(payload: Record<string, unknown>, options: SendOptions) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;

    try {
      this.socket.send(JSON.stringify(payload));
      this.pushLog(
        'info',
        `Gateway send [${options.commandKind}] ${options.purpose}${options.variant ? ` (${options.variant} variant)` : ''}${options.strategyReason ? ` — ${options.strategyReason}` : ''}.`,
      );
      const traceEntry = this.recordTrace({
        direction: 'outbound',
        confidence: 'exploratory',
        commandKind: options.commandKind,
        purpose: options.purpose,
        variant: options.variant,
        strategy: options.strategy,
        strategyReason: options.strategyReason,
        commandGroup: options.commandGroup,
        linkedAttemptId: options.linkedAttemptId,
        correlationId: options.correlationId,
        summary: `${options.commandKind} → ${options.purpose}`,
        payloadSummary: summarizeRawPayload(payload),
      });
      return traceEntry.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown send failure.';
      this.emit({
        type: 'error',
        kind: 'parse_failure',
        message: `Failed to send gateway command: ${message}`,
        raw: payload,
        confidence: 'exploratory',
        parseCategory: 'parse_failure',
      });
      return false;
    }
  }

  private recordTrace(entry: Omit<ProtocolTraceEntry, 'id' | 'recordedAt' | 'handshakePhase'>) {
    const traceEntry: ProtocolTraceEntry = {
      id: `trace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      recordedAt: new Date().toISOString(),
      handshakePhase: this.snapshot.handshakePhase,
      ...entry,
    };

    this.protocolTrace = [traceEntry, ...this.protocolTrace].slice(0, TRACE_LIMIT);
    this.snapshot.protocolTrace = this.protocolTrace.map((item) => ({
      ...item,
      responseTo: item.responseTo ? [...item.responseTo] : undefined,
    }));

    if (traceEntry.direction === 'outbound') {
      this.recentOutboundTrace = [traceEntry, ...this.recentOutboundTrace].filter(
        (item, index, array) =>
          index === array.findIndex((candidate) => candidate.id === item.id) &&
          Date.now() - new Date(item.recordedAt).getTime() <= RESPONSE_CORRELATION_WINDOW_MS,
      );
    }

    this.traceSubscribers.forEach((subscriber) => subscriber(traceEntry));
    return traceEntry;
  }

  private findRecentOutboundMatches(correlationId?: string) {
    const now = Date.now();
    this.recentOutboundTrace = this.recentOutboundTrace.filter((entry) => now - new Date(entry.recordedAt).getTime() <= RESPONSE_CORRELATION_WINDOW_MS);
    const exactMatches = correlationId
      ? this.recentOutboundTrace.filter((entry) => entry.correlationId === correlationId).map((entry) => entry.id)
      : [];
    return exactMatches.length > 0 ? exactMatches : this.recentOutboundTrace.map((entry) => entry.id);
  }

  private noteInboundSignal(correlationId?: string, responseTo?: string[]) {
    const now = Date.now();
    this.recentInboundSignals = [
      { at: now, correlationId, responseTo },
      ...this.recentInboundSignals.filter((entry) => now - entry.at <= RESPONSE_CORRELATION_WINDOW_MS),
    ];
  }

  private shouldStageSendMessageFallback() {
    return this.snapshot.protocolConfidence !== 'verified' || this.snapshot.handshakePhase !== 'ready';
  }

  private shouldSendMessageFallback(primaryTraceId: string, correlationId: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;

    const now = Date.now();
    this.recentInboundSignals = this.recentInboundSignals.filter((entry) => now - entry.at <= RESPONSE_CORRELATION_WINDOW_MS);

    return !this.recentInboundSignals.some(
      (entry) => entry.correlationId === correlationId || Boolean(entry.responseTo?.includes(primaryTraceId)),
    );
  }

  private describeInboundEvent(event: GatewayEvent) {
    switch (event.type) {
      case 'connection':
        return `connection ${event.state}`;
      case 'sessions_snapshot':
        return `sessions snapshot (${event.sessions.length})`;
      case 'session':
        return `session ${event.session.id}`;
      case 'run':
        return event.run ? `run ${event.run.id} (${event.run.status})` : 'run cleared';
      case 'message':
        return `message ${event.message.role} ${event.sessionId}`;
      case 'message_delta':
        return `message delta ${event.sessionId}/${event.messageId}`;
      case 'tool_event':
        return `tool event ${event.toolEvent.title}`;
      case 'log':
        return `log ${event.entry.level}`;
      case 'raw_event':
        return `unknown/raw ${event.kind}`;
      case 'error':
        return `parse failure ${event.kind ?? 'error'}`;
      default:
        return 'gateway event';
    }
  }

  private emit(event: GatewayEvent) {
    this.eventSubscribers.forEach((subscriber) => subscriber(event));
  }

  private transitionConnection(
    state: ConnectionState,
    options: {
      lastError?: string;
      usingMockFallback?: boolean;
      diagnostics?: string[];
      handshakePhase?: HandshakePhase;
      dataSource?: GatewayDataSource;
      protocolConfidence?: GatewaySnapshot['protocolConfidence'];
      replaceDiagnostics?: boolean;
    } = {},
  ) {
    this.snapshot.connectionState = state;
    this.snapshot.handshakePhase = options.handshakePhase ?? this.snapshot.handshakePhase;
    this.snapshot.usingMockFallback = options.usingMockFallback ?? this.snapshot.usingMockFallback;
    this.snapshot.dataSource = options.dataSource ?? this.snapshot.dataSource;
    this.snapshot.lastError = options.lastError;
    this.snapshot.protocolConfidence = options.protocolConfidence ?? this.snapshot.protocolConfidence;

    const diagnostics = options.replaceDiagnostics ? [] : [...this.snapshot.diagnostics];
    if (options.lastError) {
      diagnostics.unshift(options.lastError);
    }
    if (options.diagnostics?.length) {
      diagnostics.unshift(...options.diagnostics);
    }
    if (this.snapshot.usingMockFallback && !diagnostics.includes('Fallback mock data is active by explicit operator-safe downgrade.')) {
      diagnostics.unshift('Fallback mock data is active by explicit operator-safe downgrade.');
    }
    this.snapshot.diagnostics = diagnostics.slice(0, 10);

    this.emit({
      type: 'connection',
      state,
      handshakePhase: this.snapshot.handshakePhase,
      lastHeartbeat: this.snapshot.lastHeartbeat,
      latencyMs: this.snapshot.latencyMs,
      diagnostics: this.snapshot.diagnostics,
      usingMockFallback: this.snapshot.usingMockFallback,
      dataSource: this.snapshot.dataSource,
      lastError: options.lastError,
      confidence: this.snapshot.protocolConfidence,
      protocolConfidence: this.snapshot.protocolConfidence,
    });

    if (options.lastError) {
      this.pushLog(state === 'error' ? 'error' : 'warn', options.lastError);
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      // TODO(openclaw-protocol): Verify whether the real gateway accepts an application-level ping event.
      this.safeSend(
        { type: 'ping', timestamp: new Date().toISOString() },
        {
          note: 'exploratory heartbeat ping',
          commandKind: 'ping',
          purpose: 'probe gateway liveness',
          strategy: 'primary',
          strategyReason: 'Single liveness probe retained; no alternate heartbeat envelope has concrete evidence yet.',
          commandGroup: 'ping',
        },
      );
      this.emit({
        type: 'connection',
        state: this.snapshot.connectionState,
        handshakePhase: this.snapshot.handshakePhase,
        latencyMs: this.snapshot.latencyMs,
        lastHeartbeat: this.snapshot.lastHeartbeat,
        diagnostics: this.snapshot.diagnostics,
        usingMockFallback: this.snapshot.usingMockFallback,
        dataSource: this.snapshot.dataSource,
        lastError: this.snapshot.lastError,
        confidence: this.snapshot.protocolConfidence,
        protocolConfidence: this.snapshot.protocolConfidence,
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private markHeartbeat(timestamp: string, latencyMs: number | null) {
    this.snapshot.lastHeartbeat = timestamp;
    this.snapshot.latencyMs = latencyMs ?? this.snapshot.latencyMs;
    this.emit({
      type: 'connection',
      state: this.snapshot.connectionState,
      handshakePhase: this.snapshot.handshakePhase,
      lastHeartbeat: this.snapshot.lastHeartbeat,
      latencyMs: this.snapshot.latencyMs,
      diagnostics: this.snapshot.diagnostics,
      usingMockFallback: this.snapshot.usingMockFallback,
      dataSource: this.snapshot.dataSource,
      lastError: this.snapshot.lastError,
      confidence: this.snapshot.protocolConfidence,
      protocolConfidence: this.snapshot.protocolConfidence,
    });
  }

  private scheduleReconnect() {
    if (this.manuallyDisconnected || !isBrowser || this.reconnectTimer !== null) return;

    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect(this.endpoint);
    }, delay);

    this.snapshot.diagnostics = this.mergeDiagnostics([`Reconnect scheduled in ${delay} ms.`]);
    this.emit({
      type: 'connection',
      state: 'connecting',
      handshakePhase: this.snapshot.handshakePhase,
      diagnostics: this.snapshot.diagnostics,
      lastHeartbeat: this.snapshot.lastHeartbeat,
      latencyMs: this.snapshot.latencyMs,
      usingMockFallback: this.snapshot.usingMockFallback,
      dataSource: this.snapshot.dataSource,
      lastError: this.snapshot.lastError,
      confidence: this.snapshot.protocolConfidence,
      protocolConfidence: this.snapshot.protocolConfidence,
    });
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearHandshakeTimer() {
    if (this.handshakeTimer !== null) {
      window.clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
  }

  private resetSnapshotForEndpointChange(previousEndpoint: string, nextEndpoint: string) {
    this.resolveSessionRequests([]);
    this.protocolTrace = [];
    this.recentOutboundTrace = [];
    this.snapshot.sessions = [];
    this.snapshot.currentRun = null;
    this.snapshot.dataSource = 'none';
    this.snapshot.usingMockFallback = false;
    this.snapshot.lastHeartbeat = null;
    this.snapshot.latencyMs = null;
    this.snapshot.lastError = undefined;
    this.snapshot.protocolConfidence = 'exploratory';
    this.snapshot.handshakePhase = 'idle';
    this.snapshot.protocolTrace = [];
    this.snapshot.diagnostics = [
      `Endpoint switched from ${previousEndpoint} to ${nextEndpoint}.`,
      'Cleared stale gateway snapshot for the previous endpoint; waiting for explicit handshake verification and fresh data.',
      'Prior diagnostics/history from the previous endpoint are not treated as current status.',
    ];

    this.emit({
      type: 'run',
      run: null,
      confidence: 'exploratory',
    });
    this.emit({
      type: 'sessions_snapshot',
      sessions: [],
      source: 'none',
      confidence: 'exploratory',
    });
    this.emit({
      type: 'connection',
      state: 'connecting',
      handshakePhase: 'idle',
      lastHeartbeat: null,
      latencyMs: null,
      diagnostics: this.snapshot.diagnostics,
      usingMockFallback: false,
      dataSource: 'none',
      lastError: undefined,
      confidence: 'exploratory',
      protocolConfidence: 'exploratory',
    });
  }

  private async resetActiveSocket(reason: string) {
    this.stopHeartbeat();
    this.clearHandshakeTimer();

    if (!this.socket) {
      return;
    }

    const socket = this.socket;
    this.socket = null;
    this.socketEndpoint = null;

    if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
      return;
    }

    this.manuallyDisconnected = true;
    socket.close(1000, reason);
    this.manuallyDisconnected = false;
  }

  private mergeDiagnostics(next: string[]) {
    const merged = [...next, ...this.snapshot.diagnostics].filter((value, index, array) => value && array.indexOf(value) === index);
    return merged.slice(0, 10);
  }

  private pushLog(level: 'info' | 'warn' | 'error', message: string) {
    const entry = createLogEntry(level, 'gateway', message);
    this.logSubscribers.forEach((subscriber) => subscriber(entry));
  }

  private logDiagnostic(kind: DiagnosticEventKind, level: 'info' | 'warn' | 'error', message: string) {
    this.pushLog(level, `[${kind}] ${message}`);
  }

  private activateFallback(reason: string) {
    if (this.snapshot.usingMockFallback) return;

    this.snapshot.sessions = [];
    this.snapshot.currentRun = null;
    this.snapshot.usingMockFallback = true;
    this.snapshot.dataSource = 'fallback';
    this.snapshot.protocolConfidence = 'exploratory';
    this.snapshot.diagnostics = this.mergeDiagnostics([`Fallback activated: ${reason}`]);
    this.logDiagnostic('fallback_activated', 'warn', reason);

    this.emit({
      type: 'connection',
      state: this.snapshot.connectionState,
      handshakePhase: this.snapshot.handshakePhase,
      lastHeartbeat: this.snapshot.lastHeartbeat,
      latencyMs: this.snapshot.latencyMs,
      diagnostics: this.snapshot.diagnostics,
      usingMockFallback: true,
      dataSource: 'fallback',
      lastError: this.snapshot.lastError,
      confidence: 'exploratory',
      protocolConfidence: 'exploratory',
    });
    this.emit({ type: 'sessions_snapshot', sessions: this.snapshot.sessions, source: 'fallback', confidence: 'exploratory' });
    this.emit({ type: 'run', run: this.snapshot.currentRun, confidence: 'exploratory' });
  }

  private promoteHandshakeReady(reason: string) {
    this.clearHandshakeTimer();
    this.snapshot.handshakePhase = 'ready';
    this.snapshot.connectionState = 'connected';
    this.snapshot.diagnostics = this.mergeDiagnostics([reason]);
    this.snapshot.protocolConfidence = 'verified';
    this.emit({
      type: 'connection',
      state: 'connected',
      handshakePhase: 'ready',
      lastHeartbeat: this.snapshot.lastHeartbeat,
      latencyMs: this.snapshot.latencyMs,
      diagnostics: this.snapshot.diagnostics,
      usingMockFallback: this.snapshot.usingMockFallback,
      dataSource: this.snapshot.dataSource,
      lastError: this.snapshot.lastError,
      confidence: 'verified',
      protocolConfidence: 'verified',
    });
  }

  private setGatewayDataMode(source: GatewayDataSource, confidence: GatewayEvent['confidence']) {
    if (source === 'gateway') {
      this.snapshot.usingMockFallback = false;
      this.snapshot.dataSource = 'gateway';
    }
    if (source === 'fallback') {
      this.snapshot.usingMockFallback = true;
      this.snapshot.dataSource = 'fallback';
    }
    if (confidence === 'verified' || this.snapshot.protocolConfidence !== 'verified') {
      this.snapshot.protocolConfidence = confidence ?? this.snapshot.protocolConfidence;
    }
  }

  private upsertSession(session: Session) {
    const index = this.snapshot.sessions.findIndex((item) => item.id === session.id);
    if (index >= 0) {
      this.snapshot.sessions[index] = session;
      return;
    }
    this.snapshot.sessions = [session, ...this.snapshot.sessions];
  }

  private patchSession(sessionId: string, patch: Partial<Session>) {
    this.snapshot.sessions = this.snapshot.sessions.map((session) =>
      session.id === sessionId
        ? {
            ...session,
            ...patch,
            metadata: patch.metadata ? { ...patch.metadata } : session.metadata,
            messages: patch.messages ? [...patch.messages] : session.messages,
          }
        : session,
    );
  }

  private upsertMessage(sessionId: string, message: Session['messages'][number], mode: 'replace' | 'append') {
    this.snapshot.sessions = this.snapshot.sessions.map((session) => {
      if (session.id !== sessionId) return session;
      const nextMessages = [...session.messages];
      const existingIndex = nextMessages.findIndex((item) => item.id === message.id);
      if (existingIndex >= 0) {
        nextMessages[existingIndex] =
          mode === 'append'
            ? { ...nextMessages[existingIndex], content: `${nextMessages[existingIndex].content}${message.content}`, streaming: message.streaming }
            : { ...nextMessages[existingIndex], ...message };
      } else {
        nextMessages.push(message);
      }
      return {
        ...session,
        messages: nextMessages,
        preview: message.content || session.preview,
        updatedAt: message.timestamp,
      };
    });
  }

  private appendMessageDelta(sessionId: string, messageId: string, delta: string, timestamp: string, role: Session['messages'][number]['role']) {
    this.snapshot.sessions = this.snapshot.sessions.map((session) => {
      if (session.id !== sessionId) return session;
      const nextMessages = [...session.messages];
      const existingIndex = nextMessages.findIndex((item) => item.id === messageId);
      if (existingIndex >= 0) {
        nextMessages[existingIndex] = {
          ...nextMessages[existingIndex],
          content: `${nextMessages[existingIndex].content}${delta}`,
          timestamp,
          streaming: true,
        };
      } else {
        nextMessages.push({ id: messageId, role, content: delta, timestamp, streaming: true });
      }
      return {
        ...session,
        status: 'running',
        messages: nextMessages,
        preview: nextMessages[nextMessages.length - 1]?.content ?? session.preview,
        updatedAt: timestamp,
      };
    });
  }

  private attachToolEvent(sessionId: string, messageId: string, toolEvent: NonNullable<Session['messages'][number]['toolEvents']>[number]) {
    this.snapshot.sessions = this.snapshot.sessions.map((session) => {
      if (session.id !== sessionId) return session;
      return {
        ...session,
        messages: session.messages.map((message) => {
          if (message.id !== messageId) return message;
          const nextTools = [...(message.toolEvents ?? [])];
          const existing = nextTools.findIndex((tool) => tool.id === toolEvent.id);
          if (existing >= 0) {
            nextTools[existing] = toolEvent;
          } else {
            nextTools.push(toolEvent);
          }
          return { ...message, toolEvents: nextTools };
        }),
        updatedAt: toolEvent.timestamp,
      };
    });
  }
}

export const realGatewayClient = new RealGatewayClient();
