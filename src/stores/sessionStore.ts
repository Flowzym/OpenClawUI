import { create } from 'zustand';
import { gatewayClient } from '../services/gateway';
import type { GatewayEvent } from '../services/gateway/types';
import type { Session } from '../types';

interface PendingMessageCorrelation {
  clientRequestId: string;
  clientMessageId: string;
  userMessageId: string;
  assistantPlaceholderId: string;
  gatewayMessageId?: string;
  content: string;
  createdAt: string;
  userResolved: boolean;
  assistantResolved: boolean;
}

interface SessionStore {
  sessions: Session[];
  selectedSessionId: string;
  searchTerm: string;
  virtualWindow: { start: number; end: number };
  initialized: boolean;
  isLoading: boolean;
  dataSource: 'gateway' | 'fallback' | 'none';
  protocolConfidence: 'verified' | 'exploratory';
  error?: string;
  pendingCorrelations: Record<string, PendingMessageCorrelation[]>;
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

const updatePending = (
  pending: Record<string, PendingMessageCorrelation[]>,
  sessionId: string,
  predicate: (item: PendingMessageCorrelation) => boolean,
  updater: (item: PendingMessageCorrelation) => PendingMessageCorrelation,
) => {
  const queue = pending[sessionId] ?? [];
  const nextQueue = queue
    .map((item) => (predicate(item) ? updater(item) : item))
    .filter((item) => !(item.userResolved && item.assistantResolved));

  return {
    ...pending,
    [sessionId]: nextQueue,
  };
};

const resolvePending = (
  pending: Record<string, PendingMessageCorrelation[]>,
  sessionId: string,
  correlation: PendingMessageCorrelation,
  resolution: Partial<Pick<PendingMessageCorrelation, 'userResolved' | 'assistantResolved' | 'gatewayMessageId'>>,
) =>
  updatePending(
    pending,
    sessionId,
    (item) => item.clientRequestId === correlation.clientRequestId,
    (item) => ({ ...item, ...resolution }),
  );

interface PendingLookup {
  correlationId?: string;
  clientRequestId?: string;
  clientMessageId?: string;
  gatewayMessageId?: string;
}

const findBestPendingMatch = (
  pending: Record<string, PendingMessageCorrelation[]>,
  sessionId: string,
  lookup: PendingLookup,
) => {
  const queue = pending[sessionId] ?? [];
  if (queue.length === 0) return undefined;

  const strategies: Array<(item: PendingMessageCorrelation) => boolean> = [
    (item) => Boolean(lookup.correlationId && item.clientRequestId === lookup.correlationId),
    (item) => Boolean(lookup.clientRequestId && item.clientRequestId === lookup.clientRequestId),
    (item) => Boolean(lookup.clientMessageId && item.clientMessageId === lookup.clientMessageId),
    (item) => Boolean(lookup.gatewayMessageId && item.gatewayMessageId === lookup.gatewayMessageId),
  ];

  return strategies
    .map((strategy) => queue.find(strategy))
    .find((item): item is PendingMessageCorrelation => Boolean(item));
};

const reconcileIncomingMessage = (
  session: Session,
  event: Extract<GatewayEvent, { type: 'message' }>,
  pending: PendingMessageCorrelation | undefined,
) => {
  const nextMessages = [...session.messages];

  if (event.message.role === 'user' && pending) {
    const optimisticIndex = nextMessages.findIndex((message) => message.id === pending.userMessageId);
    if (optimisticIndex >= 0 && nextMessages[optimisticIndex].content === pending.content) {
      nextMessages[optimisticIndex] = { ...event.message };
      return { nextMessages, resolvedUser: true, resolvedAssistant: false };
    }
  }

  if (event.message.role === 'assistant' && pending) {
    const placeholderIndex = nextMessages.findIndex((message) => message.id === pending.assistantPlaceholderId);
    if (placeholderIndex >= 0) {
      nextMessages[placeholderIndex] = {
        ...nextMessages[placeholderIndex],
        ...event.message,
        content: event.message.content || nextMessages[placeholderIndex].content,
      };
      return { nextMessages, resolvedUser: false, resolvedAssistant: true };
    }
  }

  const existingIndex = nextMessages.findIndex((message) => message.id === event.message.id);
  if (existingIndex >= 0) {
    nextMessages[existingIndex] = event.mode === 'append'
      ? { ...nextMessages[existingIndex], content: `${nextMessages[existingIndex].content}${event.message.content}`, streaming: event.message.streaming }
      : { ...nextMessages[existingIndex], ...event.message };
  } else {
    nextMessages.push(event.message);
  }

  return { nextMessages, resolvedUser: false, resolvedAssistant: false };
};

const applyEvent = (event: GatewayEvent, get: () => SessionStore, set: (updater: (state: SessionStore) => Partial<SessionStore>) => void) => {
  switch (event.type) {
    case 'sessions_snapshot':
      set((state) => {
        const selectedSessionId =
          event.sessions.find((session) => session.id === state.selectedSessionId)?.id ?? event.sessions[0]?.id ?? '';

        return {
          sessions: event.sessions,
          selectedSessionId,
          isLoading: false,
          dataSource: event.source,
          protocolConfidence: event.confidence ?? state.protocolConfidence,
          error: undefined,
          pendingCorrelations: event.source === 'none' ? {} : state.pendingCorrelations,
        };
      });
      break;
    case 'session':
      set((state) => ({
        sessions: mergeSession(state.sessions, event.session),
        selectedSessionId: state.selectedSessionId || event.session.id,
        dataSource: event.source === 'fallback' ? state.dataSource : event.source,
        protocolConfidence: event.confidence ?? state.protocolConfidence,
      }));
      break;
    case 'message':
      set((state) => {
        const pending = findBestPendingMatch(state.pendingCorrelations, event.sessionId, {
          correlationId: event.correlationId,
          clientRequestId: event.clientRequestId,
          clientMessageId: event.clientMessageId,
          gatewayMessageId: event.message.id,
        });
        let resolvedUser = false;
        let resolvedAssistant = false;

        const sessions = state.sessions.map((session) => {
          if (session.id !== event.sessionId) return session;
          const reconciled = reconcileIncomingMessage(session, event, pending);
          resolvedUser = reconciled.resolvedUser;
          resolvedAssistant = reconciled.resolvedAssistant;
          return {
            ...session,
            messages: reconciled.nextMessages,
            preview: event.message.content || session.preview,
            updatedAt: event.message.timestamp,
            unreadCount:
              get().selectedSessionId === session.id || event.message.role === 'user' ? session.unreadCount : session.unreadCount + 1,
          };
        });

        const nextPending = pending
          ? resolvePending(state.pendingCorrelations, event.sessionId, pending, {
              userResolved: pending.userResolved || resolvedUser,
              assistantResolved: pending.assistantResolved || resolvedAssistant,
              gatewayMessageId: event.message.role === 'assistant' ? event.message.id : pending.gatewayMessageId,
            })
          : state.pendingCorrelations;

        return {
          sessions,
          pendingCorrelations: nextPending,
          dataSource: event.source,
          protocolConfidence: event.confidence ?? state.protocolConfidence,
        };
      });
      break;
    case 'message_delta':
      set((state) => {
        const pending = findBestPendingMatch(state.pendingCorrelations, event.sessionId, {
          correlationId: event.correlationId,
          clientRequestId: event.clientRequestId,
          clientMessageId: event.clientMessageId,
          gatewayMessageId: event.messageId,
        });
        let didResolvePlaceholder = false;
        const sessions = state.sessions.map((session) => {
          if (session.id !== event.sessionId) return session;
          const nextMessages = [...session.messages];
          const existingIndex = nextMessages.findIndex((message) => message.id === event.messageId);
          const placeholderIndex = pending ? nextMessages.findIndex((message) => message.id === pending.assistantPlaceholderId) : -1;

          if (existingIndex >= 0) {
            nextMessages[existingIndex] = {
              ...nextMessages[existingIndex],
              content: `${nextMessages[existingIndex].content}${event.delta}`,
              timestamp: event.timestamp,
              streaming: true,
            };
          } else if (placeholderIndex >= 0) {
            nextMessages[placeholderIndex] = {
              ...nextMessages[placeholderIndex],
              id: event.messageId,
              role: event.role,
              content: `${nextMessages[placeholderIndex].content}${event.delta}`,
              timestamp: event.timestamp,
              streaming: true,
            };
            didResolvePlaceholder = true;
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
            status: 'running' as const,
            messages: nextMessages,
            preview: nextMessages[nextMessages.length - 1]?.content ?? session.preview,
            updatedAt: event.timestamp,
            unreadCount: get().selectedSessionId === session.id ? session.unreadCount : session.unreadCount + 1,
          };
        });

        return {
          sessions,
          pendingCorrelations: pending
            ? resolvePending(state.pendingCorrelations, event.sessionId, pending, {
                assistantResolved: pending.assistantResolved || didResolvePlaceholder,
                gatewayMessageId: event.messageId,
              })
            : state.pendingCorrelations,
          dataSource: event.source,
          protocolConfidence: event.confidence ?? state.protocolConfidence,
        };
      });
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
        dataSource: event.source,
        protocolConfidence: event.confidence ?? state.protocolConfidence,
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
  sessions: [],
  selectedSessionId: '',
  searchTerm: '',
  virtualWindow: { start: 0, end: 50 },
  initialized: false,
  isLoading: false,
  dataSource: 'none',
  protocolConfidence: 'exploratory',
  error: undefined,
  pendingCorrelations: {},
  initialize() {
    if (get().initialized) return () => undefined;
    const dispose = gatewayClient.subscribeEvents((event) => applyEvent(event, get, set));
    set({ initialized: true });
    void get().loadSessions();

    let cleanedUp = false;
    return () => {
      if (cleanedUp) return;
      cleanedUp = true;
      dispose();
      set({ initialized: false });
    };
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
    const userMessageId = `local-user-${Date.now()}`;
    const assistantPlaceholderId = `local-assistant-${Date.now()}`;
    const clientRequestId = `local-request-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const clientMessageId = userMessageId;

    set((state) => ({
      error: undefined,
      pendingCorrelations: {
        ...state.pendingCorrelations,
        [sessionId]: [
          ...(state.pendingCorrelations[sessionId] ?? []),
          {
            clientRequestId,
            clientMessageId,
            userMessageId,
            assistantPlaceholderId,
            content: trimmed,
            createdAt: timestamp,
            userResolved: false,
            assistantResolved: false,
          },
        ],
      },
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
                  id: userMessageId,
                  role: 'user',
                  content: trimmed,
                  timestamp,
                },
                {
                  id: assistantPlaceholderId,
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
      await gatewayClient.sendMessage({
        sessionId,
        content: trimmed,
        clientRequestId,
        clientMessageId,
        assistantPlaceholderId,
      });
    } catch (error) {
      set((state) => ({
        error: error instanceof Error ? error.message : 'Failed to send message to the gateway.',
        pendingCorrelations: updatePending(
          state.pendingCorrelations,
          sessionId,
          (item) => item.clientRequestId === clientRequestId,
          (item) => ({ ...item, userResolved: true, assistantResolved: true }),
        ),
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                status: 'error',
                messages: session.messages.map((message) =>
                  message.id === assistantPlaceholderId ? { ...message, streaming: false, content: 'Send failed before gateway acknowledgement.' } : message,
                ),
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
      const snapshot = gatewayClient.getSnapshot();
      set((state) => ({
        sessions,
        selectedSessionId: state.selectedSessionId || sessions[0]?.id || '',
        isLoading: false,
        dataSource: snapshot.dataSource,
        protocolConfidence: snapshot.protocolConfidence,
      }));
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load sessions.',
      });
    }
  },
}));
