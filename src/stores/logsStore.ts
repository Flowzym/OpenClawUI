import { create } from 'zustand';
import { mockLogs } from '../data/mockData';
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
  logs: mockLogs,
  filters: {
    info: true,
    warn: true,
    error: true,
  },
  diagnostics: [
    'Windows host is expected to reach 127.0.0.1:18789.',
    'Logs include both real gateway events and locally generated fallback diagnostics.',
    'Protocol parsing failures are surfaced here for operator troubleshooting.',
  ],
  streamStarted: false,
  startStream() {
    if (get().streamStarted) return () => undefined;
    const dispose = gatewayClient.subscribeLogs((entry) => {
      set({ logs: [entry, ...get().logs].slice(0, 200) });
    });
    set({ streamStarted: true });
    return () => {
      dispose();
      set({ streamStarted: false });
    };
  },
  toggleFilter(level) {
    set((state) => ({ filters: { ...state.filters, [level]: !state.filters[level] } }));
  },
}));
