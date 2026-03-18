import { create } from 'zustand';
import { mockCurrentRun, mockGatewayStatus } from '../data/mockData';
import { gatewayClient } from '../services/gateway';
import type { GatewayEvent } from '../services/gateway/types';
import type { GatewayStatus, RunInfo } from '../types';

interface ConnectionStore {
  gateway: GatewayStatus & { usingMockFallback?: boolean; lastError?: string };
  currentRun: RunInfo | null;
  activeAgent: string;
  activeModel: string;
  initialized: boolean;
  initialize: (url?: string) => () => void;
  connect: (url?: string) => Promise<void>;
  disconnect: () => Promise<void>;
  refreshRun: () => Promise<void>;
  stopRun: () => Promise<void>;
}

const applyGatewayEvent = (
  event: GatewayEvent,
  set: (updater: (state: ConnectionStore) => Partial<ConnectionStore>) => void,
) => {
  if (event.type === 'connection') {
    set((state) => ({
      gateway: {
        ...state.gateway,
        state: event.state,
        lastHeartbeat: event.lastHeartbeat ?? state.gateway.lastHeartbeat,
        latencyMs: event.latencyMs ?? state.gateway.latencyMs,
        diagnostics: event.diagnostics ?? state.gateway.diagnostics,
        usingMockFallback: event.usingMockFallback ?? state.gateway.usingMockFallback,
        lastError: event.lastError,
      },
    }));
  }

  if (event.type === 'run') {
    set(() => ({
      currentRun: event.run,
      activeAgent: event.run?.agent ?? 'none',
      activeModel: event.run?.model ?? 'none',
    }));
  }
};

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  gateway: {
    ...mockGatewayStatus,
    usingMockFallback: true,
  },
  currentRun: mockCurrentRun,
  activeAgent: mockCurrentRun.agent,
  activeModel: mockCurrentRun.model,
  initialized: false,
  initialize(url) {
    if (!get().initialized) {
      const dispose = gatewayClient.subscribeEvents((event) => applyGatewayEvent(event, set));
      set({ initialized: true });
      void get().connect(url ?? get().gateway.endpoint);
      return dispose;
    }

    void get().connect(url ?? get().gateway.endpoint);
    return () => undefined;
  },
  async connect(url) {
    const endpoint = url ?? get().gateway.endpoint;
    set((state) => ({
      gateway: {
        ...state.gateway,
        endpoint,
        state: 'connecting',
      },
    }));
    await gatewayClient.connect(endpoint);
  },
  async disconnect() {
    await gatewayClient.disconnect();
  },
  async refreshRun() {
    const run = await gatewayClient.getCurrentRun();
    set({ currentRun: run, activeAgent: run?.agent ?? 'none', activeModel: run?.model ?? 'none' });
  },
  async stopRun() {
    const runId = get().currentRun?.id;
    if (!runId) return;

    set((state) => ({
      currentRun: state.currentRun ? { ...state.currentRun, status: 'stopping' } : state.currentRun,
    }));
    await gatewayClient.stopRun({ runId, sessionId: get().currentRun?.sessionId });
  },
}));
