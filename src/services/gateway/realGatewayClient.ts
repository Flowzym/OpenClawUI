import type { ConnectionState, RunInfo, Session } from '../../types';
import { createLogEntry, parseGatewayMessage, summarizeRawPayload } from './adapters';
import type {
  GatewayClient,
  DiagnosticEventKind,
  GatewayDataSource,
  GatewayEvent,
  GatewaySnapshot,
  HandshakePhase,
  SendMessageInput,
  StopRunInput,
} from './types';

const DEFAULT_ENDPOINT = 'ws://127.0.0.1:18789';
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000];
const SESSION_REQUEST_TIMEOUT_MS = 4000;
const HEARTBEAT_INTERVAL_MS = 15000;
const HANDSHAKE_NOTICE_TIMEOUT_MS = 4000;
const HANDSHAKE_BOOTSTRAP_DELAY_MS = 350;

const isBrowser = typeof window !== 'undefined' && typeof window.WebSocket !== 'undefined';

class RealGatewayClient implements GatewayClient {
  private socket: WebSocket | null = null;
  private endpoint = DEFAULT_ENDPOINT;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private handshakeTimer: number | null = null;
  private reconnectAttempt = 0;
  private manuallyDisconnected = false;
  private logSubscribers = new Set<(entry: ReturnType<typeof createLogEntry>) => void>();
  private eventSubscribers = new Set<(event: GatewayEvent) => void>();
  private requestResolvers = new Set<(sessions: Session[]) => void>();
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
  };

  async connect(url: string) {
    this.endpoint = url || DEFAULT_ENDPOINT;
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

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return this.snapshot.connectionState;
    }

    this.clearReconnectTimer();
    this.transitionConnection('connecting', {
      handshakePhase: 'idle',
      diagnostics: ['Opening gateway socket.', 'Protocol verification still pending.'],
      dataSource: this.snapshot.dataSource,
      protocolConfidence: this.snapshot.protocolConfidence,
      lastError: undefined,
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
    this.safeSend({ type: 'run.stop', payload }, 'exploratory stop run command');
    // TODO(openclaw-protocol): Verify whether the gateway expects an alternate action field instead of type.
    this.safeSend({ action: 'stop_run', ...payload }, 'exploratory stop run action');

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

  async getCurrentRun(): Promise<RunInfo | null> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      // TODO(openclaw-protocol): Verify the current-run request schema accepted by the real gateway.
      this.safeSend({ type: 'run.current' }, 'exploratory current run command');
      // TODO(openclaw-protocol): Verify whether the gateway expects an alternate action field for current-run lookups.
      this.safeSend({ action: 'get_current_run' }, 'exploratory current run action');
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
    this.safeSend(
      {
        type: 'session.message',
        payload: {
          session_id: sessionId,
          content: input.content,
          client_request_id: clientRequestId,
          client_message_id: clientMessageId,
        },
      },
      'exploratory session.message payload',
    );
    // TODO(openclaw-protocol): Verify whether the gateway expects snake_case action names instead of dotted types.
    this.safeSend(
      {
        action: 'send_message',
        session_id: sessionId,
        content: input.content,
        client_request_id: clientRequestId,
        client_message_id: clientMessageId,
      },
      'exploratory send_message action',
    );

    return { sessionId, messageId: clientMessageId, clientRequestId, clientMessageId, assistantPlaceholderId };
  }

  getSnapshot() {
    return {
      ...this.snapshot,
      diagnostics: [...this.snapshot.diagnostics],
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
    this.safeSend({ type: 'gateway.connect', payload: {} }, 'exploratory gateway.connect handshake');
    // TODO(openclaw-protocol): Verify whether the real gateway expects an auth/init envelope instead of the guessed type above.
    this.safeSend({ action: 'connect', capabilities: ['sessions', 'messages', 'runs', 'logs'] }, 'exploratory connect handshake');

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
      this.emit({ type: 'error', kind: 'parse_failure', message: `Protocol parsing error: ${message}`, raw: data, confidence: 'exploratory' });
      this.logDiagnostic('parse_failure', 'error', `Protocol parsing error: ${message}`);
      this.logDiagnostic('unknown_raw_event', 'warn', `Raw gateway payload preserved after parse failure: ${summarizeRawPayload(data)}`);
      return;
    }

    const events = parseGatewayMessage(parsed);
    for (const event of events) {
      this.applyEvent(event);
      this.emit(event);
    }
  }

  private applyEvent(event: GatewayEvent) {
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
        if (event.confidence === 'verified' && this.snapshot.handshakePhase !== 'ready') {
          this.promoteHandshakeReady('Verified gateway connection event observed.');
        }
        break;
      case 'run':
        this.snapshot.currentRun = event.run;
        this.setGatewayDataMode('gateway', event.confidence);
        if (event.confidence === 'verified') {
          this.promoteHandshakeReady('Verified run payload received.');
        }
        if (event.run?.sessionId) {
          this.patchSession(event.run.sessionId, { status: event.run.status, updatedAt: new Date().toISOString() });
        }
        break;
      case 'sessions_snapshot':
        this.snapshot.sessions = event.sessions;
        this.setGatewayDataMode(event.source, event.confidence);
        this.resolveSessionRequests(event.sessions);
        if (event.confidence === 'verified') {
          this.promoteHandshakeReady('Verified session snapshot received.');
        }
        break;
      case 'session':
        this.upsertSession(event.session);
        this.setGatewayDataMode(event.source, event.confidence);
        if (event.confidence === 'verified') {
          this.promoteHandshakeReady('Verified session update received.');
        }
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
    this.safeSend({ type: 'subscribe', payload: { topics: ['sessions', 'messages', 'runs', 'logs'] } }, 'exploratory subscribe command');
    // TODO(openclaw-protocol): Verify whether the gateway expects a flatter subscribe action schema.
    this.safeSend({ action: 'subscribe', topics: ['sessions', 'messages', 'runs', 'logs'] }, 'exploratory subscribe action');
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
      this.safeSend({ type: 'sessions.list' }, 'exploratory sessions.list command');
      // TODO(openclaw-protocol): Verify whether the gateway expects a snake_case action for session listing.
      this.safeSend({ action: 'list_sessions' }, 'exploratory list_sessions action');
    });
  }

  private resolveSessionRequests(sessions: Session[]) {
    this.requestResolvers.forEach((resolver) => resolver(sessions));
    this.requestResolvers.clear();
  }

  private safeSend(payload: Record<string, unknown>, note: string) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;

    try {
      this.socket.send(JSON.stringify(payload));
      this.pushLog('info', `Gateway send (${note})`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown send failure.';
      this.emit({ type: 'error', kind: 'parse_failure', message: `Failed to send gateway command: ${message}`, raw: payload, confidence: 'exploratory' });
      return false;
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
    } = {},
  ) {
    this.snapshot.connectionState = state;
    this.snapshot.handshakePhase = options.handshakePhase ?? this.snapshot.handshakePhase;
    this.snapshot.usingMockFallback = options.usingMockFallback ?? this.snapshot.usingMockFallback;
    this.snapshot.dataSource = options.dataSource ?? this.snapshot.dataSource;
    this.snapshot.lastError = options.lastError;
    this.snapshot.protocolConfidence = options.protocolConfidence ?? this.snapshot.protocolConfidence;

    const diagnostics = [...this.snapshot.diagnostics];
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
      this.safeSend({ type: 'ping', timestamp: new Date().toISOString() }, 'exploratory heartbeat ping');
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
    this.snapshot.protocolConfidence = confidence ?? this.snapshot.protocolConfidence;
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
