import { create } from 'zustand';
import { mockSessions } from '../data/mockData';
import { gatewayClient } from '../services/gateway';
import type { GatewayEvent } from '../services/gateway/types';
import type { Message, Session } from '../types';

interface SessionStore {
  sessions: Session[];
  selectedSessionId: string;
  searchTerm: string;
  virtualWindow: { start: number; end: number };
  initialized: boolean;
  isLoading: boolean;
  isUsingFallback: boolean;
  error?: string;
  initialize: () => () => void;
  selectSession: (id: string) => void;
  setSearchTerm: (value: string) => void;
  setVirtualWindow: (start: number, end: number) => void;
  stopSessionRun: (id: string) => Promise<void>;
  appendDraftReply: (sessionId: string, content: string) => void;
  sendMessage: (content: string) => Promise<void>;
  loadSessions: () => Promise<void>;
}

const mergeSession = (sessions: Session[], next: Session) => {
  const existing = sessions.find((session) => session.id === next.id);
  if (!existing) return [next, ...sessions];
  return sessions.map((session) => (session.id === next.id ? next : session));
};

const applyEvent = (event: GatewayEvent, get: () => SessionStore, set: (updater: (state: SessionStore) => Partial<SessionStore>) => void) => {
  switch (event.type) {
    case 'sessions_snapshot':
      set((state) => ({
        sessions: event.sessions,
        selectedSessionId: state.selectedSessionId || event.sessions[0]?.id || '',
        isLoading: false,
        isUsingFallback: event.source === 'mock',
        error: undefined,
      }));
      break;
    case 'session':
      set((state) => ({
        sessions: mergeSession(state.sessions, event.session),
        selectedSessionId: state.selectedSessionId || event.session.id,
        isUsingFallback: event.source === 'mock' ? state.isUsingFallback : false,
      }));
      break;
    case 'message':
      set((state) => ({
        sessions: state.sessions.map((session) => {
          if (session.id !== event.sessionId) return session;
          const existingIndex = session.messages.findIndex((message) => message.id === event.message.id);
          const nextMessages = [...session.messages];
          if (existingIndex >= 0) {
            nextMessages[existingIndex] = event.mode === 'append'
              ? { ...nextMessages[existingIndex], content: `${nextMessages[existingIndex].content}${event.message.content}`, streaming: event.message.streaming }
              : { ...nextMessages[existingIndex], ...event.message };
          } else {
            nextMessages.push(event.message);
          }
          return {
            ...session,
            messages: nextMessages,
            preview: event.message.content || session.preview,
            updatedAt: event.message.timestamp,
            unreadCount:
              get().selectedSessionId === session.id || event.message.role === 'user' ? session.unreadCount : session.unreadCount + 1,
          };
        }),
        isUsingFallback: event.source === 'mock' ? state.isUsingFallback : false,
      }));
      break;
    case 'message_delta':
      set((state) => ({
        sessions: state.sessions.map((session) => {
          if (session.id !== event.sessionId) return session;
          const existingIndex = session.messages.findIndex((message) => message.id === event.messageId);
          const nextMessages = [...session.messages];
          if (existingIndex >= 0) {
            nextMessages[existingIndex] = {
              ...nextMessages[existingIndex],
              content: `${nextMessages[existingIndex].content}${event.delta}`,
              timestamp: event.timestamp,
              streaming: true,
            };
          } else {
            nextMessages.push({
              id: event.messageId,
              role: event.role,
              content: event.delta,
              timestamp: event.timestamp,
              streaming: true,
            });
          }
          return {
            ...session,
            status: 'running',
            messages: nextMessages,
            preview: nextMessages[nextMessages.length - 1]?.content ?? session.preview,
            updatedAt: event.timestamp,
            unreadCount: get().selectedSessionId === session.id ? session.unreadCount : session.unreadCount + 1,
          };
        }),
        isUsingFallback: event.source === 'mock' ? state.isUsingFallback : false,
      }));
      break;
    case 'tool_event':
      set((state) => ({
        sessions: state.sessions.map((session) => {
          if (session.id !== event.sessionId) return session;
          return {
            ...session,
            messages: session.messages.map((message) => {
              if (message.id !== event.messageId) return message;
              const existing = message.toolEvents?.findIndex((tool) => tool.id === event.toolEvent.id) ?? -1;
              const nextTools = [...(message.toolEvents ?? [])];
              if (existing >= 0) {
                nextTools[existing] = event.toolEvent;
              } else {
                nextTools.push(event.toolEvent);
              }
              return { ...message, toolEvents: nextTools };
            }),
            updatedAt: event.toolEvent.timestamp,
          };
        }),
        isUsingFallback: event.source === 'mock' ? state.isUsingFallback : false,
      }));
      break;
    case 'run':
      set((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === event.run?.sessionId
            ? {
                ...session,
                status: event.run.status,
                updatedAt: new Date().toISOString(),
              }
            : session,
        ),
      }));
      break;
    case 'error':
      set(() => ({ error: event.message, isLoading: false }));
      break;
    default:
      break;
  }
};

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: mockSessions,
  selectedSessionId: mockSessions[0]?.id ?? '',
  searchTerm: '',
  virtualWindow: { start: 0, end: 50 },
  initialized: false,
  isLoading: false,
  isUsingFallback: true,
  error: undefined,
  initialize() {
    if (get().initialized) return () => undefined;
    const dispose = gatewayClient.subscribeEvents((event) => applyEvent(event, get, set));
    set({ initialized: true });
    void get().loadSessions();
    return dispose;
  },
  selectSession(id) {
    set((state) => ({
      selectedSessionId: id,
      sessions: state.sessions.map((session) => (session.id === id ? { ...session, unreadCount: 0 } : session)),
    }));
  },
  setSearchTerm: (value) => set({ searchTerm: value }),
  setVirtualWindow: (start, end) => set({ virtualWindow: { start, end } }),
  async stopSessionRun(id) {
    set((state) => ({
      sessions: state.sessions.map((session) => (session.id === id ? { ...session, status: 'stopping' } : session)),
    }));
    await gatewayClient.stopRun({ sessionId: id });
  },
  appendDraftReply(sessionId, content) {
    const timestamp = new Date().toISOString();
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              updatedAt: timestamp,
              preview: content,
              messages: [
                ...session.messages,
                {
                  id: `draft-${Date.now()}`,
                  role: 'user',
                  content,
                  timestamp,
                },
              ],
            }
          : session,
      ),
    }));
  },
  async sendMessage(content) {
    const trimmed = content.trim();
    if (!trimmed) return;

    const sessionId = get().selectedSessionId || get().sessions[0]?.id;
    if (!sessionId) {
      set({ error: 'No session selected for sending a message.' });
      return;
    }

    const timestamp = new Date().toISOString();
    const optimisticMessageId = `local-user-${Date.now()}`;
    set((state) => ({
      error: undefined,
      sessions: state.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              status: 'running',
              updatedAt: timestamp,
              preview: trimmed,
              messages: [
                ...session.messages,
                {
                  id: optimisticMessageId,
                  role: 'user',
                  content: trimmed,
                  timestamp,
                },
                {
                  id: `local-stream-${Date.now()}`,
                  role: 'assistant',
                  content: '',
                  timestamp,
                  streaming: true,
                },
              ],
            }
          : session,
      ),
    }));

    try {
      await gatewayClient.sendMessage({ sessionId, content: trimmed });
    } catch (error) {
      set((state) => ({
        error: error instanceof Error ? error.message : 'Failed to send message to the gateway.',
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                status: 'error',
              }
            : session,
        ),
      }));
    }
  },
  async loadSessions() {
    set({ isLoading: true, error: undefined });
    try {
      const sessions = await gatewayClient.listSessions();
      set((state) => ({
        sessions,
        selectedSessionId: state.selectedSessionId || sessions[0]?.id || '',
        isLoading: false,
        isUsingFallback: gatewayClient.getSnapshot().usingMockFallback,
      }));
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load sessions.',
      });
    }
  },
}));
