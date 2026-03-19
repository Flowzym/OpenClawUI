import { create } from 'zustand';
import { gatewayClient } from '../services/gateway';
import type { ProtocolTraceEntry } from '../services/gateway/types';
import type { LogEntry, LogLevel } from '../types';

interface LogsStore {
  logs: LogEntry[];
  protocolTrace: ProtocolTraceEntry[];
  filters: Record<LogLevel, boolean>;
  diagnostics: string[];
  streamStarted: boolean;
  startStream: () => () => void;
  toggleFilter: (level: LogLevel) => void;
}

export const useLogsStore = create<LogsStore>((set, get) => ({
  logs: [],
  protocolTrace: gatewayClient.getSnapshot().protocolTrace,
  filters: {
    info: true,
    warn: true,
    error: true,
  },
  diagnostics: [
    'Structured logs now include handshake notices, parse failures, fallback activation reasons, and preserved unknown raw gateway events.',
    'No mock logs are injected by default; logs begin empty until the gateway or local diagnostics produce entries.',
    'Protocol uncertainty is carried as explicit diagnostic text instead of being silently normalized away.',
    'Protocol trace rows classify each inbound payload as verified parse, exploratory parse, unknown/raw, or parse failure.',
  ],
  streamStarted: false,
  startStream() {
    if (get().streamStarted) return () => undefined;
    const dispose = gatewayClient.subscribeLogs((entry) => {
      set({ logs: [entry, ...get().logs].slice(0, 200) });
    });
    const disposeTrace = gatewayClient.subscribeTrace((entry) => {
      set({ protocolTrace: [entry, ...get().protocolTrace].slice(0, 80) });
    });
    set({ streamStarted: true });
    let cleanedUp = false;
    return () => {
      if (cleanedUp) return;
      cleanedUp = true;
      dispose();
      disposeTrace();
      set({ streamStarted: false });
    };
  },
  toggleFilter(level) {
    set((state) => ({ filters: { ...state.filters, [level]: !state.filters[level] } }));
  },
}));
