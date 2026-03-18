import { create } from 'zustand';
import { mockLogs } from '../data/mockData';
import { gatewayClient } from '../services/gateway';
import type { LogEntry, LogLevel } from '../types';

interface LogsStore {
  logs: LogEntry[];
  filters: Record<LogLevel, boolean>;
  diagnostics: string[];
  startStream: () => () => void;
  toggleFilter: (level: LogLevel) => void;
}

export const useLogsStore = create<LogsStore>((set, get) => ({
  logs: mockLogs,
  filters: {
    info: true,
    warn: true,
    error: true,
  },
  diagnostics: [
    'Windows host can reach 127.0.0.1:18789',
    'WSL2 DNS relay healthy',
    'Mock transport currently simulates push logs every 8s',
  ],
  startStream() {
    return gatewayClient.subscribeLogs((entry) => {
      set({ logs: [entry, ...get().logs].slice(0, 200) });
    });
  },
  toggleFilter(level) {
    set((state) => ({ filters: { ...state.filters, [level]: !state.filters[level] } }));
  },
}));
