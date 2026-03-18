import { create } from 'zustand';
import { gatewayClient } from '../services/gateway';
import type { LogEntry, LogLevel } from '../types';

interface LogsStore {
  logs: LogEntry[];
  filters: Record<LogLevel, boolean>;
  diagnostics: string[];
  streamStarted: boolean;
  startStream: () => () => void;
  toggleFilter: (level: LogLevel) => void;
}

export const useLogsStore = create<LogsStore>((set, get) => ({
  logs: [],
  filters: {
    info: true,
    warn: true,
    error: true,
  },
  diagnostics: [
    'Structured logs now include handshake notices, parse failures, fallback activation reasons, and preserved unknown raw gateway events.',
    'No mock logs are injected by default; logs begin empty until the gateway or local diagnostics produce entries.',
    'Protocol uncertainty is carried as explicit diagnostic text instead of being silently normalized away.',
  ],
  streamStarted: false,
  startStream() {
    if (get().streamStarted) return () => undefined;
    const dispose = gatewayClient.subscribeLogs((entry) => {
      set({ logs: [entry, ...get().logs].slice(0, 200) });
    });
    set({ streamStarted: true });
    let cleanedUp = false;
    return () => {
      if (cleanedUp) return;
      cleanedUp = true;
      dispose();
      set({ streamStarted: false });
    };
  },
  toggleFilter(level) {
    set((state) => ({ filters: { ...state.filters, [level]: !state.filters[level] } }));
  },
}));
