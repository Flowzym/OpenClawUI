import { mockChanges, mockProjects } from '../../data/mockData';
import type { FileService } from './types';

const flattenFiles = (items: typeof mockProjects[number]['files']): Record<string, string> => {
  return items.reduce<Record<string, string>>((acc, item) => {
    if (item.type === 'file' && item.content) {
      acc[item.path] = item.content;
    }
    if (item.children) {
      Object.assign(acc, flattenFiles(item.children));
    }
    return acc;
  }, {});
};

const fileMap = mockProjects.reduce<Record<string, string>>((acc, project) => {
  Object.assign(acc, flattenFiles(project.files));
  return acc;
}, {});

export const mockFileService: FileService = {
  async listProjects() {
    // TODO: Replace mock project discovery with Windows/WSL-aware workspace enumeration.
    return mockProjects;
  },
  async readFile(path) {
    // TODO: Replace mock file reads with a real bridge to the OpenClaw file service.
    return fileMap[path] ?? '// File content unavailable in mock service';
  },
  async sendFileToSession() {
    // TODO: Replace mock send action with gateway/file-service integration.
  },
  async openDiff(filePath) {
    // TODO: Replace mock diff lookup with real patch/diff generation.
    return mockChanges.find((change) => change.filePath === filePath) ?? null;
  },
  async listProjectTree(projectId) {
    // TODO: Replace mock tree listing with real project file indexing.
    return mockProjects.find((project) => project.id === projectId)?.files ?? [];
  },
};
