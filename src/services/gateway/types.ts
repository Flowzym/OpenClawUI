import type { ConnectionState, LogEntry, Message, RunInfo, Session, ToolEvent } from '../../types';

export interface SendMessageInput {
  sessionId?: string;
  content: string;
}

export interface StopRunInput {
  runId?: string;
  sessionId?: string;
}

export interface GatewaySnapshot {
  connectionState: ConnectionState;
  currentRun: RunInfo | null;
  sessions: Session[];
  usingMockFallback: boolean;
  lastHeartbeat: string;
  latencyMs: number;
  endpoint: string;
  diagnostics: string[];
  lastError?: string;
}

export type GatewayEvent =
  | {
      type: 'connection';
      state: ConnectionState;
      lastHeartbeat?: string;
      latencyMs?: number;
      diagnostics?: string[];
      usingMockFallback?: boolean;
      lastError?: string;
    }
  | {
      type: 'run';
      run: RunInfo | null;
    }
  | {
      type: 'sessions_snapshot';
      sessions: Session[];
      source: 'gateway' | 'mock';
    }
  | {
      type: 'session';
      session: Session;
      source: 'gateway' | 'mock';
    }
  | {
      type: 'message';
      sessionId: string;
      message: Message;
      mode: 'replace' | 'append';
      source: 'gateway' | 'mock';
    }
  | {
      type: 'message_delta';
      sessionId: string;
      messageId: string;
      delta: string;
      timestamp: string;
      role: Message['role'];
      source: 'gateway' | 'mock';
    }
  | {
      type: 'tool_event';
      sessionId: string;
      messageId: string;
      toolEvent: ToolEvent;
      source: 'gateway' | 'mock';
    }
  | {
      type: 'log';
      entry: LogEntry;
    }
  | {
      type: 'error';
      message: string;
      fatal?: boolean;
      raw?: unknown;
    };

export interface GatewayClient {
  connect: (url: string) => Promise<ConnectionState>;
  disconnect: () => Promise<void>;
  stopRun: (target?: string | StopRunInput) => Promise<void>;
  listSessions: () => Promise<Session[]>;
  subscribeLogs: (callback: (entry: LogEntry) => void) => () => void;
  getCurrentRun: () => Promise<RunInfo | null>;
  subscribeEvents: (callback: (event: GatewayEvent) => void) => () => void;
  sendMessage: (input: SendMessageInput) => Promise<{ sessionId: string; messageId?: string }>;
  getSnapshot: () => GatewaySnapshot;
}
