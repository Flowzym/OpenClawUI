import type { AppSettings, ChangeItem, GatewayStatus, LogEntry, Project, RunInfo, Session } from '../types';

export const mockGatewayStatus: GatewayStatus = {
  state: 'connected',
  latencyMs: 24,
  endpoint: 'ws://127.0.0.1:18789',
  lastHeartbeat: '2026-03-18T10:42:00Z',
  diagnostics: [
    'Gateway reachable from Windows host',
    'WSL2 bridge active',
    'Last reconnect 14 minutes ago',
  ],
};

export const mockCurrentRun: RunInfo = {
  id: 'run-91',
  label: 'Refactor session list virtualization placeholder',
  agent: 'openclaw-operator',
  model: 'gpt-5.2-codex',
  status: 'running',
  startedAt: '2026-03-18T10:36:00Z',
  sessionId: 'sess-1002',
};

export const mockSessions: Session[] = [
  {
    id: 'sess-1001',
    title: 'Stabilize gateway reconnect flow',
    projectId: 'proj-ui',
    status: 'idle',
    updatedAt: '2026-03-18T09:58:00Z',
    preview: 'Mapped current connection edge cases and documented expected retry states.',
    unreadCount: 0,
    metadata: {
      agent: 'openclaw-operator',
      model: 'gpt-5.2-codex',
      mode: 'analysis',
      cwd: 'C:/OpenClawUI',
      branch: 'work',
    },
    messages: [
      {
        id: 'm-1',
        role: 'system',
        content: 'Session initialized for gateway diagnostics.',
        timestamp: '2026-03-18T09:10:00Z',
      },
      {
        id: 'm-2',
        role: 'assistant',
        content: 'I reviewed reconnect flows and found two race conditions around shutdown.',
        timestamp: '2026-03-18T09:11:00Z',
        toolEvents: [
          {
            id: 'tool-1',
            title: 'Gateway probe',
            status: 'complete',
            timestamp: '2026-03-18T09:11:20Z',
            output: 'Probe completed. Reconnect timer reset correctly after manual abort.',
            collapsible: true,
          },
        ],
      },
    ],
  },
  {
    id: 'sess-1002',
    title: 'Operator UI MVP scaffold',
    projectId: 'proj-ui',
    status: 'running',
    updatedAt: '2026-03-18T10:42:00Z',
    preview: 'Building a Windows-first replacement UI with modular stores and services.',
    unreadCount: 2,
    metadata: {
      agent: 'openclaw-operator',
      model: 'gpt-5.2-codex',
      mode: 'workspace',
      cwd: 'C:/OpenClawUI',
      branch: 'work',
    },
    messages: [
      {
        id: 'm-3',
        role: 'user',
        content: 'Build an MVP operator console with sessions, projects, changes, logs, and settings.',
        timestamp: '2026-03-18T10:00:00Z',
      },
      {
        id: 'm-4',
        role: 'assistant',
        content: 'Scaffolding app shell, stores, services, and mock-first components now.',
        timestamp: '2026-03-18T10:02:00Z',
        streaming: true,
        toolEvents: [
          {
            id: 'tool-2',
            title: 'Create routes',
            status: 'complete',
            timestamp: '2026-03-18T10:08:00Z',
            output: 'Home, Sessions, Projects, Changes, Logs, and Settings routes added.',
            collapsible: true,
          },
          {
            id: 'tool-3',
            title: 'Wire stores',
            status: 'running',
            timestamp: '2026-03-18T10:12:00Z',
            output: 'Mock actions update connection, session, project, change, log, and settings slices.',
            collapsible: true,
          },
        ],
      },
    ],
  },
  {
    id: 'sess-1003',
    title: 'Patch review workflow',
    projectId: 'proj-api',
    status: 'error',
    updatedAt: '2026-03-17T18:21:00Z',
    preview: 'Diff acceptance rules need clearer ownership between UI and gateway.',
    unreadCount: 1,
    metadata: {
      agent: 'openclaw-reviewer',
      model: 'gpt-4.1',
      mode: 'review',
      cwd: 'C:/OpenClawApi',
      branch: 'feature/patch-flow',
    },
    messages: [
      {
        id: 'm-5',
        role: 'assistant',
        content: 'The patch apply step failed because the gateway response shape was incomplete.',
        timestamp: '2026-03-17T18:18:00Z',
      },
    ],
  },
];

export const mockProjects: Project[] = [
  {
    id: 'proj-ui',
    name: 'OpenClawUI',
    rootPath: 'C:/repos/OpenClawUI',
    branch: 'work',
    status: 'ready',
    activeFilePath: 'src/pages/SessionsPage.tsx',
    openTabs: [
      { id: 'tab-1', path: 'src/pages/SessionsPage.tsx', title: 'SessionsPage.tsx' },
      { id: 'tab-2', path: 'src/stores/sessionStore.ts', title: 'sessionStore.ts' },
    ],
    files: [
      {
        id: 'root-src',
        name: 'src',
        path: 'src',
        type: 'folder',
        children: [
          {
            id: 'pages',
            name: 'pages',
            path: 'src/pages',
            type: 'folder',
            children: [
              {
                id: 'sessions-page',
                name: 'SessionsPage.tsx',
                path: 'src/pages/SessionsPage.tsx',
                type: 'file',
                language: 'tsx',
                content: 'export function SessionsPage() {\n  return <div>Sessions</div>;\n}',
              },
            ],
          },
          {
            id: 'stores',
            name: 'stores',
            path: 'src/stores',
            type: 'folder',
            children: [
              {
                id: 'session-store',
                name: 'sessionStore.ts',
                path: 'src/stores/sessionStore.ts',
                type: 'file',
                language: 'ts',
                content: 'export const useSessionStore = () => null; // mock placeholder',
              },
            ],
          },
        ],
      },
      {
        id: 'readme',
        name: 'README.md',
        path: 'README.md',
        type: 'file',
        language: 'md',
        content: '# OpenClaw Operator UI\n',
      },
    ],
  },
  {
    id: 'proj-api',
    name: 'OpenClawGateway',
    rootPath: 'C:/repos/OpenClawGateway',
    branch: 'main',
    status: 'syncing',
    activeFilePath: 'gateway/server.py',
    openTabs: [{ id: 'tab-3', path: 'gateway/server.py', title: 'server.py' }],
    files: [
      {
        id: 'gateway-root',
        name: 'gateway',
        path: 'gateway',
        type: 'folder',
        children: [
          {
            id: 'server-file',
            name: 'server.py',
            path: 'gateway/server.py',
            type: 'file',
            language: 'python',
            content: 'def serve():\n    pass\n',
          },
        ],
      },
    ],
  },
];

export const mockChanges: ChangeItem[] = [
  {
    id: 'chg-1',
    filePath: 'src/pages/SessionsPage.tsx',
    status: 'modified',
    dirty: true,
    summary: 'Adds 3-column operator layout with session inspector and run toolbar.',
    stats: {
      chunkCount: 1,
      lineCount: 6,
      addedLines: 5,
      removedLines: 1,
    },
    chunks: [
      {
        id: 'chunk-1',
        header: '@@ -1,4 +1,22 @@',
        lines: [
          '- return <div>Sessions</div>;',
          '+ return (',
          '+   <div className="grid grid-cols-[280px_minmax(0,1fr)_320px] gap-4">',
          '+     {/* operator workspace */}',
          '+   </div>',
          '+ );',
        ],
        lineCount: 6,
        addedLines: 5,
        removedLines: 1,
      },
    ],
  },
  {
    id: 'chg-2',
    filePath: 'src/stores/sessionStore.ts',
    status: 'added',
    dirty: true,
    summary: 'Introduces mock streaming controls and session selection state.',
    stats: {
      chunkCount: 1,
      lineCount: 1,
      addedLines: 1,
      removedLines: 0,
    },
    chunks: [
      {
        id: 'chunk-2',
        header: '@@ +1,18 @@',
        lines: ['+ export const useSessionStore = create(...)'],
        lineCount: 1,
        addedLines: 1,
        removedLines: 0,
      },
    ],
  },
];

export const mockLogs: LogEntry[] = [
  {
    id: 'log-1',
    level: 'info',
    source: 'gateway',
    message: 'Connected to ws://127.0.0.1:18789',
    timestamp: '2026-03-18T10:40:00Z',
  },
  {
    id: 'log-2',
    level: 'warn',
    source: 'workspace',
    message: 'Project root C:/repos/OpenClawGateway is syncing.',
    timestamp: '2026-03-18T10:41:00Z',
  },
  {
    id: 'log-3',
    level: 'error',
    source: 'changes',
    message: 'Patch accept action is mocked and not yet wired to gateway.',
    timestamp: '2026-03-18T10:42:00Z',
  },
];

export const mockSettings: AppSettings = {
  gatewayUrl: 'ws://127.0.0.1:18789',
  theme: 'dark',
  projectRoots: ['C:/repos/OpenClawUI', 'C:/repos/OpenClawGateway'],
  advanced: {
    reconnect: true,
    telemetry: false,
    protocolVerification: false,
  },
};
