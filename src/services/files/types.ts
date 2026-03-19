import type { ChangeItem, Project, ProjectFile } from '../../types';

export interface FileDocument {
  path: string;
  content: string;
  encoding: 'utf-8';
  language: string;
  updatedAt: string;
  size: number;
}

export type FileServiceBridgeKind = 'local-dev-bridge' | 'bridge-unavailable' | 'mock-fallback';

export interface FileServiceBridgeStatus {
  kind: FileServiceBridgeKind;
  label: string;
  detail: string;
}

export interface ListProjectsOptions {
  roots: string[];
}

export interface ProjectTreeRequest {
  projectId: string;
  rootPath: string;
}

export interface FileRequest {
  projectId: string;
  rootPath: string;
  filePath: string;
}

export interface FileSaveRequest extends FileRequest {
  content: string;
}

export interface BuildDiffRequest {
  filePath: string;
  before: string;
  after: string;
}

export interface FileService {
  getStatus: () => FileServiceBridgeStatus;
  initializeRuntime: () => Promise<FileServiceBridgeStatus>;
  listProjects: (options: ListProjectsOptions) => Promise<Project[]>;
  listProjectTree: (request: ProjectTreeRequest) => Promise<ProjectFile[]>;
  openFile: (request: FileRequest) => Promise<FileDocument>;
  saveFile: (request: FileSaveRequest) => Promise<FileDocument>;
  buildDiff: (request: BuildDiffRequest) => ChangeItem | null;
  sendFileToSession: (input: { filePath: string; content: string; sessionId: string }) => Promise<void>;
}
