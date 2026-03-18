export type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error';
export type RunStatus = 'idle' | 'running' | 'stopping' | 'error';
export type LogLevel = 'info' | 'warn' | 'error';

export interface GatewayStatus {
  state: ConnectionState;
  latencyMs: number;
  endpoint: string;
  lastHeartbeat: string;
  diagnostics: string[];
}

export interface RunInfo {
  id: string;
  label: string;
  agent: string;
  model: string;
  status: RunStatus;
  startedAt: string;
  sessionId?: string;
}

export interface ToolEvent {
  id: string;
  title: string;
  status: 'running' | 'complete' | 'error';
  output: string;
  timestamp: string;
  collapsible?: boolean;
}

export interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
  streaming?: boolean;
  toolEvents?: ToolEvent[];
}

export interface SessionMetadata {
  agent: string;
  model: string;
  mode: string;
  cwd: string;
  branch: string;
}

export interface Session {
  id: string;
  title: string;
  projectId: string;
  status: RunStatus;
  updatedAt: string;
  preview: string;
  unreadCount: number;
  metadata: SessionMetadata;
  messages: Message[];
}

export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  language?: string;
  children?: ProjectFile[];
  content?: string;
}

export interface FileTab {
  id: string;
  path: string;
  title: string;
}

export interface Project {
  id: string;
  name: string;
  rootPath: string;
  branch: string;
  status: 'ready' | 'syncing' | 'error';
  files: ProjectFile[];
  openTabs: FileTab[];
  activeFilePath: string;
}

export interface DiffChunk {
  id: string;
  header: string;
  lines: string[];
}

export interface ChangeItem {
  id: string;
  filePath: string;
  status: 'modified' | 'added' | 'deleted';
  summary: string;
  chunks: DiffChunk[];
}

export interface LogEntry {
  id: string;
  level: LogLevel;
  source: string;
  message: string;
  timestamp: string;
}

export interface AppSettings {
  gatewayUrl: string;
  theme: 'dark' | 'system';
  projectRoots: string[];
  advanced: {
    reconnect: boolean;
    telemetry: boolean;
  };
}
