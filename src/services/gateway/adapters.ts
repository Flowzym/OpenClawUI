import type { LogEntry, Message, RunInfo, RunStatus, Session, SessionMetadata, ToolEvent } from '../../types';
import type { GatewayEvent, ProtocolConfidence, ProtocolParseCategory } from './types';

const DEFAULT_METADATA: SessionMetadata = {
  agent: 'unknown',
  model: 'unknown',
  mode: 'workspace',
  cwd: 'unknown',
  branch: 'unknown',
};

interface ParseContext {
  confidence: ProtocolConfidence;
  parseCategory: ProtocolParseCategory;
  note?: string;
  raw: unknown;
  verificationSignal?: 'explicit_ack' | 'explicit_verified_flag' | 'heartbeat';
}

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

const determineVerification = (eventType: string, record: Record<string, unknown>) => {
  if (record.protocol_verified === true || record.verified === true) {
    return {
      confidence: 'verified' as const,
      verificationSignal: 'explicit_verified_flag' as const,
    };
  }

  if (['gateway_ready', 'handshake_ack', 'handshake_ready'].includes(eventType)) {
    return {
      confidence: 'verified' as const,
      verificationSignal: 'explicit_ack' as const,
    };
  }

  return {
    confidence: 'exploratory' as const,
    verificationSignal: undefined,
  };
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

const normalizeRole = (value: unknown): Message['role'] | null => {
  switch (String(value ?? '').toLowerCase()) {
    case 'system':
    case 'user':
    case 'assistant':
    case 'tool':
      return String(value).toLowerCase() as Message['role'];
    default:
      return null;
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

export const summarizeRawPayload = (value: unknown) => {
  if (typeof value === 'string') {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }
  try {
    const json = JSON.stringify(value);
    return json.length > 220 ? `${json.slice(0, 217)}...` : json;
  } catch {
    return String(value);
  }
};

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

  const id = firstString(record, ['id', 'message_id', 'messageId']) ?? fallbackId;
  const role = normalizeRole(firstString(record, ['role', 'sender', 'author']));
  const content = firstString(record, ['content', 'text', 'message']) ?? '';
  const hasMeaningfulPayload = Boolean(role) || content.length > 0 || Array.isArray(record.toolEvents) || Array.isArray(record.tools);

  if (!hasMeaningfulPayload) return null;

  const toolValues = asArray(record.toolEvents) ?? asArray(record.tools) ?? [];

  return {
    id,
    role: role ?? 'assistant',
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

const tryNormalizeConnectionEvent = (record: Record<string, unknown>, context: ParseContext): GatewayEvent | null => {
  const stateCandidate = firstString(record, ['state', 'connection_state', 'connectionState', 'status']);
  if (!stateCandidate) return null;

  const normalizedState = stateCandidate.toLowerCase();
  const state = (['connected', 'connecting', 'disconnected', 'error'] as const).includes(normalizedState as never)
    ? (normalizedState as 'connected' | 'connecting' | 'disconnected' | 'error')
    : undefined;
  if (!state) return null;

  return {
    type: 'connection',
    state,
    lastHeartbeat: firstString(record, ['last_heartbeat', 'lastHeartbeat', 'timestamp']) ?? null,
    latencyMs: firstNumber(record, ['latency_ms', 'latencyMs']) ?? null,
    diagnostics: (asArray(record.diagnostics) ?? []).flatMap((item) => (typeof item === 'string' ? [item] : [])),
    usingMockFallback: Boolean(record.using_mock_fallback ?? record.usingMockFallback),
    lastError: firstString(record, ['error', 'last_error', 'lastError']),
    confidence: context.confidence,
    note: context.note,
    raw: context.raw,
    protocolConfidence: context.confidence,
    verificationSignal: context.verificationSignal,
  };
};

const createRawDiagnostic = (context: ParseContext, summary: string): GatewayEvent => ({
  type: 'raw_event',
  kind: 'unknown_raw_event',
  summary,
  source: 'gateway',
  confidence: context.confidence,
  parseCategory: context.parseCategory,
  note: context.note,
  raw: context.raw,
  verificationSignal: context.verificationSignal,
});

export const parseGatewayMessage = (raw: unknown): GatewayEvent[] => {
  const record = asObject(raw);
  if (!record) {
    return [
      {
        type: 'error',
        kind: 'parse_failure',
        message: 'Gateway message was not an object.',
        raw,
        confidence: 'exploratory',
        parseCategory: 'parse_failure',
      },
    ];
  }

  const eventType = String(record.type ?? record.event ?? record.kind ?? '').toLowerCase();
  const payload = asObject(record.payload) ?? asObject(record.data) ?? record;
  const verification = determineVerification(eventType, record);
  const confidence = verification.confidence;
  const context: ParseContext = {
    confidence,
    parseCategory: confidence === 'verified' ? 'verified_parse' : 'exploratory_parse',
    raw,
    verificationSignal: verification.verificationSignal,
    note:
      confidence === 'exploratory'
        ? 'Parsed through exploratory protocol heuristics.'
        : 'Matched an explicit protocol verification signal.',
  };

  if (eventType === 'log') {
    const entry = tryNormalizeLog(record);
    return entry
      ? [{ type: 'log', entry, confidence, parseCategory: context.parseCategory, note: context.note, raw }]
      : [{ type: 'error', kind: 'parse_failure', message: 'Unable to parse gateway log event.', raw, confidence, parseCategory: 'parse_failure' }];
  }

  if (eventType === 'heartbeat' || eventType === 'pong') {
    return [
      {
        type: 'connection',
        state: 'connected',
        lastHeartbeat: firstString(record, ['timestamp', 'created_at']) ?? new Date().toISOString(),
        latencyMs: firstNumber(record, ['latency_ms', 'latencyMs']) ?? null,
        confidence: 'exploratory',
        parseCategory: 'exploratory_parse',
        note: 'Heartbeat/pong observed from gateway transport; handshake remains unverified without an explicit acknowledgement.',
        raw,
        protocolConfidence: 'exploratory',
        verificationSignal: 'heartbeat',
      },
    ];
  }

  const connectionEvent = tryNormalizeConnectionEvent(record, context);
  if (connectionEvent && ['connection', 'status', 'gateway_status', 'connection_state'].includes(eventType || 'status')) {
    return [connectionEvent];
  }

  const sessionsPayload = asArray(payload.sessions);
  if (sessionsPayload && ['session_snapshot', 'sessions_snapshot'].includes(eventType)) {
    const sessions = sessionsPayload.map(normalizeSession).filter((session): session is Session => Boolean(session));
    if (sessions.length > 0) {
      return [
        {
          type: 'sessions_snapshot',
          sessions,
          source: 'gateway',
          confidence,
          parseCategory: context.parseCategory,
          note: `${context.note ?? 'Parsed through exploratory protocol heuristics.'} Inbound session snapshot payload observed.`,
          raw,
        },
      ];
    }
    return [{ type: 'error', kind: 'parse_failure', message: 'Session snapshot event contained no recognizable sessions.', raw, confidence, parseCategory: 'parse_failure' }];
  }

  if (eventType === 'run' || eventType === 'run_updated' || eventType === 'current_run') {
    const runCandidate = normalizeRun(payload.run ?? payload.current_run ?? payload.currentRun ?? payload);
    if (runCandidate || payload.run === null || payload.current_run === null || payload.currentRun === null) {
      const runNote =
        eventType === 'current_run'
          ? 'Inbound current_run payload observed; compare trace correlation to tell whether this answered an explicit run.current request.'
          : 'Inbound run event observed; this may update current-run state even without an explicit run.current request.';
      return [
        {
          type: 'run',
          run: runCandidate,
          confidence,
          parseCategory: context.parseCategory,
          note: `${context.note ?? 'Parsed through exploratory protocol heuristics.'} ${runNote}`,
          raw,
        },
      ];
    }
    return [{ type: 'error', kind: 'parse_failure', message: 'Run event was present but did not contain a recognizable run payload.', raw, confidence, parseCategory: 'parse_failure' }];
  }

  const sessionCandidate = normalizeSession(
    payload.session ??
      (eventType === 'session_updated' || eventType === 'session_created' || eventType === 'session' ? payload : null),
  );
  if (sessionCandidate) {
    return [{ type: 'session', session: sessionCandidate, source: 'gateway', confidence, parseCategory: context.parseCategory, note: context.note, raw }];
  }

  const sessionId = firstString(payload, ['session_id', 'sessionId']) ?? firstString(record, ['session_id', 'sessionId']);
  if (sessionId) {
    const correlationId = firstString(payload, ['client_request_id', 'clientRequestId', 'correlation_id', 'correlationId']);
    const clientRequestId = firstString(payload, ['client_request_id', 'clientRequestId']);
    const clientMessageId = firstString(payload, ['client_message_id', 'clientMessageId']);

    if (eventType === 'message_delta' || eventType === 'session_message_delta') {
      const delta = firstString(payload, ['delta', 'content_delta', 'contentDelta', 'chunk']);
      if (delta) {
        const role = normalizeRole(firstString(payload, ['role', 'sender', 'author'])) ?? 'assistant';
        return [
          {
            type: 'message_delta',
            sessionId,
            messageId: firstString(payload, ['message_id', 'messageId', 'id']) ?? `${sessionId}-stream`,
            delta,
            timestamp: firstString(payload, ['timestamp', 'created_at']) ?? new Date().toISOString(),
            role,
            source: 'gateway',
            correlationId,
            clientRequestId,
            clientMessageId,
            confidence,
            parseCategory: context.parseCategory,
            note: context.note,
            raw,
            verificationSignal: context.verificationSignal,
          },
        ];
      }
      return [{ type: 'error', kind: 'parse_failure', message: 'Message delta event missing delta content.', raw, confidence, parseCategory: 'parse_failure' }];
    }

    if (eventType === 'tool_event') {
      const toolEvent = normalizeToolEvent(payload.tool_event ?? payload.toolEvent ?? payload.tool, `${sessionId}-tool-${Date.now()}`);
      if (toolEvent) {
        return [
          {
            type: 'tool_event',
            sessionId,
            messageId: firstString(payload, ['message_id', 'messageId']) ?? `${sessionId}-stream`,
            toolEvent,
            source: 'gateway',
            confidence,
            parseCategory: context.parseCategory,
            note: context.note,
            raw,
          },
        ];
      }
      return [{ type: 'error', kind: 'parse_failure', message: 'Tool event payload was incomplete.', raw, confidence, parseCategory: 'parse_failure' }];
    }

    if (eventType === 'message' || eventType === 'message_created' || eventType === 'message_updated') {
      const messageCandidate = normalizeMessage(payload.message ?? payload, sessionId, `${sessionId}-message-${Date.now()}`);
      if (messageCandidate) {
        return [
          {
            type: 'message',
            sessionId,
            message: messageCandidate,
            mode: 'replace',
            source: 'gateway',
            correlationId,
            clientRequestId,
            clientMessageId,
            confidence,
            parseCategory: context.parseCategory,
            note: context.note,
            raw,
            verificationSignal: context.verificationSignal,
          },
        ];
      }
      return [{ type: 'error', kind: 'parse_failure', message: 'Message event was present but could not be normalized safely.', raw, confidence, parseCategory: 'parse_failure' }];
    }
  }

  const logEntry = tryNormalizeLog(record);
  if (logEntry) {
    return [{ type: 'log', entry: logEntry, confidence, parseCategory: context.parseCategory, note: context.note, raw }];
  }

  return [
    createRawDiagnostic(
      { ...context, parseCategory: 'unknown_raw' },
      `Unknown gateway payload preserved for diagnostics: ${summarizeRawPayload(raw)}`,
    ),
  ];
};
