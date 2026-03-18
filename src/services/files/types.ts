import type { ChangeItem, Project, ProjectFile } from '../../types';

export interface FileService {
  listProjects: () => Promise<Project[]>;
  readFile: (path: string) => Promise<string>;
  sendFileToSession: (filePath: string, sessionId: string) => Promise<void>;
  openDiff: (filePath: string) => Promise<ChangeItem | null>;
  listProjectTree: (projectId: string) => Promise<ProjectFile[]>;
}
