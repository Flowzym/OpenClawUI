import { mockProjects } from '../../data/mockData';
import type { Project, ProjectFile } from '../../types';
import { buildChangeItem } from './diff';
import type { FileDocument, FileService } from './types';

const flattenFiles = (items: ProjectFile[], acc: Record<string, string> = {}) => {
  items.forEach((item) => {
    if (item.type === 'file') {
      acc[item.path] = item.content ?? '';
    }
    if (item.children) {
      flattenFiles(item.children, acc);
    }
  });

  return acc;
};

const cloneProjects = (): Project[] => mockProjects.map((project) => ({
  ...project,
  files: structuredClone(project.files),
  openTabs: [...project.openTabs],
}));

const mockProjectMap = cloneProjects();
const fileMap = mockProjectMap.reduce<Record<string, string>>((acc, project) => {
  Object.assign(acc, flattenFiles(project.files));
  return acc;
}, {});

const resolveMockDocument = (filePath: string): FileDocument => ({
  path: filePath,
  content: fileMap[filePath] ?? '// File content unavailable in mock fallback service',
  encoding: 'utf-8',
  language: filePath.split('.').pop() ?? 'text',
  updatedAt: new Date().toISOString(),
  size: (fileMap[filePath] ?? '').length,
});

export const mockFileService: FileService = {
  getStatus() {
    return {
      kind: 'mock-fallback',
      reason: 'Local file bridge unavailable; using in-memory mock data.',
    };
  },
  async listProjects() {
    return cloneProjects();
  },
  async listProjectTree({ projectId }) {
    return cloneProjects().find((project) => project.id === projectId)?.files ?? [];
  },
  async openFile({ filePath }) {
    return resolveMockDocument(filePath);
  },
  async saveFile({ filePath, content }) {
    fileMap[filePath] = content;
    return resolveMockDocument(filePath);
  },
  buildDiff(request) {
    return buildChangeItem(request);
  },
  async sendFileToSession() {
    // Intentionally no-op in explicit mock fallback mode.
  },
};
