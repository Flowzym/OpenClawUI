import type { ConnectionState, LogEntry, RunInfo, Session } from '../../types';

export interface GatewayClient {
  connect: (url: string) => Promise<ConnectionState>;
  disconnect: () => Promise<void>;
  stopRun: (runId?: string) => Promise<void>;
  listSessions: () => Promise<Session[]>;
  subscribeLogs: (callback: (entry: LogEntry) => void) => () => void;
  getCurrentRun: () => Promise<RunInfo | null>;
}
