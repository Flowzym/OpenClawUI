import { create } from 'zustand';
import { gatewayClient } from '../services/gateway';
import type { GatewayStatus, RunInfo } from '../types';
import { mockCurrentRun, mockGatewayStatus } from '../data/mockData';

interface ConnectionStore {
  gateway: GatewayStatus;
  currentRun: RunInfo | null;
  activeAgent: string;
  activeModel: string;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshRun: () => Promise<void>;
  stopRun: () => Promise<void>;
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  gateway: mockGatewayStatus,
  currentRun: mockCurrentRun,
  activeAgent: mockCurrentRun.agent,
  activeModel: mockCurrentRun.model,
  async connect() {
    set((state) => ({ gateway: { ...state.gateway, state: 'connecting' } }));
    const state = await gatewayClient.connect(get().gateway.endpoint);
    set((current) => ({ gateway: { ...current.gateway, state, lastHeartbeat: new Date().toISOString() } }));
  },
  async disconnect() {
    await gatewayClient.disconnect();
    set((state) => ({ gateway: { ...state.gateway, state: 'disconnected' } }));
  },
  async refreshRun() {
    const run = await gatewayClient.getCurrentRun();
    set({ currentRun: run, activeAgent: run?.agent ?? 'none', activeModel: run?.model ?? 'none' });
  },
  async stopRun() {
    const runId = get().currentRun?.id;
    set((state) => ({
      currentRun: state.currentRun ? { ...state.currentRun, status: 'stopping' } : state.currentRun,
    }));
    await gatewayClient.stopRun(runId);
    set((state) => ({
      currentRun: state.currentRun ? { ...state.currentRun, status: 'idle' } : state.currentRun,
    }));
  },
}));
