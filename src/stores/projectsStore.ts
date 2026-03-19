import { create } from 'zustand';
import { fileService } from '../services/files';
import type { FileServiceBridgeStatus } from '../services/files/types';
import { useSessionStore } from './sessionStore';
import { normalizeProjectRoots, useSettingsStore } from './settingsStore';
import type { ChangeItem, Project, ProjectFile } from '../types';

interface OpenProjectFile {
  projectId: string;
  projectName: string;
  rootPath: string;
  filePath: string;
  content: string;
  savedContent: string;
  language: string;
  updatedAt: string;
  size: number;
  dirty: boolean;
  isLoading: boolean;
  error?: string;
}

interface ProjectsStore {
  projects: Project[];
  selectedProjectId: string;
  selectedFilePath: string;
  fileInspectorOpen: boolean;
  loadingProjects: boolean;
  loadingTree: boolean;
  bridgeStatus: FileServiceBridgeStatus;
  projectError?: string;
  projectsInitialized: boolean;
  initializedRootsKey: string;
  projectTrees: Record<string, ProjectFile[]>;
  openFiles: Record<string, OpenProjectFile>;
  changes: ChangeItem[];
  initializeProjects: () => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  selectFile: (filePath: string) => Promise<void>;
  toggleInspector: () => void;
  loadProjects: () => Promise<void>;
  loadProjectTree: (projectId: string) => Promise<void>;
  updateActiveFileContent: (content: string) => void;
  saveSelectedFile: () => Promise<void>;
  saveFile: (filePath: string, projectId?: string) => Promise<void>;
  resetFile: (filePath: string, projectId?: string) => void;
  saveDirtyFiles: () => Promise<void>;
  resetDirtyFiles: () => void;
  sendFileToSession: (filePath: string, sessionId: string) => Promise<void>;
  getOpenFile: (projectId: string, filePath: string) => OpenProjectFile | undefined;
}

const getOpenFileKey = (projectId: string, filePath: string) => `${projectId}:${filePath}`;
const rootsKeyFor = (roots: string[]) => normalizeProjectRoots(roots).join('||');

const updateProject = (projects: Project[], projectId: string, updater: (project: Project) => Project) =>
  projects.map((project) => (project.id === projectId ? updater(project) : project));

const firstFilePath = (files: ProjectFile[]): string => {
  const queue = [...files];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current.type === 'file') return current.path;
    if (current.children) queue.unshift(...current.children);
  }
  return '';
};

const syncChanges = (openFiles: Record<string, OpenProjectFile>): ChangeItem[] =>
  Object.values(openFiles).reduce<ChangeItem[]>((changes, file) => {
    const change = fileService.buildDiff({ filePath: file.filePath, before: file.savedContent, after: file.content });
    if (!change) return changes;

    changes.push({
      ...change,
      id: `${file.projectId}:${file.filePath}`,
      projectId: file.projectId,
      projectName: file.projectName,
      rootPath: file.rootPath,
      dirty: file.dirty,
    });
    return changes;
  }, []);

const findOpenFileTarget = (
  state: Pick<ProjectsStore, 'openFiles' | 'selectedProjectId'>,
  filePath: string,
  projectId?: string,
) => {
  const resolvedProjectId = projectId ?? state.selectedProjectId;
  if (!resolvedProjectId) return undefined;

  const fileKey = getOpenFileKey(resolvedProjectId, filePath);
  const file = state.openFiles[fileKey];
  if (!file) return undefined;

  return {
    fileKey,
    file,
    projectId: resolvedProjectId,
  };
};

const ensureTab = (project: Project, filePath: string) => {
  const existing = project.openTabs.find((tab) => tab.path === filePath);
  if (existing) {
    return {
      ...project,
      activeFilePath: filePath,
    };
  }

  return {
    ...project,
    activeFilePath: filePath,
    openTabs: [
      ...project.openTabs,
      {
        id: `${project.id}:${filePath}`,
        path: filePath,
        title: filePath.split('/').pop() ?? filePath,
      },
    ],
  };
};

export const useProjectsStore = create<ProjectsStore>((set, get) => ({
  projects: [],
  selectedProjectId: '',
  selectedFilePath: '',
  fileInspectorOpen: true,
  loadingProjects: false,
  loadingTree: false,
  bridgeStatus: fileService.getStatus(),
  projectsInitialized: false,
  initializedRootsKey: '',
  projectTrees: {},
  openFiles: {},
  changes: [],
  async initializeProjects() {
    const roots = useSettingsStore.getState().settings.projectRoots;
    const nextRootsKey = rootsKeyFor(roots);
    const state = get();
    if (state.loadingProjects) return;
    if (state.projectsInitialized && state.initializedRootsKey === nextRootsKey) return;
    await get().loadProjects();
  },
  async selectProject(projectId) {
    set({ selectedProjectId: projectId, projectError: undefined });
    await get().loadProjectTree(projectId);

    const project = get().projects.find((item) => item.id === projectId);
    const nextFilePath = project?.activeFilePath || firstFilePath(get().projectTrees[projectId] ?? []);
    set({ selectedFilePath: nextFilePath });
    if (nextFilePath) {
      await get().selectFile(nextFilePath);
    }
  },
  async selectFile(filePath) {
    const project = get().projects.find((item) => item.id === get().selectedProjectId);
    if (!project) return;

    set((state) => ({
      selectedFilePath: filePath,
      projects: updateProject(state.projects, project.id, (current) => ensureTab(current, filePath)),
    }));

    const fileKey = getOpenFileKey(project.id, filePath);
    if (get().openFiles[fileKey] && !get().openFiles[fileKey].error) {
      return;
    }

    set((state) => ({
      openFiles: {
        ...state.openFiles,
        [fileKey]: {
          projectId: project.id,
          projectName: project.name,
          rootPath: project.rootPath,
          filePath,
          content: '',
          savedContent: '',
          language: filePath.split('.').pop() ?? 'text',
          updatedAt: new Date(0).toISOString(),
          size: 0,
          dirty: false,
          isLoading: true,
        },
      },
    }));

    try {
      const file = await fileService.openFile({ projectId: project.id, rootPath: project.rootPath, filePath });
      set((state) => {
        const nextOpenFiles = {
          ...state.openFiles,
          [fileKey]: {
            projectId: project.id,
            projectName: project.name,
            rootPath: project.rootPath,
            filePath,
            content: file.content,
            savedContent: file.content,
            language: file.language,
            updatedAt: file.updatedAt,
            size: file.size,
            dirty: false,
            isLoading: false,
          },
        };

        return {
          openFiles: nextOpenFiles,
          bridgeStatus: fileService.getStatus(),
          changes: syncChanges(nextOpenFiles),
        };
      });
    } catch (error) {
      set((state) => ({
        openFiles: {
          ...state.openFiles,
          [fileKey]: {
            ...state.openFiles[fileKey],
            content: '',
            savedContent: '',
            dirty: false,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Unable to read file through the active file runtime.',
          },
        },
        bridgeStatus: fileService.getStatus(),
        changes: syncChanges(state.openFiles),
      }));
    }
  },
  toggleInspector() {
    set((state) => ({ fileInspectorOpen: !state.fileInspectorOpen }));
  },
  async loadProjects() {
    const roots = normalizeProjectRoots(useSettingsStore.getState().settings.projectRoots);
    const initializedRootsKey = rootsKeyFor(roots);
    const previousSelectedProjectId = get().selectedProjectId;
    set({
      loadingProjects: true,
      loadingTree: false,
      projectError: undefined,
      projects: [],
      selectedProjectId: '',
      selectedFilePath: '',
      projectTrees: {},
      openFiles: {},
      changes: [],
    });

    const runtimeStatus = await fileService.initializeRuntime();
    set({ bridgeStatus: runtimeStatus });

    if (roots.length === 0) {
      set({
        projects: [],
        selectedProjectId: '',
        selectedFilePath: '',
        loadingProjects: false,
        projectsInitialized: true,
        initializedRootsKey,
        projectTrees: {},
        openFiles: {},
        changes: [],
        projectError: 'No project roots are configured yet. Add local Windows/WSL roots in settings to load real projects.',
      });
      return;
    }

    try {
      const projects = await fileService.listProjects({ roots });
      const selectedProjectId = projects.some((project) => project.id === previousSelectedProjectId)
        ? previousSelectedProjectId
        : projects.find((project) => project.status === 'ready')?.id ?? projects[0]?.id ?? '';

      set({
        projects,
        selectedProjectId,
        selectedFilePath: '',
        loadingProjects: false,
        projectsInitialized: true,
        initializedRootsKey,
        bridgeStatus: fileService.getStatus(),
        projectTrees: {},
        openFiles: {},
        changes: [],
        projectError: projects.length === 0 ? 'No projects matched the configured roots.' : undefined,
      });

      if (selectedProjectId) {
        await get().selectProject(selectedProjectId);
      }
    } catch (error) {
      set({
        loadingProjects: false,
        projectsInitialized: true,
        initializedRootsKey,
        bridgeStatus: fileService.getStatus(),
        projectError: error instanceof Error ? error.message : 'Unable to load configured project roots.',
      });
    }
  },
  async loadProjectTree(projectId) {
    const project = get().projects.find((item) => item.id === projectId);
    if (!project || get().projectTrees[projectId]) return;

    set({ loadingTree: true, projectError: undefined });
    try {
      const files = await fileService.listProjectTree({ projectId, rootPath: project.rootPath });
      set((state) => ({
        projectTrees: {
          ...state.projectTrees,
          [projectId]: files,
        },
        projects: updateProject(state.projects, projectId, (current) => ({
          ...current,
          files,
          activeFilePath: current.activeFilePath || firstFilePath(files),
        })),
        loadingTree: false,
        bridgeStatus: fileService.getStatus(),
        projectError: files.length === 0 ? 'This project root is available but currently empty.' : undefined,
      }));
    } catch (error) {
      set({
        loadingTree: false,
        bridgeStatus: fileService.getStatus(),
        projectError: error instanceof Error ? error.message : 'Unable to load the project tree.',
      });
    }
  },
  updateActiveFileContent(content) {
    const projectId = get().selectedProjectId;
    const filePath = get().selectedFilePath;
    if (!projectId || !filePath) return;

    const fileKey = getOpenFileKey(projectId, filePath);
    const current = get().openFiles[fileKey];
    if (!current) return;

    set((state) => {
      const nextOpenFiles = {
        ...state.openFiles,
        [fileKey]: {
          ...current,
          content,
          dirty: content !== current.savedContent,
          error: undefined,
        },
      };

      return {
        openFiles: nextOpenFiles,
        changes: syncChanges(nextOpenFiles),
      };
    });
  },
  async saveSelectedFile() {
    const filePath = get().selectedFilePath;
    if (!filePath) return;
    await get().saveFile(filePath);
  },
  async saveFile(filePath, projectId) {
    const target = findOpenFileTarget(get(), filePath, projectId);
    if (!target) return;

    const project = get().projects.find((item) => item.id === target.projectId);
    if (!project) return;

    const { fileKey, file: current } = target;

    set((state) => ({
      openFiles: {
        ...state.openFiles,
        [fileKey]: {
          ...current,
          isLoading: true,
          error: undefined,
        },
      },
    }));

    try {
      const saved = await fileService.saveFile({
        projectId: project.id,
        rootPath: project.rootPath,
        filePath,
        content: current.content,
      });

      set((state) => {
        const nextOpenFiles = {
          ...state.openFiles,
          [fileKey]: {
            ...current,
            content: saved.content,
            savedContent: saved.content,
            language: saved.language,
            updatedAt: saved.updatedAt,
            size: saved.size,
            dirty: false,
            isLoading: false,
          },
        };

        return {
          openFiles: nextOpenFiles,
          bridgeStatus: fileService.getStatus(),
          changes: syncChanges(nextOpenFiles),
        };
      });
    } catch (error) {
      set((state) => ({
        openFiles: {
          ...state.openFiles,
          [fileKey]: {
            ...current,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Unable to save file through the active file runtime.',
          },
        },
        bridgeStatus: fileService.getStatus(),
      }));
    }
  },
  resetFile(filePath, projectId) {
    const target = findOpenFileTarget(get(), filePath, projectId);
    if (!target) return;

    const { fileKey, file: current } = target;

    set((state) => {
      const nextOpenFiles = {
        ...state.openFiles,
        [fileKey]: {
          ...current,
          content: current.savedContent,
          dirty: false,
          error: undefined,
        },
      };

      return {
        openFiles: nextOpenFiles,
        changes: syncChanges(nextOpenFiles),
      };
    });
  },
  async saveDirtyFiles() {
    const dirtyFiles = Object.values(get().openFiles).filter((file) => file.dirty);
    for (const file of dirtyFiles) {
      await get().saveFile(file.filePath, file.projectId);
    }
  },
  resetDirtyFiles() {
    const dirtyFiles = Object.values(get().openFiles).filter((file) => file.dirty);
    for (const file of dirtyFiles) {
      get().resetFile(file.filePath, file.projectId);
    }
  },
  async sendFileToSession(filePath, sessionId) {
    const project = get().projects.find((item) => item.id === get().selectedProjectId);
    if (!project || !filePath) return;

    const fileKey = getOpenFileKey(project.id, filePath);
    if (!get().openFiles[fileKey]) {
      await get().selectFile(filePath);
    }

    const file = get().openFiles[fileKey];
    if (!file || file.error) return;

    await fileService.sendFileToSession({ filePath, content: file.content, sessionId });
    const message = `Use this file as session context.

Path: ${project.rootPath}/${filePath}

\`\`\`${file.language}
${file.content}
\`\`\``;
    const sessionState = useSessionStore.getState();
    if (sessionState.selectedSessionId !== sessionId) {
      sessionState.selectSession(sessionId);
    }
    await sessionState.sendMessage(message);
  },
  getOpenFile(projectId, filePath) {
    return get().openFiles[getOpenFileKey(projectId, filePath)];
  },
}));
