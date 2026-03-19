import { create } from 'zustand';
import type { ChangeItem } from '../types';
import { useProjectsStore } from './projectsStore';

interface ChangesStore {
  selectedChangeId: string;
  selectionNotice: string;
  selectChange: (changeId: string) => void;
  clearSelectionNotice: () => void;
  applySelectedChange: () => Promise<void>;
  rejectSelectedChange: () => void;
  applyChange: (changeId: string) => Promise<void>;
  rejectChange: (changeId: string) => void;
  saveAllChanges: () => Promise<void>;
  rejectAllChanges: () => void;
  syncSelection: (changes: ChangeItem[], previousChanges: ChangeItem[]) => void;
}

const findChange = (changeId: string) => useProjectsStore.getState().changes.find((change) => change.id === changeId);

const getFallbackSelection = (selectedChangeId: string, previousChanges: ChangeItem[], nextChanges: ChangeItem[]) => {
  if (nextChanges.length === 0) {
    return {
      nextSelectedChangeId: '',
      selectionNotice: selectedChangeId ? 'The reviewed change is no longer dirty. The change list is now empty.' : '',
    };
  }

  if (!selectedChangeId) {
    return {
      nextSelectedChangeId: nextChanges[0].id,
      selectionNotice: '',
    };
  }

  const previousIndex = previousChanges.findIndex((change) => change.id === selectedChangeId);
  const fallbackIndex = previousIndex >= 0 ? Math.min(previousIndex, nextChanges.length - 1) : 0;

  return {
    nextSelectedChangeId: nextChanges[fallbackIndex]?.id ?? nextChanges[0].id,
    selectionNotice: 'The reviewed change no longer exists. Selection moved to the next available dirty file.',
  };
};

export const useChangesStore = create<ChangesStore>((set, get) => ({
  selectedChangeId: '',
  selectionNotice: '',
  selectChange: (changeId) => set({ selectedChangeId: changeId, selectionNotice: '' }),
  clearSelectionNotice: () => set({ selectionNotice: '' }),
  async applySelectedChange() {
    const selectedChangeId = get().selectedChangeId;
    if (!selectedChangeId) return;
    await get().applyChange(selectedChangeId);
  },
  rejectSelectedChange() {
    const selectedChangeId = get().selectedChangeId;
    if (!selectedChangeId) return;
    get().rejectChange(selectedChangeId);
  },
  async applyChange(changeId) {
    const change = findChange(changeId);
    if (!change?.projectId) return;

    await useProjectsStore.getState().saveFile(change.filePath, change.projectId);
  },
  rejectChange(changeId) {
    const change = findChange(changeId);
    if (!change?.projectId) return;

    useProjectsStore.getState().resetFile(change.filePath, change.projectId);
  },
  async saveAllChanges() {
    await useProjectsStore.getState().saveDirtyFiles();
  },
  rejectAllChanges() {
    useProjectsStore.getState().resetDirtyFiles();
  },
  syncSelection(changes, previousChanges) {
    set((state) => {
      const selectedExists = state.selectedChangeId && changes.some((change) => change.id === state.selectedChangeId);
      if (selectedExists) {
        return state.selectionNotice ? { selectionNotice: '' } : state;
      }

      const { nextSelectedChangeId, selectionNotice } = getFallbackSelection(state.selectedChangeId, previousChanges, changes);

      if (nextSelectedChangeId === state.selectedChangeId && selectionNotice === state.selectionNotice) {
        return state;
      }

      return {
        selectedChangeId: nextSelectedChangeId,
        selectionNotice,
      };
    });
  },
}));

useProjectsStore.subscribe((state, previousState) => {
  if (state.changes === previousState.changes) return;
  useChangesStore.getState().syncSelection(state.changes, previousState.changes);
});
