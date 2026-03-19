import { create } from 'zustand';
import { useProjectsStore } from './projectsStore';

interface ChangesStore {
  selectedChangeId: string;
  selectChange: (changeId: string) => void;
  acceptChange: (changeId: string) => Promise<void>;
  rejectChange: (changeId: string) => void;
  savePatch: () => Promise<void>;
}

const findChange = (changeId: string) => useProjectsStore.getState().changes.find((change) => change.id === changeId);

export const useChangesStore = create<ChangesStore>((set) => ({
  selectedChangeId: '',
  selectChange: (changeId) => set({ selectedChangeId: changeId }),
  async acceptChange(changeId) {
    const change = findChange(changeId);
    if (!change?.projectId) return;

    const projectsState = useProjectsStore.getState();
    if (projectsState.selectedProjectId !== change.projectId) {
      await projectsState.selectProject(change.projectId);
    }
    await useProjectsStore.getState().saveFile(change.filePath);
  },
  rejectChange(changeId) {
    const change = findChange(changeId);
    if (!change?.projectId) return;

    const projectsState = useProjectsStore.getState();
    if (projectsState.selectedProjectId !== change.projectId) {
      void projectsState.selectProject(change.projectId).then(() => {
        useProjectsStore.getState().resetFile(change.filePath);
      });
      return;
    }

    projectsState.resetFile(change.filePath);
  },
  async savePatch() {
    await useProjectsStore.getState().saveDirtyFiles();
  },
}));
