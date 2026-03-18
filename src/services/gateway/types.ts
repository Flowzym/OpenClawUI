import type { ConnectionState, LogEntry, Message, RunInfo, Session, ToolEvent } from '../../types';

export type ProtocolConfidence = 'verified' | 'exploratory';
export type GatewayDataSource = 'gateway' | 'fallback' | 'none';
export type HandshakePhase = 'idle' | 'socket_open' | 'handshake_sent' | 'ready' | 'degraded' | 'failed';
export type DiagnosticEventKind =
  | 'unknown_raw_event'
  | 'parse_failure'
  | 'handshake_failure'
  | 'handshake_notice'
  | 'fallback_activated';

export interface SendMessageInput {
  sessionId?: string;
  content: string;
  clientRequestId?: string;
  clientMessageId?: string;
  assistantPlaceholderId?: string;
}

export interface StopRunInput {
  runId?: string;
  sessionId?: string;
}

export interface GatewaySnapshot {
  connectionState: ConnectionState;
  handshakePhase: HandshakePhase;
  currentRun: RunInfo | null;
  sessions: Session[];
  dataSource: GatewayDataSource;
  usingMockFallback: boolean;
  lastHeartbeat: string | null;
  latencyMs: number | null;
  endpoint: string;
  diagnostics: string[];
  lastError?: string;
  protocolConfidence: ProtocolConfidence;
}

interface GatewayEventBase {
  confidence: ProtocolConfidence;
  raw?: unknown;
  note?: string;
}

export type GatewayEvent =
  | ({
      type: 'connection';
      state: ConnectionState;
      handshakePhase?: HandshakePhase;
      lastHeartbeat?: string | null;
      latencyMs?: number | null;
      diagnostics?: string[];
      usingMockFallback?: boolean;
      dataSource?: GatewayDataSource;
      lastError?: string;
      protocolConfidence?: ProtocolConfidence;
    } & GatewayEventBase)
  | ({
      type: 'run';
      run: RunInfo | null;
    } & GatewayEventBase)
  | ({
      type: 'sessions_snapshot';
      sessions: Session[];
      source: GatewayDataSource;
    } & GatewayEventBase)
  | ({
      type: 'session';
      session: Session;
      source: GatewayDataSource;
    } & GatewayEventBase)
  | ({
      type: 'message';
      sessionId: string;
      message: Message;
      mode: 'replace' | 'append';
      source: GatewayDataSource;
      correlationId?: string;
    } & GatewayEventBase)
  | ({
      type: 'message_delta';
      sessionId: string;
      messageId: string;
      delta: string;
      timestamp: string;
      role: Message['role'];
      source: GatewayDataSource;
      correlationId?: string;
    } & GatewayEventBase)
  | ({
      type: 'tool_event';
      sessionId: string;
      messageId: string;
      toolEvent: ToolEvent;
      source: GatewayDataSource;
    } & GatewayEventBase)
  | ({
      type: 'raw_event';
      kind: DiagnosticEventKind;
      summary: string;
      source: 'gateway';
    } & GatewayEventBase)
  | ({
      type: 'log';
      entry: LogEntry;
    } & GatewayEventBase)
  | ({
      type: 'error';
      message: string;
      fatal?: boolean;
      kind?: DiagnosticEventKind;
    } & GatewayEventBase);

export interface GatewayClient {
  connect: (url: string) => Promise<ConnectionState>;
  disconnect: () => Promise<void>;
  stopRun: (target?: string | StopRunInput) => Promise<void>;
  listSessions: () => Promise<Session[]>;
  subscribeLogs: (callback: (entry: LogEntry) => void) => () => void;
  getCurrentRun: () => Promise<RunInfo | null>;
  subscribeEvents: (callback: (event: GatewayEvent) => void) => () => void;
  sendMessage: (input: SendMessageInput) => Promise<{
    sessionId: string;
    messageId?: string;
    clientRequestId?: string;
    clientMessageId?: string;
    assistantPlaceholderId?: string;
  }>;
  getSnapshot: () => GatewaySnapshot;
}
