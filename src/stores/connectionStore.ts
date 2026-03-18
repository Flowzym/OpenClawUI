import { create } from 'zustand';
import { gatewayClient } from '../services/gateway';
import type { GatewayEvent } from '../services/gateway/types';
import type { GatewayStatus, RunInfo } from '../types';

interface ConnectionStore {
  gateway: GatewayStatus & {
    usingMockFallback?: boolean;
    lastError?: string;
    handshakePhase: 'idle' | 'socket_open' | 'handshake_sent' | 'ready' | 'degraded' | 'failed';
    dataSource: 'gateway' | 'fallback' | 'none';
    protocolConfidence: 'verified' | 'exploratory';
  };
  currentRun: RunInfo | null;
  activeAgent: string;
  activeModel: string;
  initialized: boolean;
  initialize: () => () => void;
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
        handshakePhase: event.handshakePhase ?? state.gateway.handshakePhase,
        lastHeartbeat: event.lastHeartbeat ?? state.gateway.lastHeartbeat,
        latencyMs: event.latencyMs ?? state.gateway.latencyMs,
        diagnostics: event.diagnostics ?? state.gateway.diagnostics,
        usingMockFallback: event.usingMockFallback ?? state.gateway.usingMockFallback,
        dataSource: event.dataSource ?? state.gateway.dataSource,
        protocolConfidence: event.protocolConfidence ?? event.confidence ?? state.gateway.protocolConfidence,
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
    state: 'disconnected',
    latencyMs: null,
    endpoint: gatewayClient.getSnapshot().endpoint,
    lastHeartbeat: null,
    diagnostics: ['No gateway data yet.', 'Connect to begin protocol discovery.'],
    usingMockFallback: false,
    lastError: undefined,
    handshakePhase: 'idle',
    dataSource: 'none',
    protocolConfidence: 'exploratory',
  },
  currentRun: null,
  activeAgent: 'none',
  activeModel: 'none',
  initialized: false,
  initialize() {
    if (get().initialized) {
      return () => undefined;
    }

    const dispose = gatewayClient.subscribeEvents((event) => applyGatewayEvent(event, set));
    set({ initialized: true });

    let cleanedUp = false;
    return () => {
      if (cleanedUp) return;
      cleanedUp = true;
      dispose();
      set({ initialized: false });
    };
  },
  async connect(url) {
    const endpoint = url ?? get().gateway.endpoint;
    set((state) => ({
      gateway: {
        ...state.gateway,
        endpoint,
        state: 'connecting',
        handshakePhase: 'idle',
        protocolConfidence: 'exploratory',
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
