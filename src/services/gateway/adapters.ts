import type { LogEntry, Message, RunInfo, RunStatus, Session, SessionMetadata, ToolEvent } from '../../types';
import type { GatewayEvent } from './types';

const DEFAULT_METADATA: SessionMetadata = {
  agent: 'unknown',
  model: 'unknown',
  mode: 'workspace',
  cwd: 'unknown',
  branch: 'unknown',
};

const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asString = (value: unknown): string | undefined => (typeof value === 'string' && value.length > 0 ? value : undefined);
const asNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const asArray = (value: unknown): unknown[] | undefined => (Array.isArray(value) ? value : undefined);

const firstString = (record: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = asString(record[key]);
    if (value) return value;
  }
  return undefined;
};

const firstNumber = (record: Record<string, unknown>, keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = asNumber(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
};

const normalizeRunStatus = (value: unknown): RunStatus => {
  switch (String(value ?? '').toLowerCase()) {
    case 'running':
    case 'in_progress':
    case 'streaming':
      return 'running';
    case 'stopping':
    case 'cancelling':
    case 'cancelled':
      return 'stopping';
    case 'error':
    case 'failed':
      return 'error';
    default:
      return 'idle';
  }
};

const normalizeRole = (value: unknown): Message['role'] => {
  switch (String(value ?? '').toLowerCase()) {
    case 'system':
    case 'user':
    case 'assistant':
    case 'tool':
      return value as Message['role'];
    default:
      return 'assistant';
  }
};

const normalizeToolStatus = (value: unknown): ToolEvent['status'] => {
  switch (String(value ?? '').toLowerCase()) {
    case 'running':
    case 'complete':
    case 'error':
      return value as ToolEvent['status'];
    case 'completed':
    case 'done':
      return 'complete';
    case 'failed':
      return 'error';
    default:
      return 'running';
  }
};

export const createLogEntry = (level: LogEntry['level'], source: string, message: string): LogEntry => ({
  id: `${source}-${level}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  level,
  source,
  message,
  timestamp: new Date().toISOString(),
});

export const normalizeToolEvent = (value: unknown, fallbackId: string): ToolEvent | null => {
  const record = asObject(value);
  if (!record) return null;

  return {
    id: firstString(record, ['id', 'tool_event_id', 'toolId']) ?? fallbackId,
    title: firstString(record, ['title', 'name', 'tool_name']) ?? 'Tool event',
    status: normalizeToolStatus(record.status),
    output: firstString(record, ['output', 'content', 'text']) ?? '',
    timestamp: firstString(record, ['timestamp', 'created_at', 'updated_at']) ?? new Date().toISOString(),
    collapsible: record.collapsible === false ? false : true,
  };
};

export const normalizeMessage = (value: unknown, sessionId: string, fallbackId: string): Message | null => {
  const record = asObject(value);
  if (!record) return null;

  const content = firstString(record, ['content', 'text', 'message']) ?? '';
  const toolValues = asArray(record.toolEvents) ?? asArray(record.tools) ?? [];

  return {
    id: firstString(record, ['id', 'message_id', 'messageId']) ?? fallbackId,
    role: normalizeRole(firstString(record, ['role', 'sender', 'author'])),
    content,
    timestamp: firstString(record, ['timestamp', 'created_at', 'updated_at']) ?? new Date().toISOString(),
    streaming: Boolean(record.streaming ?? record.in_progress ?? record.partial),
    toolEvents: toolValues
      .map((tool, index) => normalizeToolEvent(tool, `${sessionId}-tool-${index}-${Date.now()}`))
      .filter((tool): tool is ToolEvent => Boolean(tool)),
  };
};

export const normalizeRun = (value: unknown): RunInfo | null => {
  const record = asObject(value);
  if (!record) return null;

  const id = firstString(record, ['id', 'run_id', 'runId']);
  if (!id) return null;

  return {
    id,
    label: firstString(record, ['label', 'title', 'summary', 'task']) ?? 'OpenClaw run',
    agent: firstString(record, ['agent', 'agent_name']) ?? 'unknown',
    model: firstString(record, ['model', 'model_name']) ?? 'unknown',
    status: normalizeRunStatus(record.status),
    startedAt: firstString(record, ['started_at', 'startedAt', 'created_at', 'timestamp']) ?? new Date().toISOString(),
    sessionId: firstString(record, ['session_id', 'sessionId']),
  };
};

export const normalizeSession = (value: unknown): Session | null => {
  const record = asObject(value);
  if (!record) return null;

  const id = firstString(record, ['id', 'session_id', 'sessionId']);
  if (!id) return null;

  const metadata = asObject(record.metadata) ?? record;
  const messages = (asArray(record.messages) ?? [])
    .map((message, index) => normalizeMessage(message, id, `${id}-message-${index}`))
    .filter((message): message is Message => Boolean(message));

  return {
    id,
    title: firstString(record, ['title', 'name']) ?? `Session ${id}`,
    projectId: firstString(record, ['project_id', 'projectId']) ?? 'unknown',
    status: normalizeRunStatus(record.status),
    updatedAt: firstString(record, ['updated_at', 'updatedAt', 'timestamp']) ?? new Date().toISOString(),
    preview:
      firstString(record, ['preview', 'summary']) ??
      messages[messages.length - 1]?.content ??
      'Awaiting gateway session detail.',
    unreadCount: firstNumber(record, ['unread_count', 'unreadCount']) ?? 0,
    metadata: {
      agent: firstString(metadata, ['agent', 'agent_name']) ?? DEFAULT_METADATA.agent,
      model: firstString(metadata, ['model', 'model_name']) ?? DEFAULT_METADATA.model,
      mode: firstString(metadata, ['mode']) ?? DEFAULT_METADATA.mode,
      cwd: firstString(metadata, ['cwd', 'working_directory', 'workingDirectory']) ?? DEFAULT_METADATA.cwd,
      branch: firstString(metadata, ['branch', 'git_branch', 'gitBranch']) ?? DEFAULT_METADATA.branch,
    },
    messages,
  };
};

const tryNormalizeLog = (record: Record<string, unknown>): LogEntry | null => {
  const level = firstString(record, ['level', 'severity']);
  const message = firstString(record, ['message', 'content', 'text']);
  if (!level || !message) return null;

  return {
    id: firstString(record, ['id', 'log_id']) ?? `log-${Date.now()}`,
    level: level === 'warn' || level === 'error' ? level : 'info',
    source: firstString(record, ['source', 'logger', 'topic']) ?? 'gateway',
    message,
    timestamp: firstString(record, ['timestamp', 'created_at']) ?? new Date().toISOString(),
  };
};

const tryNormalizeConnectionEvent = (record: Record<string, unknown>): GatewayEvent | null => {
  const stateCandidate = firstString(record, ['state', 'connection_state', 'connectionState', 'status']);
  if (!stateCandidate) return null;
  const state = (['connected', 'connecting', 'disconnected', 'error'] as const).includes(stateCandidate as never)
    ? (stateCandidate as 'connected' | 'connecting' | 'disconnected' | 'error')
    : undefined;
  if (!state) return null;

  return {
    type: 'connection',
    state,
    lastHeartbeat: firstString(record, ['last_heartbeat', 'lastHeartbeat', 'timestamp']),
    latencyMs: firstNumber(record, ['latency_ms', 'latencyMs']),
    diagnostics: (asArray(record.diagnostics) ?? []).flatMap((item) => (typeof item === 'string' ? [item] : [])),
    usingMockFallback: Boolean(record.using_mock_fallback ?? record.usingMockFallback),
    lastError: firstString(record, ['error', 'last_error', 'lastError']),
  };
};

export const parseGatewayMessage = (raw: unknown): GatewayEvent[] => {
  const record = asObject(raw);
  if (!record) {
    return [{ type: 'error', message: 'Gateway message was not an object.', raw }];
  }

  const eventType = String(record.type ?? record.event ?? record.kind ?? '').toLowerCase();

  if (eventType === 'log') {
    const entry = tryNormalizeLog(record);
    return entry ? [{ type: 'log', entry }] : [{ type: 'error', message: 'Unable to parse gateway log event.', raw }];
  }

  if (eventType === 'heartbeat' || eventType === 'pong') {
    return [
      {
        type: 'connection',
        state: 'connected',
        lastHeartbeat: firstString(record, ['timestamp', 'created_at']) ?? new Date().toISOString(),
        latencyMs: firstNumber(record, ['latency_ms', 'latencyMs']),
      },
    ];
  }

  const connectionEvent = tryNormalizeConnectionEvent(record);
  if (connectionEvent && ['connection', 'status', 'gateway_status'].includes(eventType || 'status')) {
    return [connectionEvent];
  }

  const payload = asObject(record.payload) ?? asObject(record.data) ?? record;
  const sessionsPayload = asArray(payload.sessions);
  if (sessionsPayload && (eventType.includes('session') || eventType === 'snapshot' || 'sessions' in payload)) {
    const sessions = sessionsPayload.map(normalizeSession).filter((session): session is Session => Boolean(session));
    if (sessions.length > 0) {
      return [{ type: 'sessions_snapshot', sessions, source: 'gateway' }];
    }
  }

  const runCandidate = normalizeRun(payload.run ?? payload.current_run ?? payload.currentRun ?? (eventType.includes('run') ? payload : null));
  if (runCandidate || eventType.includes('run')) {
    return [{ type: 'run', run: runCandidate }];
  }

  const sessionCandidate = normalizeSession(payload.session ?? (eventType === 'session' || eventType === 'session_updated' ? payload : null));
  if (sessionCandidate) {
    return [{ type: 'session', session: sessionCandidate, source: 'gateway' }];
  }

  const sessionId = firstString(payload, ['session_id', 'sessionId']) ?? firstString(record, ['session_id', 'sessionId']);
  if (sessionId) {
    const messageCandidate = normalizeMessage(payload.message ?? (eventType.includes('message') ? payload : null), sessionId, `${sessionId}-message-${Date.now()}`);
    if (messageCandidate && !eventType.includes('delta')) {
      return [{ type: 'message', sessionId, message: messageCandidate, mode: 'replace', source: 'gateway' }];
    }

    const delta = firstString(payload, ['delta', 'content_delta', 'contentDelta', 'chunk']);
    if (delta && (eventType.includes('delta') || eventType.includes('stream') || 'delta' in payload || 'chunk' in payload)) {
      return [
        {
          type: 'message_delta',
          sessionId,
          messageId: firstString(payload, ['message_id', 'messageId', 'id']) ?? `${sessionId}-stream`,
          delta,
          timestamp: firstString(payload, ['timestamp', 'created_at']) ?? new Date().toISOString(),
          role: normalizeRole(firstString(payload, ['role', 'sender', 'author'])),
          source: 'gateway',
        },
      ];
    }

    const toolEvent = normalizeToolEvent(payload.tool_event ?? payload.toolEvent ?? payload.tool, `${sessionId}-tool-${Date.now()}`);
    if (toolEvent) {
      return [
        {
          type: 'tool_event',
          sessionId,
          messageId: firstString(payload, ['message_id', 'messageId']) ?? `${sessionId}-stream`,
          toolEvent,
          source: 'gateway',
        },
      ];
    }
  }

  const logEntry = tryNormalizeLog(record);
  if (logEntry) {
    return [{ type: 'log', entry: logEntry }];
  }

  return [{ type: 'error', message: 'Received an unrecognized gateway event shape.', raw }];
};
