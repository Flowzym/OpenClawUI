import { create } from 'zustand';
import { mockSessions } from '../data/mockData';
import { gatewayClient } from '../services/gateway';
import type { Session } from '../types';

interface SessionStore {
  sessions: Session[];
  selectedSessionId: string;
  searchTerm: string;
  virtualWindow: { start: number; end: number };
  selectSession: (id: string) => void;
  setSearchTerm: (value: string) => void;
  setVirtualWindow: (start: number, end: number) => void;
  stopSessionRun: (id: string) => Promise<void>;
  appendDraftReply: (sessionId: string, content: string) => void;
  loadSessions: () => Promise<void>;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: mockSessions,
  selectedSessionId: mockSessions[1]?.id ?? '',
  searchTerm: '',
  virtualWindow: { start: 0, end: 50 },
  selectSession: (id) => set({ selectedSessionId: id }),
  setSearchTerm: (value) => set({ searchTerm: value }),
  setVirtualWindow: (start, end) => set({ virtualWindow: { start, end } }),
  async stopSessionRun(id) {
    await gatewayClient.stopRun(id);
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === id ? { ...session, status: 'idle' } : session,
      ),
    }));
  },
  appendDraftReply(sessionId, content) {
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              updatedAt: new Date().toISOString(),
              messages: [
                ...session.messages,
                {
                  id: `draft-${Date.now()}`,
                  role: 'user',
                  content,
                  timestamp: new Date().toISOString(),
                },
              ],
            }
          : session,
      ),
    }));
  },
  async loadSessions() {
    const sessions = await gatewayClient.listSessions();
    set({ sessions, selectedSessionId: sessions[0]?.id ?? '' });
  },
}));
