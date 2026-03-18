import { create } from 'zustand';
import { mockProjects } from '../data/mockData';
import { fileService } from '../services/files';
import type { Project } from '../types';

interface ProjectsStore {
  projects: Project[];
  selectedProjectId: string;
  selectedFilePath: string;
  fileInspectorOpen: boolean;
  selectProject: (projectId: string) => void;
  selectFile: (filePath: string) => void;
  toggleInspector: () => void;
  loadProjects: () => Promise<void>;
  sendFileToSession: (filePath: string, sessionId: string) => Promise<void>;
}

export const useProjectsStore = create<ProjectsStore>((set, get) => ({
  projects: mockProjects,
  selectedProjectId: mockProjects[0]?.id ?? '',
  selectedFilePath: mockProjects[0]?.activeFilePath ?? '',
  fileInspectorOpen: true,
  selectProject(projectId) {
    const project = get().projects.find((item) => item.id === projectId);
    set({
      selectedProjectId: projectId,
      selectedFilePath: project?.activeFilePath ?? '',
    });
  },
  selectFile(filePath) {
    set({ selectedFilePath: filePath });
  },
  toggleInspector() {
    set((state) => ({ fileInspectorOpen: !state.fileInspectorOpen }));
  },
  async loadProjects() {
    const projects = await fileService.listProjects();
    set({
      projects,
      selectedProjectId: projects[0]?.id ?? '',
      selectedFilePath: projects[0]?.activeFilePath ?? '',
    });
  },
  async sendFileToSession(filePath, sessionId) {
    await fileService.sendFileToSession(filePath, sessionId);
  },
}));
