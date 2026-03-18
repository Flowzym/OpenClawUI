import { mockCurrentRun, mockGatewayStatus, mockSessions } from '../../data/mockData';
import type { ConnectionState, RunInfo, Session } from '../../types';
import { createLogEntry, parseGatewayMessage } from './adapters';
import type { GatewayClient, GatewayEvent, GatewaySnapshot, SendMessageInput, StopRunInput } from './types';

const DEFAULT_ENDPOINT = 'ws://127.0.0.1:18789';
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000];
const REQUEST_TIMEOUT_MS = 900;
const HEARTBEAT_INTERVAL_MS = 15000;

const isBrowser = typeof window !== 'undefined' && typeof window.WebSocket !== 'undefined';

class RealGatewayClient implements GatewayClient {
  private socket: WebSocket | null = null;
  private endpoint = DEFAULT_ENDPOINT;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectAttempt = 0;
  private manuallyDisconnected = false;
  private logSubscribers = new Set<(entry: ReturnType<typeof createLogEntry>) => void>();
  private eventSubscribers = new Set<(event: GatewayEvent) => void>();
  private requestResolvers = new Set<(sessions: Session[]) => void>();
  private snapshot: GatewaySnapshot = {
    connectionState: mockGatewayStatus.state,
    currentRun: mockCurrentRun,
    sessions: mockSessions,
    usingMockFallback: true,
    lastHeartbeat: mockGatewayStatus.lastHeartbeat,
    latencyMs: mockGatewayStatus.latencyMs,
    endpoint: mockGatewayStatus.endpoint,
    diagnostics: [...mockGatewayStatus.diagnostics, 'Running with mock fallback until the real gateway responds.'],
    lastError: undefined,
  };

  async connect(url: string) {
    this.endpoint = url || DEFAULT_ENDPOINT;
    this.snapshot.endpoint = this.endpoint;
    this.manuallyDisconnected = false;

    if (!isBrowser) {
      this.transitionConnection('error', 'Browser WebSocket API is unavailable in the current environment.', true);
      return this.snapshot.connectionState;
    }

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return this.snapshot.connectionState;
    }

    this.clearReconnectTimer();
    this.transitionConnection('connecting', undefined, this.snapshot.usingMockFallback);

    try {
      await this.openSocket(this.endpoint);
      this.requestBootstrapData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to connect to the OpenClaw gateway.';
      this.transitionConnection('error', message, true);
      this.scheduleReconnect();
    }

    return this.snapshot.connectionState;
  }

  async disconnect() {
    this.manuallyDisconnected = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();

    if (this.socket) {
      this.socket.close(1000, 'operator disconnect');
      this.socket = null;
    }

    this.transitionConnection('disconnected', undefined, this.snapshot.usingMockFallback);
  }

  async stopRun(target?: string | StopRunInput) {
    const payload = typeof target === 'string' ? { runId: target } : target ?? {};

    // TODO(openclaw-protocol): Verify the stop/abort command schema accepted by the real gateway.
    this.safeSend({ type: 'run.stop', payload });
    // TODO(openclaw-protocol): Verify whether the gateway expects an alternate action field instead of type.
    this.safeSend({ action: 'stop_run', ...payload });

    const runId = payload.runId ?? this.snapshot.currentRun?.id;
    if (runId && this.snapshot.currentRun?.id === runId) {
      this.snapshot.currentRun = { ...this.snapshot.currentRun, status: 'stopping' };
      this.emit({ type: 'run', run: this.snapshot.currentRun });
    }
  }

  async listSessions() {
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
      this.safeSend({ type: 'run.current' });
      // TODO(openclaw-protocol): Verify whether the gateway expects an alternate action field for current-run lookups.
      this.safeSend({ action: 'get_current_run' });
    }

    return this.snapshot.currentRun;
  }

  subscribeEvents(callback: (event: GatewayEvent) => void) {
    this.eventSubscribers.add(callback);
    callback({
      type: 'connection',
      state: this.snapshot.connectionState,
      diagnostics: this.snapshot.diagnostics,
      latencyMs: this.snapshot.latencyMs,
      lastHeartbeat: this.snapshot.lastHeartbeat,
      usingMockFallback: this.snapshot.usingMockFallback,
      lastError: this.snapshot.lastError,
    });
    callback({ type: 'run', run: this.snapshot.currentRun });
    callback({ type: 'sessions_snapshot', sessions: this.snapshot.sessions, source: this.snapshot.usingMockFallback ? 'mock' : 'gateway' });
    return () => this.eventSubscribers.delete(callback);
  }

  async sendMessage(input: SendMessageInput) {
    const sessionId = input.sessionId ?? this.snapshot.currentRun?.sessionId ?? this.snapshot.sessions[0]?.id ?? `session-${Date.now()}`;
    const messageId = `user-${Date.now()}`;

    // TODO(openclaw-protocol): Verify the send-message command schema and response correlation identifiers.
    this.safeSend({
      type: 'session.message',
      payload: {
        session_id: sessionId,
        content: input.content,
      },
    });
    // TODO(openclaw-protocol): Verify whether the gateway expects snake_case action names instead of dotted types.
    this.safeSend({ action: 'send_message', session_id: sessionId, content: input.content });

    return { sessionId, messageId };
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
        this.transitionConnection('connected', undefined, this.snapshot.usingMockFallback);
        this.startHeartbeat();
        this.pushLog('info', `Connected to ${url}`);
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
        this.socket = null;
        const intentional = this.manuallyDisconnected || event.code === 1000;
        if (intentional) {
          this.transitionConnection('disconnected', undefined, this.snapshot.usingMockFallback);
          return;
        }

        const reason = event.reason || `Socket closed with code ${event.code}`;
        this.transitionConnection('error', reason, true);
        this.pushLog('warn', `Gateway disconnected: ${reason}`);
        this.scheduleReconnect();
      };
    });
  }

  private onMessage(data: unknown) {
    this.markHeartbeat();

    let parsed: unknown;
    try {
      parsed = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON from gateway.';
      this.emit({ type: 'error', message: `Protocol parsing error: ${message}`, raw: data });
      this.pushLog('error', `Protocol parsing error: ${message}`);
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
        this.snapshot.lastHeartbeat = event.lastHeartbeat ?? this.snapshot.lastHeartbeat;
        this.snapshot.latencyMs = event.latencyMs ?? this.snapshot.latencyMs;
        this.snapshot.usingMockFallback = event.usingMockFallback ?? this.snapshot.usingMockFallback;
        this.snapshot.lastError = event.lastError;
        if (event.diagnostics?.length) {
          this.snapshot.diagnostics = this.mergeDiagnostics(event.diagnostics);
        }
        break;
      case 'run':
        this.snapshot.currentRun = event.run;
        if (event.run?.sessionId) {
          this.patchSession(event.run.sessionId, { status: event.run.status, updatedAt: new Date().toISOString() });
        }
        break;
      case 'sessions_snapshot':
        this.snapshot.sessions = event.sessions;
        this.snapshot.usingMockFallback = event.source === 'mock';
        this.resolveSessionRequests(event.sessions);
        break;
      case 'session':
        this.upsertSession(event.session);
        this.snapshot.usingMockFallback = event.source === 'mock' ? this.snapshot.usingMockFallback : false;
        break;
      case 'message':
        this.upsertMessage(event.sessionId, event.message, event.mode);
        this.snapshot.usingMockFallback = event.source === 'mock' ? this.snapshot.usingMockFallback : false;
        break;
      case 'message_delta':
        this.appendMessageDelta(event.sessionId, event.messageId, event.delta, event.timestamp, event.role);
        this.snapshot.usingMockFallback = event.source === 'mock' ? this.snapshot.usingMockFallback : false;
        break;
      case 'tool_event':
        this.attachToolEvent(event.sessionId, event.messageId, event.toolEvent);
        this.snapshot.usingMockFallback = event.source === 'mock' ? this.snapshot.usingMockFallback : false;
        break;
      case 'log':
        this.logSubscribers.forEach((subscriber) => subscriber(event.entry));
        break;
      case 'error':
        this.snapshot.lastError = event.message;
        this.snapshot.diagnostics = this.mergeDiagnostics([event.message]);
        this.pushLog(event.fatal ? 'error' : 'warn', event.message);
        break;
    }
  }

  private requestBootstrapData() {
    if (this.socket?.readyState !== WebSocket.OPEN) return;

    // TODO(openclaw-protocol): Verify the subscription message and topic names supported by the real gateway.
    this.safeSend({ type: 'subscribe', payload: { topics: ['sessions', 'messages', 'runs', 'logs'] } });
    // TODO(openclaw-protocol): Verify whether the gateway expects a flatter subscribe action schema.
    this.safeSend({ action: 'subscribe', topics: ['sessions', 'messages', 'runs', 'logs'] });
    void this.requestSessionsSnapshot();
    void this.getCurrentRun();
  }

  private requestSessionsSnapshot() {
    return new Promise<Session[]>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        this.requestResolvers.delete(resolver);
        resolve([]);
      }, REQUEST_TIMEOUT_MS);

      const resolver = (sessions: Session[]) => {
        window.clearTimeout(timeoutId);
        this.requestResolvers.delete(resolver);
        resolve(sessions);
      };

      this.requestResolvers.add(resolver);

      // TODO(openclaw-protocol): Verify the session-list request schema accepted by the real gateway.
      this.safeSend({ type: 'sessions.list' });
      // TODO(openclaw-protocol): Verify whether the gateway expects a snake_case action for session listing.
      this.safeSend({ action: 'list_sessions' });
    });
  }

  private resolveSessionRequests(sessions: Session[]) {
    this.requestResolvers.forEach((resolver) => resolver(sessions));
    this.requestResolvers.clear();
  }

  private safeSend(payload: Record<string, unknown>) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;

    try {
      this.socket.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown send failure.';
      this.emit({ type: 'error', message: `Failed to send gateway command: ${message}`, raw: payload });
      return false;
    }
  }

  private emit(event: GatewayEvent) {
    this.eventSubscribers.forEach((subscriber) => subscriber(event));
  }

  private transitionConnection(state: ConnectionState, lastError?: string, usingMockFallback = this.snapshot.usingMockFallback) {
    this.snapshot.connectionState = state;
    this.snapshot.lastHeartbeat = new Date().toISOString();
    this.snapshot.usingMockFallback = usingMockFallback;
    this.snapshot.lastError = lastError;

    const diagnostics = [...this.snapshot.diagnostics];
    if (lastError) {
      diagnostics.unshift(lastError);
    }
    if (usingMockFallback && !diagnostics.includes('Mock fallback retained while the real gateway is unavailable or partially understood.')) {
      diagnostics.unshift('Mock fallback retained while the real gateway is unavailable or partially understood.');
    }
    this.snapshot.diagnostics = diagnostics.slice(0, 8);

    this.emit({
      type: 'connection',
      state,
      lastHeartbeat: this.snapshot.lastHeartbeat,
      latencyMs: this.snapshot.latencyMs,
      diagnostics: this.snapshot.diagnostics,
      usingMockFallback,
      lastError,
    });

    if (lastError) {
      this.pushLog(state === 'error' ? 'error' : 'warn', lastError);
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      const sentAt = performance.now();
      // TODO(openclaw-protocol): Verify whether the real gateway accepts an application-level ping event.
      const sent = this.safeSend({ type: 'ping', timestamp: new Date().toISOString() });
      if (!sent) return;
      this.snapshot.latencyMs = Math.round(performance.now() - sentAt);
      this.emit({
        type: 'connection',
        state: this.snapshot.connectionState,
        latencyMs: this.snapshot.latencyMs,
        lastHeartbeat: this.snapshot.lastHeartbeat,
        diagnostics: this.snapshot.diagnostics,
        usingMockFallback: this.snapshot.usingMockFallback,
        lastError: this.snapshot.lastError,
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private markHeartbeat() {
    this.snapshot.lastHeartbeat = new Date().toISOString();
    this.emit({
      type: 'connection',
      state: this.snapshot.connectionState,
      lastHeartbeat: this.snapshot.lastHeartbeat,
      latencyMs: this.snapshot.latencyMs,
      diagnostics: this.snapshot.diagnostics,
      usingMockFallback: this.snapshot.usingMockFallback,
      lastError: this.snapshot.lastError,
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
      diagnostics: this.snapshot.diagnostics,
      lastHeartbeat: this.snapshot.lastHeartbeat,
      latencyMs: this.snapshot.latencyMs,
      usingMockFallback: true,
      lastError: this.snapshot.lastError,
    });
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private mergeDiagnostics(next: string[]) {
    return [...next, ...this.snapshot.diagnostics.filter((item) => !next.includes(item))].slice(0, 8);
  }

  private pushLog(level: 'info' | 'warn' | 'error', message: string) {
    const entry = createLogEntry(level, 'gateway', message);
    this.logSubscribers.forEach((subscriber) => subscriber(entry));
  }

  private upsertSession(session: Session) {
    const existingIndex = this.snapshot.sessions.findIndex((candidate) => candidate.id === session.id);
    if (existingIndex >= 0) {
      this.snapshot.sessions = this.snapshot.sessions.map((candidate, index) => (index === existingIndex ? session : candidate));
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
            metadata: patch.metadata ? { ...session.metadata, ...patch.metadata } : session.metadata,
            messages: patch.messages ?? session.messages,
          }
        : session,
    );
  }

  private upsertMessage(sessionId: string, message: Session['messages'][number], mode: 'replace' | 'append') {
    this.snapshot.sessions = this.snapshot.sessions.map((session) => {
      if (session.id !== sessionId) return session;

      const existingIndex = session.messages.findIndex((candidate) => candidate.id === message.id);
      const nextMessages = [...session.messages];

      if (existingIndex >= 0) {
        nextMessages[existingIndex] = mode === 'append'
          ? {
              ...nextMessages[existingIndex],
              ...message,
              content: `${nextMessages[existingIndex].content}${message.content}`,
            }
          : message;
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

      const existingIndex = session.messages.findIndex((message) => message.id === messageId);
      const nextMessages = [...session.messages];

      if (existingIndex >= 0) {
        nextMessages[existingIndex] = {
          ...nextMessages[existingIndex],
          content: `${nextMessages[existingIndex].content}${delta}`,
          timestamp,
          streaming: true,
        };
      } else {
        nextMessages.push({
          id: messageId,
          role,
          content: delta,
          timestamp,
          streaming: true,
        });
      }

      return {
        ...session,
        messages: nextMessages,
        preview: `${(nextMessages[nextMessages.length - 1]?.content ?? '').slice(0, 140)}`,
        updatedAt: timestamp,
        status: 'running',
      };
    });
  }

  private attachToolEvent(sessionId: string, messageId: string, toolEvent: NonNullable<Session['messages'][number]['toolEvents']>[number]) {
    this.snapshot.sessions = this.snapshot.sessions.map((session) => {
      if (session.id !== sessionId) return session;

      const nextMessages = session.messages.map((message) => {
        if (message.id !== messageId) return message;
        const existingToolIndex = message.toolEvents?.findIndex((event) => event.id === toolEvent.id) ?? -1;
        const nextToolEvents = [...(message.toolEvents ?? [])];
        if (existingToolIndex >= 0) {
          nextToolEvents[existingToolIndex] = toolEvent;
        } else {
          nextToolEvents.push(toolEvent);
        }
        return { ...message, toolEvents: nextToolEvents };
      });

      return { ...session, messages: nextMessages, updatedAt: toolEvent.timestamp };
    });
  }
}

export const realGatewayClient = new RealGatewayClient();
