import { mockCurrentRun, mockGatewayStatus, mockLogs, mockSessions } from '../../data/mockData';
import type { ConnectionState } from '../../types';
import type { GatewayClient } from './types';

export const mockGatewayClient: GatewayClient = {
  async connect() {
    return 'connected' satisfies ConnectionState;
  },
  async disconnect() {},
  async stopRun() {},
  async listSessions() {
    return mockSessions;
  },
  subscribeLogs(callback) {
    const timer = window.setInterval(() => {
      const entry = mockLogs[Math.floor(Math.random() * mockLogs.length)];
      callback({ ...entry, id: `${entry.id}-${Date.now()}`, timestamp: new Date().toISOString() });
    }, 8000);

    return () => window.clearInterval(timer);
  },
  subscribeTrace(callback) {
    callback({
      id: 'mock-trace-initial',
      direction: 'inbound',
      recordedAt: new Date().toISOString(),
      summary: 'mock gateway trace entry',
      handshakePhase: 'ready',
      confidence: 'exploratory',
      parseCategory: 'exploratory_parse',
      payloadSummary: 'Mock gateway client active.',
    });
    return () => undefined;
  },
  async getCurrentRun() {
    return mockCurrentRun;
  },
  subscribeEvents(callback) {
    callback({
      type: 'connection',
      state: 'connected',
      handshakePhase: 'ready',
      lastHeartbeat: mockGatewayStatus.lastHeartbeat,
      latencyMs: mockGatewayStatus.latencyMs,
      diagnostics: ['Mock gateway client active.'],
      usingMockFallback: true,
      dataSource: 'fallback',
      confidence: 'exploratory',
      protocolConfidence: 'exploratory',
    });
    callback({ type: 'run', run: mockCurrentRun, confidence: 'exploratory' });
    callback({ type: 'sessions_snapshot', sessions: mockSessions, source: 'fallback', confidence: 'exploratory' });
    return () => undefined;
  },
  async sendMessage(input) {
    return {
      sessionId: input.sessionId ?? mockSessions[0]?.id ?? 'mock-session',
      messageId: `mock-${Date.now()}`,
      clientRequestId: input.clientRequestId,
      clientMessageId: input.clientMessageId,
      assistantPlaceholderId: input.assistantPlaceholderId,
    };
  },
  getSnapshot() {
    return {
      connectionState: 'connected',
      handshakePhase: 'ready',
      currentRun: mockCurrentRun,
      currentRunSource: 'explicit_request',
      sessions: mockSessions,
      dataSource: 'fallback',
      usingMockFallback: true,
      lastHeartbeat: mockGatewayStatus.lastHeartbeat,
      latencyMs: mockGatewayStatus.latencyMs,
      endpoint: mockGatewayStatus.endpoint,
      diagnostics: ['Mock gateway client active.'],
      lastError: undefined,
      protocolConfidence: 'exploratory',
      protocolTrace: [],
    };
  },
};
