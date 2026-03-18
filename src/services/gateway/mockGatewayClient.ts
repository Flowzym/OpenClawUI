import { mockCurrentRun, mockGatewayStatus, mockLogs, mockSessions } from '../../data/mockData';
import type { ConnectionState } from '../../types';
import { createLogEntry } from './adapters';
import type { GatewayClient } from './types';

export const mockGatewayClient: GatewayClient = {
  async connect() {
    // TODO: Replace mock connection handshake with a real WebSocket client for the OpenClaw gateway.
    return 'connected' satisfies ConnectionState;
  },
  async disconnect() {
    // TODO: Replace mock disconnect handling with gateway socket teardown and cleanup.
  },
  async stopRun() {
    // TODO: Replace mock stop action with a real gateway abort/stop command.
  },
  async listSessions() {
    // TODO: Replace mock session listing with real gateway-backed session retrieval.
    return mockSessions;
  },
  subscribeLogs(callback) {
    // TODO: Replace mock log subscription with gateway event stream listeners.
    const timer = window.setInterval(() => {
      const entry = mockLogs[Math.floor(Math.random() * mockLogs.length)];
      callback({ ...entry, id: `${entry.id}-${Date.now()}`, timestamp: new Date().toISOString() });
    }, 8000);

    return () => window.clearInterval(timer);
  },
  async getCurrentRun() {
    // TODO: Replace mock current run lookup with gateway status polling or push updates.
    return mockCurrentRun;
  },
  subscribeEvents(callback) {
    callback({
      type: 'connection',
      state: 'connected',
      lastHeartbeat: mockGatewayStatus.lastHeartbeat,
      latencyMs: mockGatewayStatus.latencyMs,
      diagnostics: mockGatewayStatus.diagnostics,
      usingMockFallback: true,
    });
    callback({ type: 'run', run: mockCurrentRun });
    callback({ type: 'sessions_snapshot', sessions: mockSessions, source: 'mock' });
    return () => undefined;
  },
  async sendMessage(input) {
    return { sessionId: input.sessionId ?? mockSessions[0]?.id ?? 'mock-session', messageId: `mock-${Date.now()}` };
  },
  getSnapshot() {
    return {
      connectionState: 'connected',
      currentRun: mockCurrentRun,
      sessions: mockSessions,
      usingMockFallback: true,
      lastHeartbeat: mockGatewayStatus.lastHeartbeat,
      latencyMs: mockGatewayStatus.latencyMs,
      endpoint: mockGatewayStatus.endpoint,
      diagnostics: mockGatewayStatus.diagnostics,
      lastError: undefined,
    };
  },
};
